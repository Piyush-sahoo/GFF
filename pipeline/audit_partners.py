#!/usr/bin/env python3
"""Audit gff.partners: provenance of the pre-existing docs, and near-duplicate
detection between them and our authoritative extraction.

Read-only. Writes nothing to Atlas.
"""
import json, pathlib, re, sys
from collections import Counter, defaultdict
from pymongo import MongoClient

ROOT = pathlib.Path(__file__).resolve().parent
uri = [l.split('=', 1)[1].strip() for l in (ROOT / '.env').read_text().splitlines()
       if l.startswith('MONGODB_URI=')][0]
db = MongoClient(uri, serverSelectionTimeoutMS=20000)['gff']
P = db.partners

mine = json.loads((ROOT / 'partners-2026.json').read_text())
mine_real = [p for p in mine if not p.get('isDataArtifact')]

# Discriminator: scratch-2 wrote confidence as a float, we write a string enum.
# (An earlier attempt keyed on the absence of `provenance`, which wrongly pulled
# in 22 of OUR docs whose whatTheyDo is null and so never got a provenance object.)
theirs = list(P.find({'year': 2026, 'confidence': {'$type': ['double', 'int']}}))
ours_db = P.count_documents({'year': 2026, 'confidence': {'$type': 'string'}})
print('discriminator check: theirs(float)=%d ours(string)=%d total2026=%d'
      % (len(theirs), ours_db, P.count_documents({'year': 2026})))

print('=' * 72)
print('1. PROVENANCE AUDIT of the %d pre-existing year-2026 docs' % len(theirs))
print('=' * 72)
keys = Counter()
for d in theirs:
    for k in d:
        keys[k] += 1
print('fields present (field: count of %d docs):' % len(theirs))
for k, v in sorted(keys.items(), key=lambda kv: -kv[1]):
    print('   %-16s %d' % (k, v))

PROV_FIELDS = ['provenance', 'method', 'sourceUrl', 'source', 'sources', 'evidence',
               'citation', 'citations', 'derivedFrom', 'extractionMethod',
               'useCasesSource', 'whatTheyDoSource', 'fetchedAt', 'retrievedAt']
print('\nprovenance-bearing fields:')
for f in PROV_FIELDS:
    n = sum(1 for d in theirs if f in d and d[f] not in (None, '', [], {}))
    print('   %-18s %s' % (f, n if n else 'ABSENT'))

# Does sourceUrl point at anything per-useCase, or just the generic listing page?
su = Counter(d.get('sourceUrl') for d in theirs)
print('\nsourceUrl values (distinct=%d):' % len(su))
for v, n in su.most_common(5):
    print('   %-60s %d' % (str(v)[:60], n))
print('\nper-useCase citation: %s' % (
    'PRESENT' if any(isinstance(d.get('useCases'), list) and d['useCases']
                     and isinstance(d['useCases'][0], dict) for d in theirs)
    else 'ABSENT - useCases are bare strings with no individual source'))
print('confidence type: %s' % Counter(type(d.get('confidence')).__name__ for d in theirs).most_common())
uc_counts = Counter(len(d.get('useCases') or []) for d in theirs)
print('useCases per doc: %s' % sorted(uc_counts.items()))
print('whatTheyDo populated: %d/%d | logoUrl populated: %d/%d' % (
    sum(1 for d in theirs if d.get('whatTheyDo')), len(theirs),
    sum(1 for d in theirs if d.get('logoUrl')), len(theirs)))

# ---------------------------------------------------------------- duplicates
print()
print('=' * 72)
print('2. NAME-VARIANT / DUPLICATE DETECTION')
print('=' * 72)

LEGAL = r'''\b(pvt|private|ltd|limited|llp|llc|inc|incorporated|corp|corporation|co|
company|plc|gmbh|sa|nv|bv|ag|holdings?|group|india|bharat|technologies|technology|
tech|solutions|services|systems|labs|software|global|international|worldwide|
enterprises?|ventures?|capital|fintech|digital|payments?|the)\b'''


def cnorm(s, strip_legal=True):
    """Canonical company key. Two tiers: exact (punct/case/spacing only) and
    loose (also drops legal-entity and filler tokens)."""
    s = (s or '').lower()
    s = re.sub(r'&', ' and ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    if strip_legal:
        s = re.sub(LEGAL, ' ', s, flags=re.X)
    return re.sub(r'\s+', ' ', s).strip()


mine_exact = {cnorm(p['name'], False): p['name'] for p in mine_real}
mine_loose = defaultdict(list)
for p in mine_real:
    mine_loose[cnorm(p['name'])].append(p['name'])

only_theirs = [d for d in theirs if cnorm(d['name'], False) not in mine_exact]
print('their docs whose name is NOT an exact match in our extraction: %d' % len(only_theirs))

dupes, genuinely_new = [], []
for d in only_theirs:
    k = cnorm(d['name'])
    if k and k in mine_loose:
        dupes.append((d['name'], mine_loose[k]))
    else:
        genuinely_new.append(d)

print('\n--- A) NAME-VARIANT DUPLICATES (%d) - same company, will render twice ---' % len(dupes))
for their, ours in sorted(dupes):
    print('   %-42s <-> %s' % (their, ', '.join(ours)))

print('\n--- B) NOT IN OUR EXTRACTION AT ALL (%d) ---' % len(genuinely_new))
for d in sorted(genuinely_new, key=lambda x: x['name']):
    print('   %-42s tier=%s website=%s' % (
        d['name'][:42], str(d.get('tier'))[:28], str(d.get('website'))[:40]))

# duplicates WITHIN the whole 2026 set, regardless of author
print('\n--- C) loose-key collisions across ALL year-2026 docs in Atlas ---')
allk = defaultdict(list)
for d in P.find({'year': 2026}, {'name': 1, 'confidence': 1}):
    allk[cnorm(d['name'])].append(
        '%s%s' % (d['name'], ' [scratch-2]' if isinstance(d.get('confidence'), float)
                  else ' [ours]'))
coll = {k: v for k, v in allk.items() if len(v) > 1}
print('colliding keys: %d' % len(coll))
for k, v in sorted(coll.items()):
    print('   %-28s %s' % (k[:28], ' | '.join(v)))

# ---------------------------------------------------------------- year hygiene
print()
print('=' * 72)
print('3. YEAR ISOLATION')
print('=' * 72)
tot = P.count_documents({})
by_year = Counter(d.get('year') for d in P.find({}, {'year': 1}))
print('total docs: %d | by year: %s' % (tot, sorted(by_year.items(), key=lambda x: str(x[0]))))
missing = P.count_documents({'$or': [{'year': None}, {'year': {'$exists': False}}]})
print('docs with missing/null year (would be invisible to a year filter): %d' % missing)
print('year as string not int: %d' % P.count_documents({'year': {'$type': 'string'}}))
print('sum of per-year counts == total: %s' % (sum(by_year.values()) == tot))
q2026 = P.count_documents({'year': 2026})
leak = P.count_documents({'year': 2026, 'sourceUrl': {'$regex': '2025\\.'}})
print('query {year:2026} returns %d docs; of those, sourceUrl pointing at the 2025 site: %d'
      % (q2026, leak))
for c in ('sessions', 'speakers'):
    yy = Counter(d.get('year') for d in db[c].find({}, {'year': 1}))
    print('%s by year: %s' % (c, sorted(yy.items(), key=lambda x: str(x[0]))))
