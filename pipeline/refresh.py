#!/usr/bin/env python3
"""GFF 2026 refresh pipeline - one command, safe to re-run.

    python3 refresh.py --dry-run      # scrape + diff, write NOTHING
    python3 refresh.py --apply        # scrape + diff + upsert into Atlas

See REFRESH.md for the event-morning runbook.

WHAT IT GUARANTEES
  Idempotent      Upserts keyed on stable identities. Re-running against an
                  unchanged site creates 0 new documents and reports 0 added,
                  0 disappeared, 0 changed. Note the `modified` count is NOT
                  zero on a no-op run: every seen doc gets a fresh lastSeenAt
                  stamp, which is deliberate (it is how we know the record was
                  re-confirmed rather than merely still sitting there). Judge
                  idempotency by the diff and the doc counts, not by `modified`.
  Never duplicates Partner names are canonicalised through identity-map.json,
                  so a re-scrape of "ElevenLabs" folds into "Eleven Labs"
                  instead of creating a second card.
  Never resurrects The 3 CMS logo artifacts are dropped every run. The 20
                  deduped name variants can never come back as their own docs.
  Never downgrades Traced text is never overwritten by weaker data. An
                  unsourced or empty incoming value cannot replace a traced
                  one, and provenance is preserved.
  Disappearance   Anything that vanishes from the live site is marked
                  status='withdrawn' with a timestamp, NOT deleted - an
                  attendee needs to know a session was pulled.
  Invariants      booth non-null, year isolation, distinct partner count and
                  unlabelled provenance are all re-asserted after the run and
                  the run FAILS LOUDLY if any regress.
"""
from __future__ import annotations
import json, sys, pathlib, datetime, argparse
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import gff_extract as GX
from gff_names import normalise_name
from gff_identity import canonical_name, is_artifact, company_keys

STAMP = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
NOW = GX.now()
SNAP = ROOT / 'snapshots' / STAMP
YEAR = 2026

# Identities used for upsert. Chosen for stability across re-scrapes.
# agendaCode is the ONLY stable session identity. (title, day, year) was fine
# for a one-off load but is WRONG for refresh: GFF reschedules sessions, and a
# day change made one session look like a withdrawal plus a brand-new session.
# Measured on two scrapes 90 minutes apart, the title/day key reported 7 added
# and 9 disappeared where the truth was 0 added and 2 withdrawn. False
# withdrawals are the worst possible error for an agenda companion.
KEYS = {
    'sessions': ('agendaCode', 'year'),     # unique 254/254, survives retiming
    'speakers': ('nameKey', 'year'),        # normalised, salutation-proof
    'partners': ('name', 'year'),           # canonicalised before use
}
# If the CMS ever ships a session without an agendaCode we fall back rather
# than silently grouping every code-less session under a null key.
FALLBACK_KEYS = {'sessions': ('title', 'day', 'year')}


def log(msg):
    print(msg, flush=True)


# --------------------------------------------------------------------- scrape
def scrape(use_cache=None):
    if use_cache:
        d = pathlib.Path(use_cache)
        log('using cached pages from %s' % d)
        paths = {n: d / ('%s.html' % n) for n in GX.PAGES}
    else:
        log('fetching live pages from %s ...' % GX.BASE)
        paths = GX.fetch(SNAP / 'pages')
    payloads = {n: GX.flight(p) for n, p in paths.items()}
    sessions = GX.extract_sessions(payloads['agenda'])
    speakers = GX.extract_speakers(payloads['speakers'], sessions)
    partners_raw = GX.extract_partners(payloads['partners'])

    # canonicalise + drop artifacts so a re-scrape cannot undo earlier decisions
    partners, dropped, folded = [], [], []
    byname = {}
    for p in partners_raw:
        if is_artifact(p['name'], p['slug']):
            dropped.append(p['name'])
            continue
        canon = canonical_name(p['name'])
        if canon != p['name']:
            folded.append('%s -> %s' % (p['name'], canon))
            p['aliases'] = sorted(set((p.get('aliases') or []) + [p['name']]))
            p['name'] = canon
            p['slug'] = GX.slugify(canon)
        if p['name'] in byname:            # same canonical twice in one scrape
            folded.append('%s (in-scrape duplicate)' % p['name'])
            continue
        byname[p['name']] = p
        partners.append(p)

    log('scraped: %d sessions, %d speakers, %d partners '
        '(artifacts dropped %d, variants folded %d)'
        % (len(sessions), len(speakers), len(partners), len(dropped), len(folded)))
    if dropped:
        log('   artifacts dropped: %s' % ', '.join(sorted(dropped)))
    if folded:
        log('   variants folded:   %s' % '; '.join(sorted(folded)))
    return sessions, speakers, partners


