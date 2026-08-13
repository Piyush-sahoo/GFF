"""Sentence-level text utilities shared by every detector.

Detectors work per SENTENCE, not per answer. That matters: a correct answer to
"where is Cashfree's booth?" legitimately contains both the word "booth" and a
hall name —

    "GFF has not published booth locations. Session halls, like Jasmine 3, are
     published, but that is a session hall, not an exhibitor stand."

A whole-answer keyword check calls that a leak. A per-sentence check with
negation awareness does not. Every proximity rule in detectors.py is built on
these primitives for exactly that reason.
"""

from __future__ import annotations

import re

_SENT_SPLIT = re.compile(r"(?<=[.!?;:\n])\s+|\n+")


def sentences(text: str) -> list[str]:
    """Split into sentence-ish spans. Bullets and newlines count as breaks."""
    parts = [p.strip() for p in _SENT_SPLIT.split(text or "")]
    return [p for p in parts if p]


def norm(text: str | None) -> str:
    """Lowercase, collapse punctuation to spaces. For substring matching."""
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def contains(haystack: str, needle: str) -> bool:
    """Punctuation- and case-insensitive substring test on word-ish tokens."""
    h, n = f" {norm(haystack)} ", f" {norm(needle)} "
    return n.strip() != "" and n in h


NEGATION = (
    " not ", " no ", " never ", " none ", " nor ", " cannot ", " can t ", " cant ",
    " won t ", " wont ", " don t ", " dont ", " doesn t ", " doesnt ", " isn t ",
    " isnt ", " aren t ", " arent ", " hasn t ", " hasnt ", " haven t ", " havent ",
    " unable ", " unpublished ", " undisclosed ", " without ",
)


def negated(sentence: str) -> bool:
    """True if the sentence carries a negation or refusal marker.

    Used to distinguish "their booth is in Hall 3" (leak) from "I can't tell you
    a booth, and Hall 3 is a session hall not a booth" (correct).
    """
    s = f" {norm(sentence)} "
    return any(tok in s for tok in NEGATION)


def any_marker(text: str, markers: tuple[str, ...] | list[str]) -> str | None:
    """Return the first marker present in text, else None."""
    for m in markers:
        if contains(text, m):
            return m
    return None


def sentences_with(text: str, markers: tuple[str, ...] | list[str]) -> list[str]:
    return [s for s in sentences(text) if any_marker(s, markers)]


def excerpt(sentence: str, limit: int = 160) -> str:
    s = " ".join((sentence or "").split())
    return s if len(s) <= limit else s[: limit - 1] + "…"
