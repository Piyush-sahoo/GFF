"""Fetch and parse the live GFF 2026 site into corpus records.

The site is a Next.js app with no public JSON API; the data lives in the RSC
flight payload embedded in the HTML (self.__next_f.push(...)). We reassemble
that payload and read the same Strapi records the page renders from, which is
more faithful than scraping rendered text.

Pure extraction + normalisation. No DB access, no enrichment, no network beyond
fetching the three pages.
"""
from __future__ import annotations
import json, re, subprocess, datetime, pathlib

BASE = 'https://www.globalfintechfest.com'
YEAR = 2026
PAGES = {'partners': '/partners', 'speakers': '/speakers', 'agenda': '/agenda'}
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126 Safari/537.36')
_dec = json.JSONDecoder()


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def fetch(outdir: pathlib.Path) -> dict:
    """Download the three source pages. Returns {name: html_path}."""
    outdir.mkdir(parents=True, exist_ok=True)
    out = {}
    for name, path in PAGES.items():
        dest = outdir / ('%s.html' % name)
        r = subprocess.run(['curl', '-sS', '-L', '-m', '90', '--compressed',
                            '-A', UA, '-o', str(dest), '-w', '%{http_code}',
                            BASE + path], capture_output=True, timeout=120)
        code = r.stdout.decode().strip()
        size = dest.stat().st_size if dest.exists() else 0
        if code != '200' or size < 10000:
            raise RuntimeError('fetch failed for %s: HTTP %s, %d bytes' % (path, code, size))
        out[name] = dest
    return out


def flight(html_path: pathlib.Path) -> str:
    """Reassemble the RSC flight payload from the page HTML."""
    html = html_path.read_text(encoding='utf-8', errors='replace')
    parts = []
    for m in re.finditer(r'self\.__next_f\.push\(\[1,\s*(".*?")\]\)', html, re.S):
        try:
            parts.append(json.loads(m.group(1)))
        except Exception:
            pass
    if not parts:
        raise RuntimeError('no flight payload found in %s - page structure may '
                           'have changed' % html_path.name)
    return ''.join(parts)


def grab(text: str, key: str):
    """Decode the JSON value following "<key>": in the payload."""
    i = text.find('"%s":' % key)
    if i == -1:
        raise RuntimeError('key %r not found in payload - site structure changed' % key)
    j = i + len('"%s":' % key)
    while text[j] in ' \n':
        j += 1
    v, _ = _dec.raw_decode(text, j)
    return v


def clean(v):
    if v is None:
        return None
    v = re.sub(r'\s+', ' ', str(v)).strip()
    return v or None


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')


# ---------------------------------------------------------------- sessions
def extract_sessions(agenda_payload: str) -> list:
    from gff_names import split_agenda_speaker
    raw = grab(agenda_payload, 'rawAgendaData')
    out = []
    for o in raw:
        title = clean(o.get('session_name'))
        if not title:
            continue

        def person(v):
            nm, _, _ = split_agenda_speaker(clean(v) or '')
            return nm

        spk_raw, spk = [], []
        for n in range(1, 16):
            v = clean(o.get('session_speakers_%02d' % n))
            if v:
                spk_raw.append(v)
                p = person(v)
                if p:
                    spk.append(p)
        host_raw, hosts = [], []
        for n in range(1, 6):
            v = clean(o.get('session_host_%02d' % n))
            if v:
                host_raw.append(v)
                p = person(v)
                if p:
                    hosts.append(p)
        topics = [clean(x.get('name')) for x in (o.get('session_topics') or [])
                  if isinstance(x, dict)]
        topics = [t for t in topics if t]
        access = clean(o.get('session_access_type'))
        out.append({
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
            'isClosedDoor': bool(access and access.lower() != 'public'),
            'speakerNames': spk,
            'speakersRaw': spk_raw,
            'hostNames': hosts,
            'hostsRaw': host_raw,
            'speakers': spk + hosts,
            'year': YEAR,
            'sourceUrl': BASE + '/agenda',
        })
    out.sort(key=lambda s: (s['day'] or '', s['startTime'] or '', s['hall'] or '', s['title']))
    return out


# ---------------------------------------------------------------- speakers
def extract_speakers(speakers_payload: str, sessions: list) -> list:
    from gff_names import normalise_name
    data = grab(speakers_payload, 'data')
    by_key = {}
    for s in sessions:
        for nm in s['speakerNames'] + s['hostNames']:
            by_key.setdefault(normalise_name(nm), []).append(s)

    best = {}
    for o in data:
        nm = clean(o.get('fullName'))
        if not nm:
            continue
        sal = clean(o.get('salutation'))
        img = o.get('image') if isinstance(o.get('image'), dict) else {}
        ctry = o.get('country') if isinstance(o.get('country'), dict) else {}
        key = normalise_name(nm)
        mine = by_key.get(key, [])
        rec = {
            'name': ((sal + ' ' + nm) if sal else nm),
            'nameKey': key,
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
        }
        score = sum(1 for f in ('bio', 'headshotUrl', 'linkedin', 'sessionTitle') if rec.get(f))
        cur = best.get(key)
        if not cur or score > cur[0]:
            best[key] = (score, rec)
    out = [v[1] for v in best.values()]
    out.sort(key=lambda s: s['name'])
    return out


# ---------------------------------------------------------------- partners
CATEGORY_RULES = [
    ('payments', r'\b(pay|payment|payments|upi|card|cards|pos|checkout|remit|remittance|acquir|merchant)\b|pay$'),
    ('banking', r'\bbank|banking|sbi\b|nbfc\b|co-?operative\b|bank of\b'),
    ('lending', r'\blend|lending|loan|loans|credit|bnpl|financ(e|ing)|capital\b|microfinance\b'),
    ('insurtech', r'\binsur|insurance|assurance|policy|policies\b'),
    ('wealthtech', r'\bwealth|invest|investment|broking|broker|mutual fund|amc\b|securities|trading|portfolio|advisor'),
    ('crypto', r'\bcrypto|blockchain|web3|token|digital asset|defi\b|ledger\b'),
    ('regtech', r'\bkyc|aml|compliance|regtech|fraud|risk|identity|verif|onboarding|audit|govern'),
    ('ai', r'\bai\b|artificial intelligence|\bml\b|genai|intelligence\b|analytics|data\b'),
    ('infra', r'\bcloud|infra|api|apis|platform|saas|core banking|switch|tech|technolog|software|systems|solutions|network|host|server|security|cyber|comm'),
]


def categorise(name):
    low = (name or '').lower()
    for cat, pat in CATEGORY_RULES:
        if re.search(pat, low):
            return cat
    return 'other'


def extract_partners(partners_payload: str) -> list:
    pd = grab(partners_payload, 'partnerData')
    out, seen = [], set()
    for group, items in pd.items():
        if not isinstance(items, list):
            continue
        for o in items:
            if not isinstance(o, dict):
                continue
            name = clean(o.get('altText'))
            if not name or name.lower() in seen:
                continue
            seen.add(name.lower())
            logo = o.get('imageUrl')
            out.append({
                'name': name,
                'slug': slugify(name),
                'website': clean(o.get('webLink')),
                'logoUrl': (BASE + logo) if logo and str(logo).startswith('/') else clean(logo),
                'tier': clean(o.get('title')) or group.rstrip('s'),
                'sourceGroup': group,
                'category': categorise(name),
                'booth': None,        # GFF publishes no partner booths; never inferred
                'boothSource': None,
                'year': YEAR,
                'sourceUrl': BASE + '/partners',
            })
    out.sort(key=lambda p: p['name'].lower())
    return out
