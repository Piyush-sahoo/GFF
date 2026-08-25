#!/usr/bin/env python3
"""Fetch and parse the 2024 GFF edition into data/archive-2024/.

ARCHIVE ONLY. Same rule as 2025: nothing here enters data/2026/, MongoDB, the RAG
corpus, the vendored app data, or the chatbot.

WHERE 2024 LIVES
----------------
2024.globalfintechfest.com has no DNS record. The 2024 edition was not lost - it
was folded into archive.globalfintechfest.com under a /2024/ path prefix. That
site is the pre-2026 Drupal stack, not the Next.js/Strapi one, so there is no RSC
flight payload to parse. It does something better: the Drupal views that render
the speaker and partner pages are also published as REST-export endpoints, which
return the same records the page renders from, complete and unpaginated.

    /2024/api/speakers-category-a   58 rows   (dignitaries / headline speakers)
    /2024/api/speakers-category-b  787 rows   (the main speaker directory)
    /2024/api/partners                        (partners, exhibitors, supporters,
                                               gff_friends, fintech_friends, organizers)

Verified before relying on them: ?page=1 returns byte-identical output to page 0,
so the endpoints carry no pager and are not truncated. The rendered /2024/speakers
page IS paged (78 cards on page one), which is exactly why it is not the source.
The /2024/ payload is distinct from the archive root - root is the 2024-era Drupal
build of the 2025 edition, superseded by the Next.js 2025.globalfintechfest.com
site that gff_archive_2025.py reads.

The Drupal JSON:API is mounted but returns "insufficient authorization" for
anonymous callers, so it is not usable as a cross-check.
"""
from __future__ import annotations
import html, json, pathlib, re, subprocess, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gff_extract as GX
import gff_identity as GI
from gff_names import normalise_name

BASE = 'https://archive.globalfintechfest.com/2024'
YEAR = 2024
OUT = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'archive-2024'
CACHE = pathlib.Path(__file__).resolve().parent / '.cache' / 'archive-2024'

SPEAKER_API = ['/api/speakers-category-a', '/api/speakers-category-b']
PARTNER_API = '/api/partners'
SPEAKER_PAGE = BASE + '/speakers'
PARTNER_PAGE = BASE + '/partners'

# Drupal serves the partner groups under one endpoint. Order matters: it decides
# which listing an org that appears twice is filed under, mirroring the 2026
# extractor's Partners-before-Exhibitors precedence.
GROUP_ORDER = ['partners', 'exhibitors', 'supporters', 'gff_friends',
               'fintech_friends', 'organizers']

_TAG = re.compile(r'<[^>]+>')


def get(path: str):
    """Fetch one endpoint, cached to disk so a re-run does not re-hit the site."""
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / (re.sub(r'[^a-z0-9]+', '-', path.lower()).strip('-') + '.json')
    if not dest.exists():
        r = subprocess.run(['curl', '-sS', '-L', '-m', '90', '--compressed', '-A', GX.UA,
                            '-o', str(dest), '-w', '%{http_code}', BASE + path],
                           capture_output=True, timeout=120)
        code = r.stdout.decode().strip()
        if code != '200':
            dest.unlink(missing_ok=True)
            raise RuntimeError('fetch failed for %s: HTTP %s' % (path, code))
    try:
        return json.loads(dest.read_text(encoding='utf-8'))
    except json.JSONDecodeError as e:
        raise RuntimeError('%s did not return JSON - the archive site may have '
                           'changed: %s' % (path, e))


def text(v):
    """CMS field -> plain text. The bio field is HTML; everything else is escaped."""
    if v is None:
        return None
    s = html.unescape(_TAG.sub(' ', str(v)))
    s = html.unescape(s)          # the payload double-escapes (&amp;amp;)
    return GX.clean(s.replace('\xa0', ' '))


def main():
    stamp = GX.now()

    # ---- speakers -------------------------------------------------------
    seen, speakers = {}, []
    for path in SPEAKER_API:
        rows = get(path)
        if not isinstance(rows, list):
            raise RuntimeError('%s: expected a list, got %s' % (path, type(rows).__name__))
        for o in rows:
            name = text(o.get('title'))
            if not name:
                continue
            key = normalise_name(name)
            rec = {
                'name': name,
                'nameKey': key,
                'title': text(o.get('role')),
                'org': text(o.get('organization')),
                'country': text(o.get('country')),
                'bio': text(o.get('info')),
                'linkedin': GX.clean(o.get('linkedin')),
                'headshotUrl': GX.clean(o.get('image')),
                'speakerCategory': text(o.get('category')),
                'year': YEAR,
                'sourceUrl': SPEAKER_PAGE,
                'sourceApi': BASE + path,
                'extractedAt': stamp,
            }
            prev = seen.get(key)
            if prev is None:
                seen[key] = rec
                speakers.append(rec)
                continue
            # Same person listed in both categories: keep the richer row.
            score = lambda r: sum(1 for f in ('bio', 'linkedin', 'headshotUrl', 'org') if r.get(f))
            if score(rec) > score(prev):
                speakers[speakers.index(prev)] = rec
                seen[key] = rec
    speakers.sort(key=lambda s: s['name'].lower())

    # ---- partners / exhibitors ------------------------------------------
    payload = get(PARTNER_API)
    groups = payload[0] if isinstance(payload, list) and payload else payload
    if not isinstance(groups, dict):
        raise RuntimeError('%s: expected an object of groups' % PARTNER_API)
    unknown = [g for g in groups if g not in GROUP_ORDER]
    if unknown:
        raise RuntimeError('unrecognised partner group(s) %s - refusing to drop '
                           'rows silently' % unknown)

    also = {}
    for g in GROUP_ORDER:
        for o in groups.get(g) or []:
            nm = text(o.get('name'))
            if nm:
                also.setdefault(nm.lower(), []).append(g)

    partners, taken = [], set()
    for g in GROUP_ORDER:
        for o in groups.get(g) or []:
            name = text(o.get('name'))
            if not name or name.lower() in taken:
                continue
            taken.add(name.lower())
            partners.append({
                'name': name,
                'canonicalName': GI.canonical_name(name),
                'slug': GX.slugify(name),
                'website': GX.clean(o.get('url')),
                'logoUrl': GX.clean(o.get('logo')),
                # Exhibitors carry no title in the CMS; fall back to the listing
                # they came from, the same way the 2026 extractor does. Title-cased
                # so the value lines up with the other years in orgs-by-year.csv.
                'tier': text(o.get('title')) or g.rstrip('s').capitalize(),
                'sourceGroup': g,
                'alsoListedIn': [x for x in also.get(name.lower(), []) if x != g],
                'category': GX.categorise(name),
                'isDataArtifact': GI.is_artifact(name, GX.slugify(name)),
                'booth': None,        # GFF publishes no partner booths; never inferred
                'boothSource': None,
                'year': YEAR,
                'sourceUrl': PARTNER_PAGE,
                'sourceApi': BASE + PARTNER_API,
                'extractedAt': stamp,
            })
    partners.sort(key=lambda p: p['name'].lower())

    OUT.mkdir(parents=True, exist_ok=True)
    for name, rows in [('speakers', speakers), ('partners', partners)]:
        (OUT / ('%s-2024.json' % name)).write_text(
            json.dumps(rows, indent=2, ensure_ascii=False) + '\n')
        print('%-9s %4d rows' % (name, len(rows)))
    print('artifacts flagged: %d' % sum(1 for p in partners if p['isDataArtifact']))
    print('groups: %s' % {g: len(groups.get(g) or []) for g in GROUP_ORDER})


if __name__ == '__main__':
    main()
