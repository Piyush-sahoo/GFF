#!/usr/bin/env python3
"""Cross-year canonical-org roll-up: which organisations showed up in 2024, 2025, 2026.

This is the file the outreach cadence actually runs on. An org that partnered or
exhibited in more than one year is a warmer target than a one-off, so the output
is sorted by year count first.

Identity is the whole job. GFF's CMS spells the same company differently across
editions ("ElevenLabs" / "Eleven Labs", "HDFC" / "HDFC Bank "), so folding is done
with gff_identity: canonical_name() applies the agreed spellings, and company_keys()
supplies the match keys, union-found so a chain of spellings lands in one cluster.
CMS logo placeholders (isDataArtifact) are dropped.

Writes exports/orgs-by-year.json. The CSV is written by exports/export-archive.mjs
so that every CSV in this repo goes through the one writer in exports/csv.mjs
rather than a second implementation of RFC4180 quoting in Python.

ARCHIVE-SAFE: reads data/2026/partners-2026.json but never writes to it, and the
2024/2025 rows it reads never leave exports/.
"""
from __future__ import annotations
import json, pathlib, sys
from collections import defaultdict

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gff_identity as GI

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES = [
    (2024, ROOT / 'data' / 'archive-2024' / 'partners-2024.json'),
    (2025, ROOT / 'data' / 'archive-2025' / 'partners-2025.json'),
    (2026, ROOT / 'data' / '2026' / 'partners-2026.json'),
]
OUT = ROOT / 'exports' / 'orgs-by-year.json'
YEARS = [2024, 2025, 2026]


class Union:
    def __init__(self):
        self.parent = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def join(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


def main():
    records = []
    for year, path in SOURCES:
        if not path.exists():
            raise SystemExit('missing source: %s' % path)
        for r in json.loads(path.read_text()):
            if r.get('isDataArtifact') is True:
                continue
            name = (r.get('name') or '').strip()
            if not name:
                continue
            records.append({
                'year': year,
                'name': name,
                'canonical': r.get('canonicalName') or GI.canonical_name(name),
                'tier': r.get('tier'),
                'group': r.get('sourceGroup'),
                'website': r.get('website'),
                'category': r.get('category'),
            })

    # Union every identity key a record can produce, including the keys of its
    # canonical spelling, so "ElevenLabs" and "Eleven Labs" land in one cluster.
    u = Union()
    for r in records:
        keys = GI.company_keys(r['name']) | GI.company_keys(r['canonical'])
        r['keys'] = sorted(keys)
        if not keys:
            # Nothing to match on (name was pure noise words). Keep it as its own
            # cluster under a per-record key rather than dropping the org.
            r['keys'] = ['row:%d:%s' % (r['year'], r['name'].lower())]
        root = r['keys'][0]
        for k in r['keys']:
            u.join(root, k)

    clusters = defaultdict(list)
    for r in records:
        clusters[u.find(r['keys'][0])].append(r)

    orgs = []
    for members in clusters.values():
        by_year = defaultdict(list)
        for m in members:
            by_year[m['year']].append(m)
        # Display name: the most recent edition's canonical spelling wins, because
        # that is the one the 2026 corpus and the app already use.
        newest = max(members, key=lambda m: (m['year'], len(m['name'])))
        aliases = sorted({m['name'] for m in members} | {m['canonical'] for m in members}
                         - {newest['canonical']})
        websites = sorted({m['website'] for m in members if m.get('website')})
        cats = sorted({m['category'] for m in members if m.get('category')})
        present = [y for y in YEARS if by_year.get(y)]
        org = {
            'org': newest['canonical'],
            'aliases': [a for a in aliases if a != newest['canonical']],
            'yearCount': len(present),
            'years': present,
            'returning': len(present) > 1,
            'website': websites[0] if websites else None,
            'otherWebsites': websites[1:],
            'category': cats[0] if cats else None,
        }
        for y in YEARS:
            rows = by_year.get(y) or []
            org['in%d' % y] = bool(rows)
            org['tier%d' % y] = '; '.join(sorted({r['tier'] for r in rows if r.get('tier')})) or None
            org['group%d' % y] = '; '.join(sorted({r['group'] for r in rows if r.get('group')})) or None
            org['name%d' % y] = rows[0]['name'] if rows else None
        orgs.append(org)

    orgs.sort(key=lambda o: (-o['yearCount'], o['org'].lower()))
    OUT.write_text(json.dumps(orgs, indent=2, ensure_ascii=False) + '\n')

    per_year = {y: sum(1 for o in orgs if o['in%d' % y]) for y in YEARS}
    print('source rows      : %d' % len(records))
    print('canonical orgs   : %d' % len(orgs))
    print('per-year orgs    : %s' % per_year)
    print('by year count    : %s' % {n: sum(1 for o in orgs if o['yearCount'] == n) for n in (3, 2, 1)})
    print('all three years  : %d' % sum(1 for o in orgs if o['yearCount'] == 3))
    # Surface the widest folds so over-merging is caught by eye, not assumed away.
    widest = sorted(orgs, key=lambda o: -len(o['aliases']))[:10]
    print('widest folds     :')
    for o in widest:
        print('   %-32s <- %s' % (o['org'], o['aliases']))
    print('wrote %s' % OUT)


if __name__ == '__main__':
    main()
