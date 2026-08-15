#!/usr/bin/env python3
"""Print partners that still need a hand decision (evidence exists but no entry yet),
plus any partner whose evidence changed after I classified it."""
import json, os, sys
from decisions import DECISIONS, NO_SIGNAL

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SOURCE = os.environ.get(
    "GFF_PARTNERS", os.path.join(REPO, "data", "2026", "partners-2026.json")
)
NOT_COMPANIES = {"PCI logo", "NPCI logo", "FCC logo"}

raw = [p for p in json.load(open(SOURCE, encoding="utf-8")) if p["name"] not in NOT_COMPANIES]

pending = []
for p in raw:
    n = p["name"]
    if n in DECISIONS:
        continue
    wtd = (p.get("whatTheyDo") or "").strip()
    if not wtd and not p.get("useCases"):
        continue
    pending.append(p)

print("PENDING (has evidence, no decision yet): %d" % len(pending))
for p in pending:
    flag = " [was-no-signal]" if p["name"] in NO_SIGNAL else ""
    print("\n### %s :: %s%s" % (p["name"], p["tier"], flag))
    print("WTD: %s" % (p.get("whatTheyDo") or "")[:500])
    print("UC : %s" % p.get("useCases"))