# ----------------------------------------------------------------------- diff
def key_of(doc, coll):
    ks = KEYS[coll]
    vals = tuple(doc.get(k) for k in ks)
    if any(v is None for v in vals) and coll in FALLBACK_KEYS:
        return ('__fallback__',) + tuple(doc.get(k) for k in FALLBACK_KEYS[coll])
    return vals


def filter_of(doc, coll):
    """Upsert filter matching key_of, including the fallback form."""
    k = key_of(doc, coll)
    if k and k[0] == '__fallback__':
        return {kk: doc.get(kk) for kk in FALLBACK_KEYS[coll]}
    return {kk: doc.get(kk) for kk in KEYS[coll]}


SESSION_WATCH = ['title', 'day', 'startTime', 'endTime', 'hall', 'format',
                 'track', 'description', 'accessType']
RESCHEDULE_FIELDS = {'day', 'startTime', 'endTime', 'hall'}


def diff(coll, incoming, existing):
    """Compare incoming scrape against what Atlas holds. Returns a report dict."""
    ex = {key_of(d, coll): d for d in existing}
    inc = {key_of(d, coll): d for d in incoming}
    added = [inc[k] for k in inc if k not in ex]
    gone = [ex[k] for k in ex if k not in inc
            and ex[k].get('status') != 'withdrawn']
    changed = []
    if coll == 'sessions':
        for k in set(inc) & set(ex):
            deltas = {f: [ex[k].get(f), inc[k].get(f)] for f in SESSION_WATCH
                      if (ex[k].get(f) or None) != (inc[k].get(f) or None)}
            # speaker line-up changes matter for an agenda companion
            a = sorted(ex[k].get('speakerNames') or [])
            b = sorted(inc[k].get('speakerNames') or [])
            if a != b:
                deltas['speakerNames'] = {'added': [x for x in b if x not in a],
                                          'removed': [x for x in a if x not in b]}
            if deltas:
                changed.append({'title': inc[k]['title'], 'day': inc[k].get('day'),
                                'agendaCode': inc[k].get('agendaCode'),
                                'rescheduled': bool(RESCHEDULE_FIELDS & set(deltas)),
                                'retitled': 'title' in deltas,
                                'changes': deltas})
    return {'collection': coll, 'incoming': len(inc), 'existing': len(ex),
            'added': added, 'disappeared': gone, 'changed': changed}


def summarise(reports):
    lines = ['GFF 2026 refresh diff - %s' % NOW, '=' * 60]
    for r in reports:
        lines.append('')
        extra = ''
        if r['collection'] == 'sessions':
            extra = '  rescheduled=%d  retitled=%d' % (
                sum(1 for c in r['changed'] if c.get('rescheduled')),
                sum(1 for c in r['changed'] if c.get('retitled')))
        lines.append('%s: live=%d  in-db=%d  added=%d  disappeared=%d  changed=%d%s'
                     % (r['collection'].upper(), r['incoming'], r['existing'],
                        len(r['added']), len(r['disappeared']), len(r['changed']), extra))
        for d in r['added'][:40]:
            lines.append('   + %s' % (d.get('title') or d.get('name')))
        if len(r['added']) > 40:
            lines.append('   + ... %d more' % (len(r['added']) - 40))
        for d in r['disappeared']:
            lines.append('   - DISAPPEARED: %s%s' % (
                d.get('title') or d.get('name'),
                ' (%s %s)' % (d.get('day', ''), d.get('startTime', '')) if d.get('day') else ''))
        for c in r['changed'][:60]:
            for f, v in c['changes'].items():
                if f == 'speakerNames':
                    if v['added']:
                        lines.append('   ~ %s: speakers added %s' % (c['title'][:48], v['added']))
                    if v['removed']:
                        lines.append('   ~ %s: speakers removed %s' % (c['title'][:48], v['removed']))
                else:
                    lines.append('   ~ %s: %s %r -> %r' % (c['title'][:48], f, v[0], v[1]))
    return '\n'.join(lines)


