#!/usr/bin/env python3
"""Re-scrape the 2025 GFF edition into data/archive-2025/.

ARCHIVE ONLY. Nothing this script writes may enter data/2026/, MongoDB, the RAG
corpus, the vendored app data, or the chatbot. It exists so the outreach CSVs can
be built from a current, complete 2025 snapshot instead of the partial one taken
on 2026-08-12.

2025.globalfintechfest.com is still live and is the same Next.js/Strapi stack as
the 2026 site, so extraction reuses gff_extract.py verbatim (RSC flight payload,
never rendered text).

What the 2026-08-12 snapshot missed, and this run recovers:
  - speakers: bio / linkedin / country / headshot were dropped entirely; 7 rows
    were missing; 45 bios are RSC row references that need deref().
  - partners: sourceGroup was dropped; 2 rows were missing.
  - sessions: recorded as "GFF published no retrievable 2025 agenda". That is no
    longer true - the agenda page now carries a full rawAgendaData payload.

Merge policy is top-up, never regress: a field already present in the committed
JSON is kept unless the live site has a non-empty value for it. Model-written
text on the old partner rows (whatTheyDo / useCases / confidence) has no
provenance record and is preserved under `unsourced`, never merged into the
traced columns.
"""
from __future__ import annotations
import json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gff_extract as GX
import gff_identity as GI
from gff_names import normalise_name

BASE = 'https://2025.globalfintechfest.com'
YEAR = 2025
OUT = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'archive-2025'
CACHE = pathlib.Path(__file__).resolve().parent / '.cache' / 'archive-2025'


def load(name):
    p = OUT / ('%s-2025.json' % name)
    return json.loads(p.read_text()) if p.exists() else []


def prefer(old, new):
    """Top-up: the live value wins only when it actually says something."""
    return new if new not in (None, '', []) else old


