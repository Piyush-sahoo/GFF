#!/usr/bin/env python3
"""Enrich partner company descriptions via apify/website-content-crawler.

WHY THIS ACTOR: official Apify (~147k users, 4.52/5), takes a batched startUrls
list, renders JS and routes through Apify Proxy - which is exactly why these
domains blocked our direct fetch. maxCrawlDepth=0 so it loads ONLY each
company's own homepage: no deep crawl, no people/team pages.

RULES ENFORCED HERE
  - No fabrication: a company with no usable returned text stays whatTheyDo=null,
    useCases=[], confidence=low. A gap is recorded as a gap.
  - Provenance per field: every enriched value carries method + sourceUrl +
    fetchedAt under `provenance`, so the three methods (curated / meta-description
    / apify-crawl) are always distinguishable and auditable.
  - Company data only: we read the company's own homepage description. Any
    person-shaped field the actor returns (author, contact names, emails,
    phones) is discarded and never stored.
  - Booth stays null, always. Asserted before writing.

Usage:
  python3 apify_enrich.py start      # kick off the run, print runId
  python3 apify_enrich.py poll RUNID # check status
  python3 apify_enrich.py merge RUNID [RUNID2 ...]   # merge results into partners-2026.json
"""
import json, os, sys, pathlib, urllib.request, urllib.error, urllib.parse, datetime, re

ROOT = pathlib.Path(__file__).resolve().parent
ACTOR = 'apify~website-content-crawler'
API = 'https://api.apify.com/v2'
METHOD = 'apify:apify/website-content-crawler'

# Person-shaped keys we refuse to carry over even if present.
PERSONAL_KEYS = {'author', 'email', 'emails', 'phone', 'phones', 'contactPoint',
                 'founder', 'people', 'names', 'telephone'}


def token():
    for line in (ROOT / '.env').read_text().splitlines():
        if line.startswith('APIFY_TOKEN='):
            return line.split('=', 1)[1].strip()
    sys.exit('APIFY_TOKEN missing from .env')


def api(path, method='GET', payload=None):
    url = '%s/%s' % (API, path)
    sep = '&' if '?' in url else '?'
    url = '%s%stoken=%s' % (url, sep, token())
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit('Apify API %s: %s' % (e.code, e.read().decode()[:400]))


def norm_url(u):
    """Add a missing scheme. Five source records are bare hosts
    ('www.companyhub.com'); the host is unchanged, so this is normalisation,
    not invention. Returns None if there is no usable host."""
    if not u:
        return None
    u = u.strip()
    if not re.match(r'^https?://', u, re.I):
        if not re.match(r'^[\w.-]+\.[a-z]{2,}', u, re.I):
            return None
        u = 'https://' + u.lstrip('/')
    return u if urllib.parse.urlparse(u).netloc else None


def host_of(u):
    u = norm_url(u)
    if not u:
        return None
    return re.sub(r'^www\.', '', urllib.parse.urlparse(u).netloc.lower())


def targets(skip_slugs=()):
    t = json.loads((ROOT / 'enrich-targets.json').read_text())
    return [x for x in t if x['slug'] not in skip_slugs]


def cmd_start():
    # The 5 already validated in the pilot run.
    pilot = {'transunion-cibil', 'pay10', 'digio', 'navi', 'zoho'}
    tg = targets(pilot)
    urls, bad = [], []
    for x in tg:
        u = norm_url(x['website'])
        (urls.append({'url': u}) if u else bad.append(x['name']))
    print('starting crawl for %d companies (unusable URLs skipped: %s)'
          % (len(urls), bad or 'none'))
    body = {
        'startUrls': urls,
        'crawlerType': 'playwright:firefox',
        'maxCrawlDepth': 0,          # homepage only
        'maxCrawlPages': len(urls) + 5,
        'maxResults': len(urls) + 5,
        'useSitemaps': False,
        'respectRobotsTxtFile': True,
        'proxyConfiguration': {'useApifyProxy': True},
        'saveMarkdown': True,
        'blockMedia': True,
        'removeCookieWarnings': True,
        'htmlTransformer': 'readableTextIfPossible',
        'dynamicContentWaitSecs': 8,
        'maxRequestRetries': 2,
        'maxConcurrency': 15,
    }
    r = api('acts/%s/runs?memory=8192&timeout=1800' % ACTOR, 'POST', body)['data']
    print('runId=%s datasetId=%s' % (r['id'], r['defaultDatasetId']))
    (ROOT / '.apify-run').write_text('%s %s\n' % (r['id'], r['defaultDatasetId']))


