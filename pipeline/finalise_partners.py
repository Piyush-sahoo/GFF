#!/usr/bin/env python3
"""Finalise partners-2026.json: artifact flagging, approved curated institution
facts, per-field provenance backfill, and useCases derivation.

PROVENANCE MODEL - every populated whatTheyDo/useCases records how it was
obtained, so all methods stay auditable and distinguishable:
  curated-public-facts   stable, publicly-known statements of what an org IS
  direct-meta-description our own curl of the company's homepage <meta>
  apify:apify/website-content-crawler  proxied/JS-rendered homepage fetch
  phrase-match:whatTheyDo useCases derived by literal match against the
                          company's OWN description text (never free invention)

Nothing here invents a fact. A company with no sourced text stays null/low.
"""
import json, pathlib, re, datetime

ROOT = pathlib.Path(__file__).resolve().parent
NOW = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

# Logo artifacts in GFF's own CMS altText field - not partners at all.
# Flagged rather than deleted so a future re-scrape cannot silently re-add them
# and so the app can filter on a field instead of hardcoding names.
ARTIFACTS = {'pci-logo', 'npci-logo', 'fcc-logo'}

# Approved by orchestrator: unambiguous, stable, publicly-known statements of
# what the organisation IS. No GFF-2026 involvement claims, no marketing
# language, nothing time-sensitive. Anything that felt like a judgement call
# was left out deliberately.
CURATED_INSTITUTIONS = {
    'uidai': ("India's Unique Identification Authority, the statutory body that issues "
              "Aadhaar identity numbers and operates the associated authentication system.",
              ['identity verification', 'KYC and onboarding'], 'regtech'),
    'ifsca': ("India's International Financial Services Centres Authority, the unified "
              "regulator for financial services in the country's IFSCs, including GIFT City.",
              ['AML and compliance'], 'regtech'),
    'ondc': ("Open Network for Digital Commerce, an Indian government-backed open network "
             "for interoperable digital commerce.", ['cloud infrastructure'], 'infra'),
    'rbih': ("Reserve Bank Innovation Hub, an entity set up by the Reserve Bank of India to "
             "promote innovation in financial services.", [], 'infra'),
    'pwc': ("PwC, one of the large global professional services networks, providing "
            "assurance, tax and advisory services.", [], 'other'),
    'ey': ("EY (Ernst & Young), one of the large global professional services networks, "
           "providing assurance, tax, consulting and advisory services.", [], 'other'),
    'kpmg': ("KPMG, one of the large global professional services networks, providing "
             "audit, tax and advisory services.", [], 'other'),
    'bcg': ("Boston Consulting Group, a global management consulting firm.", [], 'other'),
    'whatsapp': ("WhatsApp, a global messaging service owned by Meta, which also supports "
                 "business messaging and in-app payments in some markets.",
                 ['customer communication'], 'infra'),
    'npci': ("National Payments Corporation of India, the umbrella organisation that "
             "operates retail payment systems in India including UPI, RuPay and IMPS.",
             ['UPI payments', 'card acceptance'], 'payments'),
    'gleif': ("Global Legal Entity Identifier Foundation, the body overseeing the LEI "
              "system for identifying legal entities in financial transactions.",
              ['identity verification'], 'regtech'),
}

# Names already covered by the earlier curated pass (enrich26.py), used only to
# label provenance correctly on records that were filled before this script.
PRIOR_CURATED = {
    'visa', 'mastercard', 'phonepe', 'paytm', 'google pay', 'amazon pay', 'razorpay',
    'pine labs', 'bharatpe', 'pismo', 'hdfc bank', 'icici bank', 'axis bank', 'kotak',
    'hsbc', 'citi', 'bank of baroda', 'state bank of india', 'punjab national bank',
    'perfios', 'finvu', 'm2p fintech', 'route mobile', 'sinch', 'onecard', 'truecaller',
    'adobe', 'zscaler', 'elevenlabs', 'mixpanel', 'authbridge', 'lyra', 'neokred',
    'discover', 'tata capital', 'mcx', 'bse', 'national stock exchange',
}