def main():
    stamp = GX.now()
    pages = GX.fetch(CACHE, base=BASE)
    payload = {k: GX.flight(v) for k, v in pages.items()}

    # ---- sessions -------------------------------------------------------
    sessions = GX.extract_sessions(payload['agenda'], year=YEAR, base=BASE)
    for s in sessions:
        s['description'] = GX.deref(payload['agenda'], s['description'])
        s['extractedAt'] = stamp

    # ---- speakers -------------------------------------------------------
    speakers = GX.extract_speakers(payload['speakers'], sessions, year=YEAR, base=BASE)
    raw = {}
    for o in GX.grab(payload['speakers'], 'data'):
        nm = GX.clean(o.get('fullName'))
        if nm:
            raw.setdefault(normalise_name(nm), o)
    for s in speakers:
        s['bio'] = GX.deref(payload['speakers'], s['bio'])
        s['speakerCategory'] = GX.clean((raw.get(s['nameKey']) or {}).get('speakerType'))
        # The 2025 CMS serves headshot paths relative to its own origin ("/media/...")
        # where the 2026 one serves absolute URLs, so extract_speakers has nothing to
        # prefix with. Absolutise here, or every headshot cell in the CSV is a dead link.
        if s['headshotUrl'] and s['headshotUrl'].startswith('/'):
            s['headshotUrl'] = BASE + s['headshotUrl']
        s['extractedAt'] = stamp

    old_speakers = {normalise_name(s['name']): s for s in load('speakers')}
    live_keys = {s['nameKey'] for s in speakers}
    # The committed rows store salutation+name as one string, while extract_speakers
    # keys off fullName alone. Where the CMS split a multi-word honorific across both
    # fields ("The" + "Rt Hon Sir Keir Starmer"), the two keys differ by a leading word
    # gff_names does not know. Peel up to three leading tokens to find the live row
    # rather than emit a duplicate archive entry. Front-only, and only when the peeled
    # form hits an actual live key, so it cannot merge two different people.
    for k in [k for k in old_speakers if k not in live_keys]:
        parts = k.split()
        for i in (1, 2, 3):
            if len(parts) > i + 1 and ' '.join(parts[i:]) in live_keys:
                old_speakers[' '.join(parts[i:])] = old_speakers.pop(k)
                break

    for s in speakers:
        prev = old_speakers.pop(s['nameKey'], None)
        if prev:
            for k in ('title', 'org', 'sessionTitle'):
                s[k] = prefer(prev.get(k), s.get(k))
    # A row in the committed snapshot that the live site no longer serves is
    # kept (never regress), tagged so the CSV shows why it has no fresh stamp.
    for leftover in old_speakers.values():
        leftover.setdefault('nameKey', normalise_name(leftover['name']))
        leftover['notInLatestFetch'] = True
        speakers.append(leftover)
    speakers.sort(key=lambda s: s['name'].lower())

    # ---- partners -------------------------------------------------------
    groups = GX.grab(payload['partners'], 'partnerData')
    partners = GX.extract_partners(payload['partners'], year=YEAR, base=BASE)
    also = {}
    for g, items in groups.items():
        for o in items:
            nm = GX.clean(o.get('altText'))
            if nm:
                also.setdefault(nm.lower(), []).append(g)
    old_partners = {p['name'].lower(): p for p in load('partners')}
    for p in partners:
        p['canonicalName'] = GI.canonical_name(p['name'])
        p['isDataArtifact'] = GI.is_artifact(p['name'], p['slug'])
        seen_in = also.get(p['name'].lower(), [])
        p['alsoListedIn'] = [g for g in seen_in if g != p['sourceGroup']]
        prev = old_partners.pop(p['name'].lower(), None)
        p['unsourced'] = {}
        if prev:
            p['website'] = prefer(prev.get('website'), p['website'])
            # No GFF field carries a partner description; anything in the old
            # snapshot was model-written with no provenance recorded. Read both
            # the pre-move shape and the post-move one so a re-run is idempotent
            # instead of silently dropping the text on the second pass.
            was = prev.get('unsourced') or {}
            for k in ('whatTheyDo', 'useCases'):
                v = prev.get(k) or was.get(k)
                if v:
                    p['unsourced'][k] = v
            # The old snapshot's `confidence` is only meaningful as the writer's
            # confidence in that prose, so it is carried only where prose exists.
            # On a row with no unsourced text it would label nothing.
            if p['unsourced']:
                conf = prev.get('confidence') or was.get('confidence')
                if conf:
                    p['unsourced']['confidence'] = conf
        p['whatTheyDo'] = None      # traced column stays empty: GFF publishes none
        p['useCases'] = []
        p['extractedAt'] = stamp
    for leftover in old_partners.values():
        leftover['notInLatestFetch'] = True
        leftover['canonicalName'] = GI.canonical_name(leftover['name'])
        leftover['isDataArtifact'] = GI.is_artifact(leftover['name'], leftover.get('slug', ''))
        was = leftover.get('unsourced') or {}
        leftover['unsourced'] = {k: (leftover.get(k) or was.get(k))
                                 for k in ('whatTheyDo', 'useCases')
                                 if leftover.get(k) or was.get(k)}
        if leftover['unsourced'] and (leftover.get('confidence') or was.get('confidence')):
            leftover['unsourced']['confidence'] = leftover.get('confidence') or was.get('confidence')
        leftover['whatTheyDo'], leftover['useCases'] = None, []
        partners.append(leftover)
    partners.sort(key=lambda p: p['name'].lower())

    OUT.mkdir(parents=True, exist_ok=True)
    for name, rows in [('speakers', speakers), ('partners', partners), ('sessions', sessions)]:
        (OUT / ('%s-2025.json' % name)).write_text(json.dumps(rows, indent=2, ensure_ascii=False) + '\n')
        print('%-9s %4d rows' % (name, len(rows)))


if __name__ == '__main__':
    main()
