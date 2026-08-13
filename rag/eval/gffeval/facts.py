"""
Ground truth, derived — never hand-typed.

Every expected answer in the golden set and every forbidden string in the
adversarial suite has to be traceable to a record in the source JSON. If a
number were hardcoded here it would silently rot the moment scratch-4 re-ran
its extractor. So this module computes the fact base from the data on every
run, and `run_eval.py --validate` refuses to score a suite whose expectations
no longer match it.

Source data is READ-ONLY. Nothing in this package writes to it.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any

DEFAULT_DATA_DIR = os.environ.get(
    "GFF_DATA_DIR",
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "data",
        "2026",
    ),
)

EVENT_YEAR = 2026
# The three CMS artifacts scratch-4 flags: logo upload rows, not companies.
ARTIFACT_NAMES = {"PCI logo", "NPCI logo", "FCC logo"}

DAY_INDEX = {"2026-09-09": 1, "2026-09-10": 2, "2026-09-11": 3}
INDEX_DAY = {v: k for k, v in DAY_INDEX.items()}


def _norm(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


HONORIFICS = ("mr ", "ms ", "mrs ", "dr ", "shri ", "smt ", "ca ", "prof ", "hon ", "sri ")


def person_key(name: str | None) -> str:
    s = _norm(name)
    changed = True
    while changed:
        changed = False
        for h in HONORIFICS:
            if s.startswith(h):
                s = s[len(h):]
                changed = True
    return s


@dataclass
class Facts:
    """Derived, verifiable facts about the two editions."""

    partners: list[dict] = field(default_factory=list)          # 2026, all rows
    real_partners: list[dict] = field(default_factory=list)      # 2026, artifacts removed
    speakers: list[dict] = field(default_factory=list)
    sessions: list[dict] = field(default_factory=list)
    partners_2025: list[dict] = field(default_factory=list)
    speakers_2025: list[dict] = field(default_factory=list)
    sessions_2025: list[dict] = field(default_factory=list)

    # --- lookups -------------------------------------------------------
    session_by_code: dict[str, dict] = field(default_factory=dict)
    partner_by_key: dict[str, dict] = field(default_factory=dict)
    speaker_by_key: dict[str, dict] = field(default_factory=dict)

    halls: set[str] = field(default_factory=set)
    corpus_blob: str = ""       # normalised text of every 2026 record
    blob_2025: str = ""

    @property
    def closed_door(self) -> list[dict]:
        return [s for s in self.sessions if s.get("isClosedDoor")]

    @property
    def public_sessions(self) -> list[dict]:
        return [s for s in self.sessions if not s.get("isClosedDoor")]

    @property
    def partners_missing_description(self) -> list[dict]:
        return [p for p in self.real_partners if not p.get("whatTheyDo")]

    @property
    def partners_missing_website(self) -> list[dict]:
        return [p for p in self.real_partners if not p.get("website")]

    def sessions_on(self, day_index: int) -> list[dict]:
        day = INDEX_DAY[day_index]
        return [s for s in self.sessions if s.get("day") == day]

    def in_2026(self, text: str) -> bool:
        """Does this string appear anywhere in the 2026 corpus?"""
        return _norm(text) in self.corpus_blob

    def in_2025(self, text: str) -> bool:
        return _norm(text) in self.blob_2025

    def counts(self) -> dict[str, int]:
        return {
            "partner_rows": len(self.partners),
            "partners_real": len(self.real_partners),
            "partner_artifacts": len(self.partners) - len(self.real_partners),
            "speakers": len(self.speakers),
            "sessions": len(self.sessions),
            "closed_door": len(self.closed_door),
            "public_sessions": len(self.public_sessions),
            "partners_missing_description": len(self.partners_missing_description),
            "partners_missing_website": len(self.partners_missing_website),
            "halls": len(self.halls),
            "day1": len(self.sessions_on(1)),
            "day2": len(self.sessions_on(2)),
            "day3": len(self.sessions_on(3)),
            "partners_2025": len(self.partners_2025),
            "speakers_2025": len(self.speakers_2025),
            "sessions_2025": len(self.sessions_2025),
        }


def _load(path: str) -> Any:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load_facts(data_dir: str = DEFAULT_DATA_DIR) -> Facts:
    f = Facts()
    f.partners = _load(os.path.join(data_dir, "partners-2026.json"))
    f.speakers = _load(os.path.join(data_dir, "speakers-2026.json"))
    f.sessions = _load(os.path.join(data_dir, "sessions-2026.json"))
    for name, attr in (
        ("partners-2025.json", "partners_2025"),
        ("speakers-2025.json", "speakers_2025"),
        ("sessions-2025.json", "sessions_2025"),
    ):
        p = os.path.join(data_dir, name)
        setattr(f, attr, _load(p) if os.path.exists(p) else [])

    f.real_partners = [
        p for p in f.partners
        if not p.get("isDataArtifact") and p.get("name") not in ARTIFACT_NAMES
    ]

    f.session_by_code = {s["agendaCode"]: s for s in f.sessions if s.get("agendaCode")}
    f.partner_by_key = {_norm(p["name"]): p for p in f.partners}
    f.speaker_by_key = {person_key(s["name"]): s for s in f.speakers}
    f.halls = {s["hall"] for s in f.sessions if s.get("hall")}

    f.corpus_blob = _norm(json.dumps([f.partners, f.speakers, f.sessions], ensure_ascii=False))
    f.blob_2025 = _norm(
        json.dumps([f.partners_2025, f.speakers_2025, f.sessions_2025], ensure_ascii=False)
    )
    return f


def only_2025_partners(f: Facts) -> list[dict]:
    """2025 partner rows whose name appears nowhere in the 2026 corpus."""
    return [p for p in f.partners_2025 if not f.in_2026(p["name"])]


def only_2025_speakers(f: Facts) -> list[dict]:
    keys26 = set(f.speaker_by_key)
    out = []
    for s in f.speakers_2025:
        k = person_key(s.get("name"))
        if k and k not in keys26 and not f.in_2026(k):
            out.append(s)
    return out


if __name__ == "__main__":  # quick profile: python3 -m gffeval.facts
    facts = load_facts()
    print(json.dumps(facts.counts(), indent=2))
    print("halls:", sorted(facts.halls))
    print("2025-only partners:", len(only_2025_partners(facts)))
    print("2025-only speakers:", len(only_2025_speakers(facts)))
