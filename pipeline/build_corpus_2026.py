#!/usr/bin/env python3
"""Build the GFF 2026 sessions + speakers corpus (widened schema).

This output is the BUILD INPUT for the attendee agenda companion (static-first:
the app prerenders sessions and only reads Atlas on rebuild), so it is emitted
clean, complete and deterministically sorted.

Source: RSC flight payloads already downloaded from www.globalfintechfest.com
(no network access here). Sessions come from `rawAgendaData`, speakers from the
/speakers `data` array.

Not emitted, deliberately:
  session_sub_hall            empty string on all 256 records
  x/twitter/facebook/instagram empty on all 487 records
An always-blank field invites a feature that cannot be built; absent is clearer.
"""
import json, re, sys, pathlib, datetime
from collections import Counter
from gff_names import normalise_name, split_agenda_speaker

SCRATCH = pathlib.Path('/private/tmp/claude-501/-Users-piyuzz--ao-data-worktrees-scratch-workers-scratch-4/f088d57b-f69d-5b9d-87b1-adfc16b43aa4/scratchpad')
OUT = pathlib.Path(__file__).resolve().parent
BASE = 'https://www.globalfintechfest.com'
YEAR = 2026
dec = json.JSONDecoder()


def grab(path, key):
    t = (SCRATCH / path).read_text(encoding='utf-8')
    i = t.find('"%s":' % key)
    if i == -1:
        raise SystemExit('key %s not found in %s' % (key, path))
    j = i + len('"%s":' % key)
    while t[j] in ' \n':
        j += 1
    v, _ = dec.raw_decode(t, j)
    return v


def clean(v):
    if v is None:
        return None
    v = re.sub(r'\s+', ' ', str(v)).strip()
    return v or None


# ---------------------------------------------------------------- sessions
raw = grab('26-agenda.flight.txt', 'rawAgendaData')
sessions = []
for o in raw:
    title = clean(o.get('session_name'))
    if not title:
        continue

    speakers_raw, speaker_names = [], []
    for n in range(1, 16):
        v = clean(o.get('session_speakers_%02d' % n))
        if not v:
            continue
        speakers_raw.append(v)
        nm, _, _ = split_agenda_speaker(v)
        if nm:
            speaker_names.append(nm)

    hosts_raw, host_names = [], []
    for n in range(1, 6):
        v = clean(o.get('session_host_%02d' % n))
        if not v:
            continue
        hosts_raw.append(v)
        nm, _, _ = split_agenda_speaker(v)
        if nm:
            host_names.append(nm)

    topics = [clean(x.get('name')) for x in (o.get('session_topics') or []) if isinstance(x, dict)]
    topics = [t for t in topics if t]
    access = clean(o.get('session_access_type'))

    sessions.append({
        'agendaCode': clean(o.get('agenda_code')),
        'documentId': clean(o.get('documentId')),
        'title': title,
        'description': clean(o.get('session_desc')),
        'track': ', '.join(topics) if topics else None,
        'topics': topics,
        'format': clean(o.get('session_format')),
        'day': clean(o.get('session_date')),
        'startTime': clean(o.get('session_start_time')),
        'endTime': clean(o.get('session_end_time')),
        'hall': clean(o.get('session_hall')),
        'accessType': access,
        # Surfaced as a flag so the app decides visibility; nothing is filtered here.
        'isClosedDoor': bool(access and access.lower() != 'public'),
        'speakerNames': speaker_names,          # normalised-joinable person names
        'speakersRaw': speakers_raw,            # original "Name, Designation, Org"
        'hostNames': host_names,
        'hostsRaw': hosts_raw,
        'speakers': speaker_names + host_names,  # back-compat with agreed schema
        'year': YEAR,
        'sourceUrl': BASE + '/agenda',
    })

sessions.sort(key=lambda s: (s['day'] or '', s['startTime'] or '', s['hall'] or '', s['title']))

# ---------------------------------------------------------------- speakers
sp = grab('26-speakers.flight.txt', 'data')

# name -> earliest session, for sessionTitle backfill
by_key = {}
for s in sessions:
    for nm in s['speakerNames'] + s['hostNames']:
        by_key.setdefault(normalise_name(nm), []).append(s)

