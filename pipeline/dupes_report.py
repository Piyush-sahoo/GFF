#!/usr/bin/env python3
"""Definitive duplicate report for gff.partners year 2026.

Atlas holds 336 docs for 2026 but the live site yields 316 real partners, so
there are ~20 excess. This identifies every one and classifies WHY it slipped
past a naive key, so the fix can be a rule rather than a hand-list.

Read-only.
"""
import json, pathlib, re
from collections import defaultdict
from pymongo import MongoClient

ROOT = pathlib.Path(__file__).resolve().parent
uri = [l.split('=', 1)[1].strip() for l in (ROOT / '.env').read_text().splitlines()
       if l.startswith('MONGODB_URI=')][0]
P = MongoClient(uri, serverSelectionTimeoutMS=20000)['gff'].partners

# Tokens that carry no identity: legal forms, and descriptor words that the two
# sources disagree about ("HDFC" vs "HDFC Bank", "OnFinance" vs "OnFinance AI").
NOISE = r'''\b(pvt|private|ltd|limited|llp|llc|inc|incorporated|corp|corporation|
co|company|plc|gmbh|ag|nv|bv|sa|holdings?|group|india|indian|bharat|
technologies|technology|tech|solutions|solution|services|service|systems|system|
labs|lab|software|global|international|worldwide|enterprises?|ventures?|
analytics|analytic|ai|bank|banking|payments?|payment|financial|finance|fintech|
digital|data|network|networks|the|and)\b'''


def keys(name):
    """Return ALL identity keys for a name; two names are the same company if
    any key matches.

    Two keys are needed because noise-stripping and concatenation interact:
    'Eleven Labs' -> strip 'labs' -> 'eleven', but 'ElevenLabs' is a single
    token so \\b never matches 'labs' and it stays 'elevenlabs'. Comparing on
    the stripped key alone misses that pair; comparing on the raw squashed key
    alone misses 'HDFC' vs 'HDFC Bank'. Emitting both catches both.
    """
    s = (name or '').lower()
    s = re.sub(r'\([^)]*\)', ' ', s)          # NTT Data (ADAPTIS)
    s = re.sub(r'&', ' and ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    squashed = re.sub(r'[^a-z0-9]', '', s)                       # case/spacing only
    stripped = re.sub(r'[^a-z0-9]', '', re.sub(NOISE, ' ', s, flags=re.X))
    return {k for k in (squashed, stripped) if k}


def key(name):
    """Primary key, kept for callers that need a single value."""
    ks = keys(name)
    return min(ks, key=len) if ks else ''


def why(a, b):
    ca, cb = re.sub(r'[^a-z0-9]', '', a.lower()), re.sub(r'[^a-z0-9]', '', b.lower())
    if a.lower() == b.lower():
        return 'exact-dup'
    if ca == cb:
        return 'case/spacing only'
    if ca in cb or cb in ca:
        return 'one name is a prefix/superset of the other'
    return 'legal-form or descriptor token differs'


docs = list(P.find({'year': 2026}, {'name': 1, 'confidence': 1, 'logoUrl': 1,
                                    'whatTheyDo': 1, 'useCases': 1, 'tier': 1}))
# union-find: any shared key merges two docs into one company group
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

def who(d):
    return 'scratch-2' if isinstance(d.get('confidence'), float) else 'ours'

dupes = {k: v for k, v in groups.items() if len(v) > 1}
excess = sum(len(v) - 1 for v in dupes.values())

print('year-2026 docs in Atlas      : %d' % len(docs))
print('distinct companies by key    : %d' % len(groups))
print('duplicate groups             : %d' % len(dupes))
print('excess docs (would render as duplicate cards): %d' % excess)
print('implied true count           : %d' % (len(docs) - excess))
print()
print('%-34s %-34s %s' % ('scratch-2 name', 'our name', 'why it slipped a naive key'))
print('-' * 110)
rows = []
for k, v in sorted(dupes.items()):
    t = [d for d in v if who(d) == 'scratch-2']
    o = [d for d in v if who(d) == 'ours']
    tn = ', '.join(d['name'] for d in t) or '-'
    on = ', '.join(d['name'] for d in o) or '-'
    reason = why(t[0]['name'], o[0]['name']) if (t and o) else 'both from same writer'
    rows.append((tn, on, reason, len(v)))
    print('%-34s %-34s %s' % (tn[:34], on[:34], reason))

print()
print('cross-writer pairs (scratch-2 doc + our doc): %d'
      % sum(1 for r in rows if r[0] != '-' and r[1] != '-'))
print('same-writer pairs (a writer duplicated itself): %d'
      % sum(1 for r in rows if r[0] == '-' or r[1] == '-'))
print()
print('Field complementarity across cross-writer pairs:')
both = [v for v in dupes.values()
        if any(who(d) == 'scratch-2' for d in v) and any(who(d) == 'ours' for d in v)]
print('  their doc has whatTheyDo but no logoUrl : %d' % sum(
    1 for v in both for d in v if who(d) == 'scratch-2' and d.get('whatTheyDo') and not d.get('logoUrl')))
print('  our doc has logoUrl                      : %d' % sum(
    1 for v in both for d in v if who(d) == 'ours' and d.get('logoUrl')))
json.dump([{'scratch2': r[0], 'ours': r[1], 'reason': r[2]} for r in rows],
          open(ROOT / 'duplicate-pairs-2026.json', 'w'), indent=1)
print('\nwritten: duplicate-pairs-2026.json')