PHRASES = {
    'UPI payments': [r'\bupi\b'],
    'payment gateway': [r'payment gateway', r'payments gateway'],
    'card issuing': [r'card issu', r'\bcard programme?s?\b'],
    'card acceptance': [r'card accept', r'\bpos\b', r'point of sale', r'point-of-sale', r'\brupay\b'],
    'cross-border payments': [r'cross[- ]border', r'international payment', r'global payment', r'remittanc'],
    'payouts': [r'\bpayout'],
    'recurring billing': [r'subscription billing', r'recurring payment', r'recurring billing'],
    'digital lending': [r'digital lend', r'\blending\b', r'\bloan', r'\bbnpl\b', r'buy now pay later'],
    'credit underwriting': [r'underwrit', r'credit decision', r'credit assessment', r'credit scor', r'credit bureau'],
    'KYC and onboarding': [r'\bkyc\b', r'know your customer', r'onboarding', r'\be-?sign\b', r'digilocker'],
    'identity verification': [r'identity verif', r'\bidentity\b', r'authenticat', r'\baadhaar\b', r'\blei\b'],
    'fraud prevention': [r'\bfraud\b', r'chargeback'],
    'AML and compliance': [r'\baml\b', r'anti[- ]money', r'complian', r'\bcft\b', r'regulat'],
    'risk management': [r'risk manage'],
    'core banking': [r'core banking'],
    'banking as a service': [r'banking[- ]as[- ]a[- ]service', r'\bbaas\b', r'embedded finance'],
    'account aggregation': [r'account aggregat'],
    'wealth management': [r'wealth manage', r'\bportfolio\b', r'mutual fund', r'\binvestment'],
    'trading and brokerage': [r'\btrading\b', r'\bbroker', r'\bexchange\b', r'\bsecurities\b'],
    'insurance distribution': [r'\binsur'],
    'customer communication': [r'\bsms\b', r'\botp\b', r'whatsapp', r'\bcpaas\b', r'messaging', r'customer engagement'],
    'analytics and reporting': [r'\banalytics\b', r'\bdashboard', r'business intelligence', r'\binsights\b'],
    'AI and automation': [r'\bai\b', r'artificial intelligence', r'machine learning', r'\bgenai\b', r'automation'],
    'cloud infrastructure': [r'\bcloud\b', r'\bsaas\b', r'\bapi\b', r'\bapis\b', r'infrastructure'],
    'cybersecurity': [r'\bcyber', r'\bsecurity\b', r'zero[- ]trust', r'\bencryption\b'],
    'blockchain and tokenisation': [r'blockchain', r'tokenis', r'tokeniz', r'\bweb3\b', r'digital asset'],
    'financial inclusion': [r'financial inclusion', r'underserved', r'unbanked'],
    'treasury and cash management': [r'\btreasury\b', r'cash manage', r'reconcil'],
    'expense management': [r'expense manage', r'spend manage'],
    'collections and recovery': [r'\bcollection', r'\brecovery\b'],
}
COMPILED = {k: [re.compile(p, re.I) for p in v] for k, v in PHRASES.items()}

path = ROOT / 'partners-2026.json'
partners = json.loads(path.read_text())

before_what = sum(1 for p in partners if p.get('whatTheyDo'))
before_uc = sum(1 for p in partners if p.get('useCases'))

# ---- 1. flag logo artifacts (excluded from enrichment and from the directory)
n_art = 0
for p in partners:
    if p['slug'] in ARTIFACTS:
        p['isDataArtifact'] = True
        p['artifactNote'] = ("Logo placeholder in the GFF CMS altText field, not a partner "
                            "organisation. Exclude from directory, counts and AI answers.")
        p['whatTheyDo'] = None
        p['useCases'] = []
        p['confidence'] = 'low'
        n_art += 1
    else:
        p['isDataArtifact'] = False

