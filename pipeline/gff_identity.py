"""Stable company identity for the GFF partner corpus.

Two jobs, both about making earlier decisions survive a re-scrape:

  canonical_name()  maps a scraped spelling to the agreed canonical one, so
                    re-scraping "ElevenLabs" folds into "Eleven Labs" rather
                    than creating a second directory card.
  is_artifact()     recognises the logo placeholders in GFF's own CMS altText
                    field ("PCI logo", "NPCI logo", "FCC logo"), which are not
                    partner organisations and must never re-enter the corpus.

company_keys() is the matcher that found the original 20 duplicate pairs. It
emits TWO keys per name because noise-stripping and concatenation interact:
"Eleven Labs" -> strip "labs" -> "eleven", but "ElevenLabs" is a single token
so \\b never matches "labs" and it stays "elevenlabs". Matching on the stripped
key alone misses that pair; matching on the squashed key alone misses
"HDFC" vs "HDFC Bank". Emitting both catches both.
"""
from __future__ import annotations
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent
_MAP_PATH = ROOT / 'identity-map.json'

NOISE = r'''\b(pvt|private|ltd|limited|llp|llc|inc|incorporated|corp|corporation|
co|company|plc|gmbh|ag|nv|bv|sa|holdings?|group|india|indian|bharat|
technologies|technology|tech|solutions|solution|services|service|systems|system|
labs|lab|software|global|international|worldwide|enterprises?|ventures?|
analytics|analytic|ai|bank|banking|payments?|payment|financial|finance|fintech|
digital|data|network|networks|the|and)\b'''


def _load():
    if not _MAP_PATH.exists():
        return {'canonical': {}, 'artifactSlugs': [], 'artifactNames': []}
    return json.loads(_MAP_PATH.read_text())


_MAP = _load()
# case-insensitive alias lookup
_CANON = {k.lower(): v for k, v in _MAP.get('canonical', {}).items()}
_ART_SLUGS = {s.lower() for s in _MAP.get('artifactSlugs', [])}
_ART_NAMES = {s.lower() for s in _MAP.get('artifactNames', [])}


def company_keys(name: str) -> set:
    """All identity keys for a company name; any shared key means same company."""
    s = (name or '').lower()
    s = re.sub(r'\([^)]*\)', ' ', s)          # "NTT Data (ADAPTIS)"
    s = re.sub(r'&', ' and ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    squashed = re.sub(r'[^a-z0-9]', '', s)
    stripped = re.sub(r'[^a-z0-9]', '', re.sub(NOISE, ' ', s, flags=re.X))
    return {k for k in (squashed, stripped) if k}


def canonical_name(name: str) -> str:
    """Canonical spelling for a scraped name (identity of unknown names is kept)."""
    if not name:
        return name
    direct = _CANON.get(name.lower())
    if direct:
        return direct
    # fall back to key match, so a NEW variant of a known company still folds
    mine = company_keys(name)
    for alias, canon in _MAP.get('canonical', {}).items():
        if mine & company_keys(alias) or mine & company_keys(canon):
            return canon
    return name


def is_artifact(name: str, slug: str = '') -> bool:
    """True for CMS logo placeholders that are not partner organisations."""
    if (slug or '').lower() in _ART_SLUGS or (name or '').lower() in _ART_NAMES:
        return True
    # defensive: any future "<something> logo" placeholder
    return bool(re.search(r'\blogos?\b$', (name or '').strip(), re.I))


def reload_map():
    """Re-read identity-map.json (used by tests)."""
    global _MAP, _CANON, _ART_SLUGS, _ART_NAMES
    _MAP = _load()
    _CANON = {k.lower(): v for k, v in _MAP.get('canonical', {}).items()}
    _ART_SLUGS = {s.lower() for s in _MAP.get('artifactSlugs', [])}
    _ART_NAMES = {s.lower() for s in _MAP.get('artifactNames', [])}