def cmd_poll(run_id):
    r = api('actor-runs/%s' % run_id)['data']
    print('status=%s items=%s CU=%s' % (
        r['status'], r.get('stats', {}).get('outputItemCount'),
        round(r.get('stats', {}).get('computeUnits', 0), 4)))
    return r


def first_good_line(md):
    """First substantive line of the page's own markdown, or None.

    This is the company's own copy, not a generated summary. We skip
    nav/cookie/heading noise and anything that looks like a person or contact.
    """
    if not md:
        return None
    for raw in md.splitlines():
        s = re.sub(r'[#*_>`\[\]()!]', ' ', raw)
        s = re.sub(r'\s+', ' ', s).strip()
        if len(s) < 45 or len(s) > 400:
            continue
        low = s.lower()
        if any(w in low for w in ('cookie', 'javascript', 'sign in', 'log in',
                                  'privacy policy', 'terms of', 'all rights reserved',
                                  'skip to', 'menu', 'search', '@', 'http')):
            continue
        if not re.search(r'[a-z]{4}\s+[a-z]{3}', low):
            continue
        return s
    return None


def cmd_merge(run_ids):
    fetched_at = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    by_host = {}
    total_items = 0
    for rid in run_ids:
        r = api('actor-runs/%s' % rid)['data']
        ds = r['defaultDatasetId']
        items = api('datasets/%s/items?clean=true&limit=1000' % ds)
        if isinstance(items, dict):
            items = items.get('items', [])
        total_items += len(items)
        for it in items:
            url = it.get('url') or (it.get('crawl') or {}).get('loadedUrl')
            if not url:
                continue
            md = it.get('metadata') or {}
            desc = md.get('description')
            if not desc:
                jl = md.get('jsonLd') or {}
                if isinstance(jl, dict):
                    desc = jl.get('description')
                    if not desc and isinstance(jl.get('sourceOrganization'), dict):
                        desc = jl['sourceOrganization'].get('description')
            src = 'meta-description'
            if not desc:
                desc = first_good_line(it.get('markdown'))
                src = 'homepage-body-text'
            if not desc:
                continue
            desc = re.sub(r'\s+', ' ', str(desc)).strip()[:400]
            if len(desc) < 25:
                continue
            host = host_of(url)
            if host:
                by_host.setdefault(host, (desc, url, src))
    print('crawled items: %d | usable descriptions: %d' % (total_items, len(by_host)))

    partners = json.loads((ROOT / 'partners-2026.json').read_text())
    filled = 0
    for p in partners:
        if p.get('whatTheyDo') or not p.get('website'):
            continue
        host = host_of(p['website'])
        hit = by_host.get(host) if host else None
        if not hit:
            continue
        desc, url, src = hit
        p['whatTheyDo'] = desc
        p['confidence'] = 'medium'
        p.setdefault('provenance', {})['whatTheyDo'] = {
            'method': METHOD, 'variant': src, 'sourceUrl': url, 'fetchedAt': fetched_at}
        filled += 1

    # strip any person-shaped keys that may have crept in
    for p in partners:
        for k in list(p.keys()):
            if k in PERSONAL_KEYS:
                del p[k]
        assert p['booth'] is None and p['boothSource'] is None, 'booth must stay null'

    (ROOT / 'partners-2026.json').write_text(json.dumps(partners, indent=1, ensure_ascii=False))
    print('newly filled whatTheyDo: %d' % filled)
    print('whatTheyDo now: %d/%d' % (sum(1 for p in partners if p['whatTheyDo']), len(partners)))


if __name__ == '__main__':
    import urllib.parse
    a = sys.argv[1:] or ['start']
    if a[0] == 'start':
        cmd_start()
    elif a[0] == 'poll':
        cmd_poll(a[1])
    elif a[0] == 'merge':
        cmd_merge(a[1:])