# ---- 2. approved curated institution facts
n_cur = 0
for p in partners:
    if p['isDataArtifact'] or p.get('whatTheyDo'):
        continue
    key = p['name'].lower().strip()
    hit = CURATED_INSTITUTIONS.get(key) or CURATED_INSTITUTIONS.get(p['slug'])
    if not hit:
        continue
    p['whatTheyDo'], uc, cat = hit
    p['useCases'] = list(uc)
    p['category'] = cat
    p['confidence'] = 'high'
    prov = p.setdefault('provenance', {})
    prov['whatTheyDo'] = {'method': 'curated-public-facts', 'sourceUrl': None,
                          'fetchedAt': NOW,
                          'note': 'stable public fact about what the organisation is; '
                                  'no GFF-2026 claims, no time-sensitive detail'}
    if uc:
        prov['useCases'] = {'method': 'curated-public-facts', 'fetchedAt': NOW}
    n_cur += 1

# ---- 3. backfill provenance for records enriched before provenance existed
n_bf = 0
for p in partners:
    if not p.get('whatTheyDo'):
        continue
    prov = p.setdefault('provenance', {})
    if 'whatTheyDo' in prov:
        continue
    low = p['name'].lower().strip()
    if any(low == k or low.startswith(k + ' ') or k in low for k in PRIOR_CURATED):
        prov['whatTheyDo'] = {'method': 'curated-public-facts', 'sourceUrl': None,
                              'fetchedAt': 'earlier-in-this-session'}
    else:
        prov['whatTheyDo'] = {'method': 'direct-meta-description',
                              'sourceUrl': p.get('website'),
                              'fetchedAt': 'earlier-in-this-session',
                              'note': "our own fetch of the company's homepage <meta> tag"}
    n_bf += 1

# ---- 4. derive useCases by literal phrase-match on the company's own text
n_uc = 0
for p in partners:
    if p['isDataArtifact'] or p.get('useCases'):
        continue
    txt = p.get('whatTheyDo')
    if not txt:
        continue
    hits = [uc for uc, pats in COMPILED.items() if any(r.search(txt) for r in pats)]
    if hits:
        p['useCases'] = hits[:6]
        p.setdefault('provenance', {})['useCases'] = {
            'method': 'phrase-match:whatTheyDo',
            'basis': p['provenance'].get('whatTheyDo', {}).get('method'),
            'fetchedAt': NOW}
        n_uc += 1

# ---- invariants
for p in partners:
    assert p['booth'] is None and p['boothSource'] is None, 'booth must stay null: ' + p['name']
assert not any(p['whatTheyDo'] for p in partners if p['isDataArtifact']), 'artifacts must stay empty'

partners.sort(key=lambda p: p['name'].lower())
path.write_text(json.dumps(partners, indent=1, ensure_ascii=False))

real = [p for p in partners if not p['isDataArtifact']]
after_what = sum(1 for p in partners if p.get('whatTheyDo'))
after_uc = sum(1 for p in partners if p.get('useCases'))
print('artifacts flagged      : %d (%s)' % (n_art, sorted(ARTIFACTS)))
print('curated institutions   : %d' % n_cur)
print('provenance backfilled  : %d' % n_bf)
print('useCases derived       : %d' % n_uc)
print()
print('whatTheyDo  %d/%d  ->  %d/%d   (of %d real partners: %d)'
      % (before_what, len(partners), after_what, len(partners), len(real),
         sum(1 for p in real if p['whatTheyDo'])))
print('useCases    %d/%d  ->  %d/%d   (of %d real partners: %d)'
      % (before_uc, len(partners), after_uc, len(partners), len(real),
         sum(1 for p in real if p['useCases'])))
from collections import Counter
print('provenance methods:', Counter(
    p['provenance']['whatTheyDo']['method'] for p in partners
    if p.get('provenance', {}).get('whatTheyDo')).most_common())
print('confidence:', Counter(p['confidence'] for p in partners).most_common())