# ---------------------------------------------------------------------- write
TRACED = {'direct-meta-description', 'apify:apify/website-content-crawler',
          'curated-public-facts', 'phrase-match:whatTheyDo', 'traced'}


def is_traced(doc, field):
    return ((doc.get('provenance') or {}).get(field) or {}).get('method') in TRACED


def build_ops(coll, incoming, existing):
    """Upserts that never downgrade traced text and never delete."""
    from pymongo import UpdateOne
    ex = {key_of(d, coll): d for d in existing}
    ops = []
    for d in incoming:
        k = key_of(d, coll)
        cur = ex.get(k)
        doc = dict(d)
        if coll == 'partners' and cur:
            # protect enriched/traced fields from being blanked by a re-scrape
            for f in ('whatTheyDo', 'useCases', 'category', 'confidence'):
                if f in doc:
                    doc.pop(f)
            for f in ('provenance', 'unsourced', 'confidenceScore', 'isDataArtifact'):
                doc.pop(f, None)
            merged_aliases = sorted(set((cur.get('aliases') or []) +
                                        (doc.get('aliases') or [])))
            if merged_aliases:
                doc['aliases'] = merged_aliases
        doc['lastSeenAt'] = NOW
        doc['status'] = 'active'
        ops.append(UpdateOne(filter_of(d, coll), {'$set': doc}, upsert=True))

    # soft-withdraw anything that vanished - never delete
    inc_keys = {key_of(d, coll) for d in incoming}
    for k, d in ex.items():
        if k not in inc_keys and d.get('status') != 'withdrawn':
            ops.append(UpdateOne({'_id': d['_id']}, {'$set': {
                'status': 'withdrawn', 'withdrawnDetectedAt': NOW}}))
    return ops


# ------------------------------------------------------------------ invariants
def assert_invariants(db, expected_partners):
    problems, checks = [], []

    def chk(label, ok, detail=''):
        checks.append('%-52s %s %s' % (label, 'OK' if ok else 'FAIL', detail))
        if not ok:
            problems.append(label)

    P = db.partners
    chk('booth non-null == 0', P.count_documents({'booth': {'$ne': None}}) == 0)
    chk('boothSource non-null == 0', P.count_documents({'boothSource': {'$ne': None}}) == 0)
    for c in ('partners', 'sessions', 'speakers'):
        n = db[c].count_documents({'$or': [{'year': None}, {'year': {'$exists': False}}]})
        chk('%s: no doc missing year' % c, n == 0, '(%d)' % n)
        n = db[c].count_documents({'year': {'$type': 'string'}})
        chk('%s: year never a string' % c, n == 0, '(%d)' % n)
    n = P.count_documents({'year': 2026, 'sourceUrl': {'$regex': r'2025\.'}})
    chk('no 2026 partner cites the 2025 site', n == 0, '(%d)' % n)

    active = list(P.find({'year': 2026, 'status': {'$ne': 'withdrawn'}}, {'name': 1}))
    chk('distinct active partners == %d' % expected_partners,
        len(active) == expected_partners, '(%d)' % len(active))
    seen, dupes = {}, []
    for d in active:
        for k in company_keys(d['name']):
            if k in seen and seen[k] != d['name']:
                dupes.append('%s ~ %s' % (d['name'], seen[k]))
                break
        else:
            for k in company_keys(d['name']):
                seen[k] = d['name']
    chk('no duplicate partner identities', not dupes, str(dupes[:4]))
    for nm in json.loads((ROOT / 'identity-map.json').read_text())['artifactNames']:
        chk('artifact absent: %s' % nm, P.count_documents({'name': nm, 'year': 2026}) == 0)
    n = P.count_documents({'year': 2026, 'whatTheyDo': {'$nin': [None, '']},
                           'provenance.whatTheyDo': {'$exists': False}})
    chk('no unlabelled whatTheyDo', n == 0, '(%d)' % n)
    n = P.count_documents({'year': 2026, 'useCases.0': {'$exists': True},
                           'provenance.useCases': {'$exists': False}})
    chk('no unlabelled useCases', n == 0, '(%d)' % n)
    n = db.sessions.count_documents({'year': {'$ne': 2026}})
    chk('sessions contain only 2026', n == 0, '(%d)' % n)
    n = db.speakers.count_documents({'year': {'$ne': 2026}})
    chk('speakers contain only 2026', n == 0, '(%d)' % n)
    return checks, problems


