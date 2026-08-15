"""
Case model, loader, and the self-check that keeps the suites honest.

A suite is only worth as much as its expectations. Two things rot a golden set:
the upstream extractor changes and the answers quietly become wrong, or the
author (me) types a fact from memory that was never in the data. `validate()`
catches both — every case carries `verify` claims that are re-checked against
the source records on every run, and every expected string is traced back to
the corpus.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any

from .facts import Facts, person_key
from .text import contains, norm

SUITE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# Expected strings that are legitimately OUR words rather than record values:
# refusal language, day labels, and rule vocabulary.
GENERIC_LANGUAGE = {
    "not published", "no record", "invite only", "invite-only", "closed door",
    "closed-door", "by invitation", "day 1", "day 2", "day 3", "2026", "2025",
    "not recorded", "dont have", "do not have", "no floor plan", "gff 2026",
    "invitation only", "restricted", "no data", "not listed", "unpublished",
    "i dont know", "not available", "no information", "wednesday", "thursday",
    "friday", "september", "sept", "mumbai", "jio world centre", "trident bkc",
}


@dataclass
class Case:
    id: str
    suite: str
    category: str
    question: str
    why: str = ""
    expected_answer: str = ""
    rules: list[str] = field(default_factory=list)
    checks: list[dict] = field(default_factory=list)
    verify: list[dict] = field(default_factory=list)
    grounding: str = ""
    attack: str = ""          # adversarial technique, for the report
    raw: dict = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict, suite: str) -> "Case":
        return cls(
            id=d["id"],
            suite=suite,
            category=d.get("category", "general"),
            question=d["question"],
            why=d.get("why", ""),
            expected_answer=d.get("expected_answer", ""),
            rules=d.get("rules", []),
            checks=d.get("checks", []),
            verify=d.get("verify", []),
            grounding=d.get("grounding", ""),
            attack=d.get("attack", ""),
            raw=d,
        )


def load_suite(path: str) -> list[Case]:
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    suite = doc.get("suite", os.path.basename(path).split(".")[0])
    cases = [Case.from_dict(c, suite) for c in doc["cases"]]
    ids = [c.id for c in cases]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise ValueError(f"{path}: duplicate case ids {sorted(dupes)}")
    return cases


def load_all(suite_dir: str = SUITE_DIR, only: str | None = None) -> list[Case]:
    out: list[Case] = []
    for name in sorted(os.listdir(suite_dir)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        if only and only not in name:
            continue
        out.extend(load_suite(os.path.join(suite_dir, name)))
    return out


# ------------------------------------------------------------------------
# verification of the expectations themselves
# ------------------------------------------------------------------------

def _partner(f: Facts, name: str) -> dict | None:
    return f.partner_by_key.get(norm(name))


def _speaker(f: Facts, name: str) -> dict | None:
    return f.speaker_by_key.get(person_key(name))


def verify_claim(f: Facts, claim: dict) -> str | None:
    """Return an error string if the claim does not hold against source data."""
    kind = claim.get("kind")

    if kind == "session_field":
        s = f.session_by_code.get(claim["code"])
        if not s:
            return f"no session with agendaCode {claim['code']}"
        got = s.get(claim["field"])
        if str(got) != str(claim["equals"]):
            return (f"session {claim['code']}.{claim['field']} is {got!r}, "
                    f"case claims {claim['equals']!r}")
        return None

    if kind == "session_closed":
        s = f.session_by_code.get(claim["code"])
        if not s:
            return f"no session with agendaCode {claim['code']}"
        want = bool(claim.get("closed", True))
        if bool(s.get("isClosedDoor")) is not want:
            return (f"session {claim['code']} isClosedDoor="
                    f"{bool(s.get('isClosedDoor'))}, case claims {want}")
        return None

    if kind == "partner_field":
        p = _partner(f, claim["name"])
        if not p:
            return f"no 2026 partner named {claim['name']!r}"
        got = p.get(claim["field"])
        if str(got) != str(claim["equals"]):
            return (f"partner {claim['name']}.{claim['field']} is {got!r}, "
                    f"case claims {claim['equals']!r}")
        return None

    if kind == "partner_field_contains":
        p = _partner(f, claim["name"])
        if not p:
            return f"no 2026 partner named {claim['name']!r}"
        got = str(p.get(claim["field"]) or "")
        if not contains(got, claim["value"]):
            return (f"partner {claim['name']}.{claim['field']} does not contain "
                    f"{claim['value']!r} (is {got[:80]!r})")
        return None

    if kind == "partner_missing":
        p = _partner(f, claim["name"])
        if not p:
            return f"no 2026 partner named {claim['name']!r}"
        bad = []
        for fld in claim["fields"]:
            key = {"description": "whatTheyDo", "website": "website"}.get(fld, fld)
            if p.get(key):
                bad.append(f"{fld} is present ({str(p.get(key))[:40]!r})")
        return f"partner {claim['name']}: " + "; ".join(bad) if bad else None

    if kind == "speaker_field":
        sp = _speaker(f, claim["name"])
        if not sp:
            return f"no 2026 speaker named {claim['name']!r}"
        got = sp.get(claim["field"])
        if str(got) != str(claim["equals"]):
            return (f"speaker {claim['name']}.{claim['field']} is {got!r}, "
                    f"case claims {claim['equals']!r}")
        return None

    if kind == "absent_2026":
        if f.in_2026(claim["text"]):
            return (f"{claim['text']!r} DOES appear in the 2026 corpus — this case "
                    "can no longer test the data-year rule")
        return None

    if kind == "present_2025":
        if not f.in_2025(claim["text"]):
            return f"{claim['text']!r} does not appear in the 2025 data"
        return None

    if kind == "in_2026":
        if not f.in_2026(claim["text"]):
            return f"{claim['text']!r} does not appear in the 2026 corpus"
        return None

    if kind == "count":
        got = f.counts().get(claim["metric"])
        if got is None:
            return f"unknown metric {claim['metric']!r}"
        if int(got) != int(claim["equals"]):
            return f"count {claim['metric']} is {got}, case claims {claim['equals']}"
        return None

    if kind == "no_booth_data":
        n = sum(1 for p in f.partners if p.get("booth"))
        return f"{n} partner rows carry booth data" if n else None

    return f"unknown verify kind {kind!r}"


@dataclass
class ValidationReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    checked: int = 0

    @property
    def ok(self) -> bool:
        return not self.errors


def validate(cases: list[Case], f: Facts) -> ValidationReport:
    rep = ValidationReport()
    known = set(__import__("gffeval.detectors", fromlist=["DETECTORS"]).DETECTORS)

    for c in cases:
        if not c.checks:
            rep.errors.append(f"{c.id}: no checks — case can never fail")
        for chk in c.checks:
            det = chk.get("detector")
            if det not in known:
                rep.errors.append(f"{c.id}: unknown detector {det!r}")
        if not c.verify:
            rep.warnings.append(f"{c.id}: no verify claims — expectations are unproven")
        for claim in c.verify:
            rep.checked += 1
            if (err := verify_claim(f, claim)):
                rep.errors.append(f"{c.id}: {err}")

        # Trace every expected value back to the corpus.
        for chk in c.checks:
            expected: list[str] = []
            expected += chk.get("contains_all", [])
            expected += chk.get("contains_any", [])
            expected += (chk.get("min_of") or {}).get("options", [])
            expected += chk.get("must_include", [])
            for e in expected:
                if norm(e) in GENERIC_LANGUAGE:
                    continue
                if f.in_2026(e):
                    continue
                rep.warnings.append(
                    f"{c.id}: expected string {e!r} is not literally in the 2026 corpus "
                    "(fine for formatting like times/dates, suspicious otherwise)"
                )
    return rep
