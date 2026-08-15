#!/usr/bin/env python3
"""Dedupe gff.partners year-2026 to 316 docs and apply the trust model.

DECISIONS IMPLEMENTED
  Canonical name  = OURS (faithful to the GFF CMS altText). The other spelling
                    is retained in aliases[] so a search for "ElevenLabs" still
                    finds "Eleven Labs".
  Displayed text  = traced value wins. scratch-2's unsourced text is never
                    deleted: it moves to unsourced.{whatTheyDo,useCases} with
                    method='unsourced', confidence='low'.
                    Where we hold NO traced text, their text stays as the
                    displayed value but is explicitly marked unsourced/low so
                    the app can decide whether to show it.
  Field fill      = any field we lack is filled from their doc.
  Never deleted   = their prose. Only the redundant duplicate DOC is removed,
                    after its content has been folded into the survivor.

Writer discriminator: confidenceScore exists only on docs scratch-2 wrote (we
added it when normalising their float). The earlier float-type test no longer
works now that confidence is a uniform string enum.

Usage: python3 merge_partners.py --dry-run | --apply
"""
import json, pathlib, re, sys
from collections import defaultdict, Counter
from pymongo import MongoClient, UpdateOne, DeleteOne

ROOT = pathlib.Path(__file__).resolve().parent
APPLY = '--apply' in sys.argv
if not APPLY and '--dry-run' not in sys.argv:
    sys.exit('pass --dry-run or --apply')

uri = [l.split('=', 1)[1].strip() for l in (ROOT / '.env').read_text().splitlines()
       if l.startswith('MONGODB_URI=')][0]
P = MongoClient(uri, serverSelectionTimeoutMS=20000)['gff'].partners

NOISE = r'''\b(pvt|private|ltd|limited|llp|llc|inc|incorporated|corp|corporation|
co|company|plc|gmbh|ag|nv|bv|sa|holdings?|group|india|indian|bharat|
technologies|technology|tech|solutions|solution|services|service|systems|system|
labs|lab|software|global|international|worldwide|enterprises?|ventures?|
analytics|analytic|ai|bank|banking|payments?|payment|financial|finance|fintech|
digital|data|network|networks|the|and)\b'''


