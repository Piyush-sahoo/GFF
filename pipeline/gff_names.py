"""Canonical person-name normalisation for the GFF corpus.

WHY THIS EXISTS
---------------
The agenda and the speaker directory spell the same human differently:

    /speakers  ->  "Smt. Nirmala Sitharaman"          (salutation prefixed)
    /agenda    ->  "Sanjay Shorey, Executive Director, National Stock Exchange"
                   (bare name + designation + company in one free-text field)

There is no speaker id on sessions, so the ONLY way to link a session to a
speaker is by name. A naive equality join scores 0 of 345 distinct agenda
names, because 486 of 487 directory names carry a salutation. Normalising
both sides first scores 344 of 345.

That failure is silent and looks like "the data is broken", so this logic is
centralised here and covered by tests (see test_gff_names.py). The web app
MUST import these functions rather than reimplement them; if normalisation
regresses, the test fails loudly instead of the join quietly degrading to 0.

Public API
----------
    split_agenda_speaker(s) -> (name, designation, org)
    normalise_name(s)       -> canonical join key
    join_key(s)             -> alias of normalise_name, for call-site clarity
"""
from __future__ import annotations
import re
import unicodedata

# Honorifics and titles seen in the GFF data, longest-first so that
# multi-word forms ("hon'ble justice") are consumed before their prefixes.
_SALUTATIONS = [
    "hon'ble justice", "hon'ble dr", "hon'ble mr", "hon'ble ms", "hon'ble",
    "honble", "honourable", "honorable",
    "justice", "prof", "professor", "dr", "adv", "advocate", "gen", "lt gen",
    "maj gen", "col", "capt", "cmde", "air marshal", "amb", "ambassador",
    "smt", "shri", "sri", "sh", "mr", "mrs", "ms", "miss", "mx", "sir",
    "ca", "cs", "cma", "shrimati", "kum", "kumari",
]
# Sort by word count then length so "hon'ble dr" beats "dr".
_SALUTATIONS.sort(key=lambda s: (-len(s.split()), -len(s)))

_SUFFIXES = ["jr", "sr", "ii", "iii", "iv", "phd", "ph d", "md", "cfa", "frm"]

_PUNCT = re.compile(r"[.,;:()\[\]\"'`’]")
_WS = re.compile(r"\s+")


def _fold(s: str) -> str:
    """Lowercase, strip accents, drop punctuation, collapse whitespace."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace(" ", " ")
    s = _PUNCT.sub(" ", s)
    return _WS.sub(" ", s).strip().lower()


def split_agenda_speaker(raw: str) -> tuple[str | None, str | None, str | None]:
    """Split an agenda speaker field into (name, designation, org).

    The agenda packs three facts into one comma-separated string:
        "Arif Khan, Chief Innovation Officer, Razorpay Software"
    Only the first segment is the person; the rest is their role. Extra
    segments beyond the third are folded back into org, because company
    names legitimately contain commas ("Metropolitan Stock Exchange, Ltd").
    Returns (None, None, None) for blank input.
    """
    if not raw or not raw.strip():
        return (None, None, None)
    parts = [p.strip() for p in raw.split(",")]
    name = _WS.sub(" ", parts[0]).strip() or None
    desig = parts[1] if len(parts) > 1 and parts[1] else None
    org = ", ".join(p for p in parts[2:] if p) or None
    return (name, desig, org)


def normalise_name(raw: str) -> str:
    """Reduce a person name to a canonical key for joining across sources.

    Strips salutations (repeatedly, so "Dr. Shri X" works), trailing
    suffixes, accents, punctuation and doubled spaces.

        normalise_name("Smt. Nirmala Sitharaman")  -> "nirmala sitharaman"
        normalise_name("Yuvraj Singh  Shekhawat")  -> "yuvraj singh shekhawat"

    Returns "" for empty input. Never raises.
    """
    if not raw:
        return ""
    # If a full agenda string was passed by mistake, use only the name part.
    if "," in raw:
        raw = raw.split(",")[0]
    s = _fold(raw)
    # Peel salutations from the front until none match.
    changed = True
    while changed and s:
        changed = False
        for sal in _SALUTATIONS:
            if s == sal:
                return ""
            if s.startswith(sal + " "):
                s = s[len(sal) + 1:].strip()
                changed = True
                break
    # Drop trailing suffixes.
    changed = True
    while changed and s:
        changed = False
        for suf in _SUFFIXES:
            if s.endswith(" " + suf):
                s = s[: -(len(suf) + 1)].strip()
                changed = True
                break
    return s


def join_key(raw: str) -> str:
    """Alias of normalise_name, for readability at join call sites."""
    return normalise_name(raw)