# ------------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--apply', action='store_true')
    g.add_argument('--dry-run', action='store_true')
    ap.add_argument('--use-cache', help='reuse previously downloaded pages (debug)')
    a = ap.parse_args()

    SNAP.mkdir(parents=True, exist_ok=True)
    sessions, speakers, partners = scrape(a.use_cache)

    # hard pre-write invariant: no booth may ever enter the corpus
    for p in partners:
        assert p['booth'] is None and p['boothSource'] is None, 'booth leaked: ' + p['name']

    for name, data in (('sessions', sessions), ('speakers', speakers), ('partners', partners)):
        (SNAP / ('%s-2026.json' % name)).write_text(json.dumps(data, indent=1, ensure_ascii=False))

    import pathlib as _p
    uri = [l.split('=', 1)[1].strip() for l in (ROOT / '.env').read_text().splitlines()
           if l.startswith('MONGODB_URI=')][0]
    from pymongo import MongoClient
    db = MongoClient(uri, serverSelectionTimeoutMS=20000)['gff']

    reports = []
    for coll, data in (('sessions', sessions), ('speakers', speakers), ('partners', partners)):
        existing = list(db[coll].find({'year': YEAR}))
        reports.append(diff(coll, data, existing))
    text = summarise(reports)
    (SNAP / 'diff.txt').write_text(text)
    (SNAP / 'diff.json').write_text(json.dumps(
        [{k: (v if k not in ('added', 'disappeared') else
              [{kk: d.get(kk) for kk in ('title', 'name', 'day', 'startTime', 'hall', 'agendaCode')}
               for d in v]) for k, v in r.items()} for r in reports],
        indent=1, ensure_ascii=False, default=str))
    log('\n' + text)
    log('\nsnapshot + diff written to %s' % SNAP)

    if a.dry_run:
        log('\nDRY RUN - Atlas not modified.')
        return 0

    total_mod = total_ins = 0
    for coll, data in (('sessions', sessions), ('speakers', speakers), ('partners', partners)):
        existing = list(db[coll].find({'year': YEAR}))
        ops = build_ops(coll, data, existing)
        if ops:
            r = db[coll].bulk_write(ops, ordered=False)
            total_ins += r.upserted_count
            total_mod += r.modified_count
            log('%-9s upserted=%d modified=%d' % (coll, r.upserted_count, r.modified_count))
    log('totals: inserted=%d modified=%d' % (total_ins, total_mod))

    log('\n=== INVARIANTS ===')
    checks, problems = assert_invariants(db, len(partners))
    for c in checks:
        log('  ' + c)
    if problems:
        log('\nREFRESH FAILED - %d invariant(s) regressed: %s' % (len(problems), problems))
        return 1
    log('\nall invariants hold.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