def keys(name):
    s = (name or '').lower()
    s = re.sub(r'\([^)]*\)', ' ', s)
    s = re.sub(r'&', ' and ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    squashed = re.sub(r'[^a-z0-9]', '', s)
    stripped = re.sub(r'[^a-z0-9]', '', re.sub(NOISE, ' ', s, flags=re.X))
    return {k for k in (squashed, stripped) if k}


UNSOURCED_NOTE = ('written by another worker with no provenance; the cited page '
                  'supplies logos/names/tiers only and cannot be the origin of '
                  'this prose, so it is treated as unverified')

# our authoritative extraction, by exact name
mine_by_name = {p['name']: p for p in
                json.loads((ROOT / 'partners-2026.json').read_text())
                if not p.get('isDataArtifact')}

docs = list(P.find({'year': 2026}))
parent = {}


def find(x):
    parent.setdefault(x, x)
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[ra] = rb


for d in docs:
    ks = list(keys(d['name'])) or ['?%s' % d['_id']]
    d['_keys'] = ks
    for k in ks[1:]:
        union(ks[0], k)
groups = defaultdict(list)
for d in docs:
    groups[find(d['_keys'][0])].append(d)

theirs_doc = lambda d: 'confidenceScore' in d
SKIP = {'_id', '_keys', 'name', 'slug', 'confidence', 'confidenceScore',
        'provenance', 'aliases', 'unsourced', 'whatTheyDo', 'useCases',
        'isDataArtifact', 'artifactNote'}

ops, deletes = [], []
stats = Counter()
examples = []

for k, grp in groups.items():
    ours = [d for d in grp if not theirs_doc(d)]
    theirs = [d for d in grp if theirs_doc(d)]

    if ours and theirs:
        stats['merged pairs'] += 1
        base, other = ours[0], theirs[0]
    elif theirs and not ours:
        stats['their-only docs upgraded in place'] += 1
        base, other = theirs[0], None
    else:
        stats['ours-only, untouched'] += 1
        continue

    setf, unset = {}, {}
    src = mine_by_name.get(base['name'])
    if other is None:
        # single doc written by them; our traced record is matched by exact name
        src = mine_by_name.get(base['name'])

    # ---- aliases (searchability preserved)
    aliases = set(base.get('aliases') or [])
    if other and other['name'] != base['name']:
        aliases.add(other['name'])
    if src and src['name'] != base['name']:
        aliases.add(src['name'])
    if aliases:
        setf['aliases'] = sorted(aliases)

    # ---- canonical name: ours, the source-faithful spelling
    if src and base['name'] != src['name']:
        setf['name'] = src['name']
        setf['slug'] = src['slug']

    # ---- retain their prose under an explicit unsourced marking
    their_txt = other if other is not None else (base if not src else base)
    if theirs_doc(their_txt) and (their_txt.get('whatTheyDo') or their_txt.get('useCases')):
        setf['unsourced'] = {
            'whatTheyDo': their_txt.get('whatTheyDo'),
            'useCases': their_txt.get('useCases') or [],
            'writer': 'scratch-2',
            'method': 'unsourced',
            'confidence': 'low',
            'note': UNSOURCED_NOTE,
        }

    # ---- displayed text: traced wins; otherwise theirs, marked unsourced
    traced_what = (src or {}).get('whatTheyDo')
    traced_uc = (src or {}).get('useCases') or []
    if traced_what:
        setf['whatTheyDo'] = traced_what
        setf['provenance.whatTheyDo'] = ((src.get('provenance') or {}).get('whatTheyDo')
                                         or {'method': 'traced', 'sourceUrl': src.get('website')})
        setf['confidence'] = src.get('confidence', 'medium')
        stats['displayed text = traced'] += 1
    elif setf.get('unsourced', {}).get('whatTheyDo') or base.get('whatTheyDo'):
        setf['whatTheyDo'] = (setf.get('unsourced', {}).get('whatTheyDo')
                              or base.get('whatTheyDo'))
        setf['provenance.whatTheyDo'] = {'method': 'unsourced', 'writer': 'scratch-2',
                                         'note': UNSOURCED_NOTE}
        setf['confidence'] = 'low'
        stats['displayed text = unsourced (we have none)'] += 1

    if traced_uc:
        setf['useCases'] = traced_uc
        setf['provenance.useCases'] = ((src.get('provenance') or {}).get('useCases')
                                       or {'method': 'phrase-match:whatTheyDo'})
    elif setf.get('unsourced', {}).get('useCases'):
        setf['useCases'] = setf['unsourced']['useCases']
        setf['provenance.useCases'] = {'method': 'unsourced', 'writer': 'scratch-2',
                                       'note': UNSOURCED_NOTE}

    # ---- fill any field we lack, from their doc then from our extraction
    for donor in [d for d in (other, src) if d]:
        for f, v in donor.items():
            if f in SKIP or v in (None, '', []):
                continue
            if base.get(f) in (None, '', []) and f not in setf:
                setf[f] = v
                stats['fields filled from other doc'] += 1

    if setf:
        ops.append(UpdateOne({'_id': base['_id']}, {'$set': setf}))
    if other is not None:
        deletes.append(DeleteOne({'_id': other['_id']}))
        if len(examples) < 6:
            examples.append('%s + %s -> %s (alias: %s)' % (
                base['name'], other['name'], setf.get('name', base['name']),
                ', '.join(setf.get('aliases', []))))

print('groups: %d | updates: %d | duplicate docs to delete: %d'
      % (len(groups), len(ops), len(deletes)))
for k, v in sorted(stats.items()):
    print('   %-42s %d' % (k, v))
print('\nsample merges:')
for e in examples:
    print('   %s' % e)
print('\nprojected year-2026 count after merge: %d' % (len(docs) - len(deletes)))

if not APPLY:
    print('\nDRY RUN - nothing written.')
    sys.exit(0)

r = P.bulk_write(ops, ordered=False) if ops else None
d = P.bulk_write(deletes, ordered=False) if deletes else None
print('\napplied: modified=%d deleted=%d'
      % (r.modified_count if r else 0, d.deleted_count if d else 0))
