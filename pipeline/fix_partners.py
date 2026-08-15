#!/usr/bin/env python3
"""Two approved, tightly-scoped writes to gff.partners.

1. CONFIDENCE -> canonical string enum (high/medium/low) on all docs.
   The original float is PRESERVED verbatim in `confidenceScore`, and
   `provenance.confidence` records the mapping, so nothing is destroyed and the
   conversion stays auditable.

   Thresholds (stated here so the choice is reviewable, not buried):
       score >= 0.80            -> 'high'
       0.50 <= score <  0.80    -> 'medium'
       score <  0.50            -> 'low'

2. LOGO FILL - sets logoUrl ONLY, and only on docs where it is currently
   null/absent and we hold a real logo for that exact name. No other field is
   written. useCases/whatTheyDo are NOT touched (held pending scratch-2's
   answer on provenance).

Usage: python3 fix_partners.py --dry-run | python3 fix_partners.py --apply
"""
import json, pathlib, sys
from collections import Counter
from pymongo import MongoClient, UpdateOne

ROOT = pathlib.Path(__file__).resolve().parent
APPLY = '--apply' in sys.argv
if not APPLY and '--dry-run' not in sys.argv:
    sys.exit('pass --dry-run or --apply')

uri = [l.split('=', 1)[1].strip() for l in (ROOT / '.env').read_text().splitlines()
       if l.startswith('MONGODB_URI=')][0]
P = MongoClient(uri, serverSelectionTimeoutMS=20000)['gff'].partners

HIGH, MED = 0.80, 0.50


def to_enum(score):
    if score >= HIGH:
        return 'high'
    if score >= MED:
        return 'medium'
    return 'low'


# ---------------------------------------------------- 1. confidence normalisation
numeric = list(P.find({'confidence': {'$type': ['double', 'int']}},
                      {'confidence': 1, 'name': 1, 'year': 1}))
print('=== 1. confidence normalisation ===')
print('docs with numeric confidence: %d' % len(numeric))
print('score distribution: %s' % sorted(Counter(round(float(d['confidence']), 2)
                                                for d in numeric).items()))
mapping = Counter((round(float(d['confidence']), 2), to_enum(float(d['confidence'])))
                  for d in numeric)
print('float -> enum mapping that will be applied:')
for (score, enum), n in sorted(mapping.items()):
    print('   %.2f -> %-6s  (%d docs)' % (score, enum, n))
strings = P.count_documents({'confidence': {'$type': 'string'}})
print('docs already string (untouched): %d' % strings)

ops1 = []
for d in numeric:
    score = float(d['confidence'])
    ops1.append(UpdateOne({'_id': d['_id']}, {'$set': {
        'confidence': to_enum(score),
        'confidenceScore': score,
        'provenance.confidence': {
            'method': 'normalised-from-numeric',
            'originalValue': score,
            'thresholds': 'high>=%.2f, medium>=%.2f, else low' % (HIGH, MED),
            'note': 'original float preserved in confidenceScore; value written '
                    'by another worker, mapped not discarded'},
    }}))

# ---------------------------------------------------- 2. logoUrl fill
mine = {p['name']: p for p in json.loads((ROOT / 'partners-2026.json').read_text())
        if not p.get('isDataArtifact')}
blank = list(P.find({'year': 2026,
                     '$or': [{'logoUrl': None}, {'logoUrl': {'$exists': False}}]},
                    {'name': 1}))
print()
print('=== 2. logoUrl fill (logoUrl ONLY, no other field) ===')
print('year-2026 docs with no logo: %d' % len(blank))
ops2, matched, unmatched = [], [], []
for d in blank:
    src = mine.get(d['name'])
    if src and src.get('logoUrl'):
        matched.append(d['name'])
        ops2.append(UpdateOne({'_id': d['_id']}, {'$set': {
            'logoUrl': src['logoUrl'],
            'provenance.logoUrl': {'method': 'gff-cms-partner-listing',
                                   'sourceUrl': src['sourceUrl']},
        }}))
    else:
        unmatched.append(d['name'])
print('will fill (exact name match, we hold a logo): %d' % len(ops2))
print('left blank (no exact-name counterpart / no logo held): %d' % len(unmatched))
if unmatched:
    print('  e.g. %s' % ', '.join(sorted(unmatched)[:12]))
    print('  NOTE: these include the 20 name-variant duplicate docs, deliberately')
    print('  left alone because they are pending the dedupe decision.')

if not APPLY:
    print('\nDRY RUN - nothing written. Re-run with --apply.')
    sys.exit(0)

r1 = P.bulk_write(ops1, ordered=False) if ops1 else None
r2 = P.bulk_write(ops2, ordered=False) if ops2 else None
print('\napplied: confidence modified=%d | logoUrl modified=%d'
      % (r1.modified_count if r1 else 0, r2.modified_count if r2 else 0))

print('\n=== verification ===')
print('numeric confidence remaining (must be 0): %d'
      % P.count_documents({'confidence': {'$type': ['double', 'int']}}))
print('confidence enum spread: %s' % sorted(Counter(
    d['confidence'] for d in P.find({}, {'confidence': 1})).items()))
print('confidenceScore preserved on: %d docs'
      % P.count_documents({'confidenceScore': {'$exists': True}}))
print('year-2026 docs still missing a logo: %d'
      % P.count_documents({'year': 2026, '$or': [{'logoUrl': None},
                                                 {'logoUrl': {'$exists': False}}]}))
print('booth non-null anywhere (must be 0): %d' % P.count_documents({'booth': {'$ne': None}}))
print('total docs (must still be 366): %d' % P.count_documents({}))
