#!/usr/bin/env python3
"""Assert the four hard rules against corpus.jsonl. Exits non-zero on violation.

Run after every build. This is the guard that caught two real defects:
a booth number inside a scraped partner blurb, and hall names leaking onto
speaker chunks via the session cross-reference.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "snapshot"

rows = [json.loads(l) for l in (HERE / "corpus.jsonl").open()]
partners = {r["slug"]: r for r in json.loads((DATA / "partners-2026.json").read_text())}
speakers = json.loads((DATA / "speakers-2026.json").read_text())
sessions = {r["agendaCode"]: r for r in json.loads((DATA / "sessions-2026.json").read_text())}

fail: list[str] = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fail.append(msg)


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


print("structure")
check(len(rows) == 1059, f"1059 chunks (got {len(rows)})")
check(len({r['id'] for r in rows}) == len(rows), "chunk ids unique")
check(all(set(r) == {"id", "type", "title", "text", "metadata"} for r in rows), "schema exact")
check(all(r["text"].strip() and r["title"] and isinstance(r["metadata"], dict) for r in rows),
      "no empty text/title, metadata is an object")
counts = Counter(r["type"] for r in rows)
check(counts == {"speaker": 487, "partner": 316, "session": 256}, f"counts by type {dict(counts)}")

print("rule 1 - no fabricated text (every body traces to a source field)")
mismatch = []
for r in rows:
    m, t = r["metadata"], r["type"]
    if t == "partner":
        src = partners[m["slug"]].get("whatTheyDo")
        used = m["hasDescription"]
    elif t == "speaker":
        src = next(x for x in speakers if norm(x["name"]) == norm(m["name"])).get("bio")
        used = m["hasBio"]
    else:
        src = sessions[m["agendaCode"]].get("description")
        used = m["hasDescription"]
    if used and norm(src or "") not in norm(r["text"]):
        mismatch.append(r["id"])
    if not used and src and norm(src) in norm(r["text"]):
        mismatch.append(f"{r['id']}: dropped text still present")
check(not mismatch, f"all bodies verbatim from source ({len(mismatch)} bad)")
check(all(len(r["text"].split()) >= 5 for r in rows), "no chunk shorter than 5 words")

print("rule 2 - no booth/stall data for partners; halls on session chunks only")
loc = re.compile(r"booth\s*(no\.?|number|#|[a-z]{0,3}-?\d)|stall\s*(no\.?|number|#)", re.I)
leaks = [r["id"] for r in rows
         if r["type"] == "partner" and (loc.search(r["text"]) or loc.search(json.dumps(r["metadata"])))]
check(not leaks, f"no booth/stall location on partner chunks ({leaks})")
check(not any("booth" in k.lower() for r in rows for k in r["metadata"]), "no booth-ish metadata key")
halls = {s["hall"] for s in sessions.values() if s.get("hall")}
stray = [r["id"] for r in rows if r["type"] != "session"
         and any(h in r["text"] or h in json.dumps(r["metadata"]) for h in halls)]
check(not stray, f"no hall named outside session chunks ({stray[:3]})")
check(all("hall" in r["metadata"] for r in rows if r["type"] == "session"), "sessions do carry hall")

print("rule 3 - 2026 only")
check(all(r["metadata"].get("year") == 2026 for r in rows), "every chunk year=2026")
check(all(s.get("year") == 2026 for s in sessions.values()), "snapshot is 2026 data")
check(not (HERE / "partners-2025.json").exists(), "no 2025 file copied into workspace")

print("rule 4 - closed-door sessions unmistakably marked")
cd = [r for r in rows if r["type"] == "session" and r["metadata"]["isClosedDoor"]]
check(len(cd) == 34, f"34 closed-door sessions (got {len(cd)})")
check(all(r["metadata"]["attendable"] is False for r in cd), "closed-door => attendable false")
check(all("NOT open to general attendees" in r["text"] for r in cd), "closed-door stated in text")
check(all(r["metadata"]["accessType"] == "invite-only" for r in cd), "accessType invite-only")
open_s = [r for r in rows if r["type"] == "session" and not r["metadata"]["isClosedDoor"]]
check(all(r["metadata"]["attendable"] is True for r in open_s), "open sessions attendable true")
closed_codes = {r["metadata"]["agendaCode"] for r in cd}
bad = [r["id"] for r in rows if r["type"] == "speaker"
       and set(r["metadata"]["sessionCodes"]) & closed_codes
       and not r["metadata"]["speaksInClosedDoorSession"]]
check(not bad, f"speakers in closed-door sessions flagged ({bad})")

print("required filter metadata")
for t, keys in [("session", ["day", "startTime", "endTime", "hall", "format", "track",
                             "isClosedDoor", "agendaCode"]),
                ("speaker", ["org", "title", "country", "sessionCodes"]),
                ("partner", ["tier", "group", "sector", "website"])]:
    missing = [k for k in keys if not all(k in r["metadata"] for r in rows if r["type"] == t)]
    check(not missing, f"{t} metadata has {keys} (missing {missing})")

print()
print("FAILED" if fail else "ALL CHECKS PASSED")
sys.exit(1 if fail else 0)