speakers = []
for o in sp:
    nm = clean(o.get('fullName'))
    if not nm:
        continue
    sal = clean(o.get('salutation'))
    img = o.get('image') if isinstance(o.get('image'), dict) else {}
    ctry = o.get('country') if isinstance(o.get('country'), dict) else {}
    key = normalise_name(nm)
    mine = by_key.get(key, [])
    speakers.append({
        'name': ((sal + ' ' + nm) if sal else nm),
        'nameKey': key,                       # join key, precomputed for the app
        'title': clean(o.get('desgination')),
        'org': clean(o.get('companyName')),
        'sessionTitle': mine[0]['title'] if mine else None,
        'sessionCodes': sorted({m['agendaCode'] for m in mine if m['agendaCode']}),
        'headshotUrl': clean(img.get('url')),
        'bio': clean(o.get('bio')),
        'country': clean(ctry.get('country')),
        'linkedin': clean(o.get('linkedinProfile')),
        'year': YEAR,
        'sourceUrl': BASE + '/speakers',
    })

# dedupe on join key, keep the richer record
best = {}
for s in speakers:
    k = s['nameKey']
    cur = best.get(k)
    score = sum(1 for f in ('bio', 'headshotUrl', 'linkedin', 'sessionTitle') if s.get(f))
    if not cur or score > cur[0]:
        best[k] = (score, s)
speakers = [v[1] for v in best.values()]
speakers.sort(key=lambda s: s['name'])

# ------------------------------------------------- join report (no silent drops)
directory = {s['nameKey'] for s in speakers if s['nameKey']}
agenda_keys = {}
for s in sessions:
    for nm in s['speakerNames'] + s['hostNames']:
        agenda_keys.setdefault(normalise_name(nm), set()).add(nm)
unmatched = sorted(k for k in agenda_keys if k and k not in directory)
report = {
    'year': YEAR,
    'builtAt': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'distinctAgendaSpeakerNames': len(agenda_keys),
    'matchedToSpeakerDirectory': len(agenda_keys) - len(unmatched),
    'naiveEqualityJoinWouldMatch': len(
        {nm for v in agenda_keys.values() for nm in v} & {s['name'] for s in speakers}),
    'unmatchedNames': [
        {'nameKey': k, 'asWrittenInAgenda': sorted(agenda_keys[k]),
         'note': 'appears in /agenda but has no record in /speakers; retained on the '
                 'session, not dropped'}
        for k in unmatched],
    'normalisation': 'gff_names.normalise_name — strips salutations/suffixes/accents; '
                     'see test_gff_names.py which pins the join rate',
}

(OUT / 'sessions-2026.json').write_text(json.dumps(sessions, indent=1, ensure_ascii=False))
(OUT / 'speakers-2026.json').write_text(json.dumps(speakers, indent=1, ensure_ascii=False))
(OUT / 'join-report-2026.json').write_text(json.dumps(report, indent=1, ensure_ascii=False))

f = lambda xs, k: sum(1 for x in xs if x.get(k))
print('sessions %d' % len(sessions))
for k in ('startTime', 'endTime', 'day', 'hall', 'format', 'accessType', 'agendaCode',
          'documentId', 'track', 'description', 'speakerNames'):
    print('   %-14s %d/%d' % (k, f(sessions, k), len(sessions)))
print('   closed-door    %d' % sum(1 for s in sessions if s['isClosedDoor']))
print('   days           %s' % sorted(Counter(s['day'] for s in sessions).items()))
print('   formats        %d distinct' % len({s['format'] for s in sessions if s['format']}))
print('speakers %d' % len(speakers))
for k in ('headshotUrl', 'bio', 'country', 'linkedin', 'sessionTitle', 'title', 'org'):
    print('   %-14s %d/%d' % (k, f(speakers, k), len(speakers)))
print('join: %d/%d matched | naive equality join: %d | unmatched: %s'
      % (report['matchedToSpeakerDirectory'], report['distinctAgendaSpeakerNames'],
         report['naiveEqualityJoinWouldMatch'], [u['nameKey'] for u in report['unmatchedNames']]))
