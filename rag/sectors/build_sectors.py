#!/usr/bin/env python3
"""Build sectors-2026.json from the read-only partner source + the hand-made decision table.

Design intent: the *evidence* string in the output is machine-extracted verbatim from
the source file, never retyped by hand, so a human auditor can diff it against the
source and see exactly what each sector call was made from.

Run:  python3 build_sectors.py
"""

import json
import os
import sys
from collections import Counter, defaultdict

from decisions import DECISIONS, NO_SIGNAL

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SOURCE = os.environ.get(
    "GFF_PARTNERS", os.path.join(REPO, "data", "2026", "partners-2026.json")
)

# Not companies - logo assets scraped as if they were partners.
NOT_COMPANIES = {"PCI logo", "NPCI logo", "FCC logo"}

UNKNOWN_RECORD = {
    "sector": "Unknown",
    "subSectors": [],
    "confidence": "low",
    "method": "no-evidence",
    "evidence": None,
}


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def evidence_for(partner, basis):
    """Return the exact source text the classification was made from."""
    wtd = (partner.get("whatTheyDo") or "").strip()
    ucs = partner.get("useCases") or []
    if basis == "tier":
        return "partner tier: %s" % json.dumps(partner.get("tier"))
    if basis == "uc":
        return "useCases: " + json.dumps(ucs, ensure_ascii=False)
    if basis == "wtd":
        if ucs:
            return wtd + "  ||  useCases: " + json.dumps(ucs, ensure_ascii=False)
        return wtd
    raise ValueError("unknown basis %r" % basis)


def method_for(partner, basis):
    if basis == "tier":
        return "tier"
    if basis == "uc":
        return "useCases"
    if basis == "wtd":
        return "whatTheyDo+useCases" if partner.get("useCases") else "whatTheyDo"
    raise ValueError(basis)


def main():
    raw = load_json(SOURCE)
    taxonomy = load_json(os.path.join(HERE, "taxonomy.json"))
    sectors = taxonomy["sectors"]

    partners = [p for p in raw if p["name"] not in NOT_COMPANIES]
    by_name = {}
    for p in partners:
        if p["name"] in by_name:
            sys.exit("FATAL: duplicate partner name in source: %r" % p["name"])
        by_name[p["name"]] = p

    dropped = [p["name"] for p in raw if p["name"] in NOT_COMPANIES]
    if len(dropped) != 3:
        sys.exit("FATAL: expected to drop 3 non-company logo entries, dropped %d: %s"
                 % (len(dropped), dropped))

    errors = []

    # --- validate the decision table against the source and the taxonomy ---
    for name, (sector, subs, conf, basis) in DECISIONS.items():
        if name not in by_name:
            errors.append("decision for unknown partner name: %r" % name)
            continue
        if sector not in sectors:
            errors.append("%s: sector %r not in taxonomy" % (name, sector))
            continue
        if sector == "Unknown":
            errors.append("%s: do not put Unknown in the decision table" % name)
        known_subs = set()
        for s in sectors.values():
            known_subs.update(s["subSectors"])
        for sub in subs:
            if sub not in known_subs:
                errors.append("%s: subSector %r not registered in taxonomy" % (name, sub))
        if conf not in ("high", "medium", "low"):
            errors.append("%s: bad confidence %r" % (name, conf))
        p = by_name[name]
        # a decision must actually be backed by the evidence it claims to use
        if basis == "wtd" and not (p.get("whatTheyDo") or "").strip():
            errors.append("%s: claims whatTheyDo basis but source has none" % name)
        if basis == "uc" and not p.get("useCases"):
            errors.append("%s: claims useCases basis but source has none" % name)
        if basis == "tier" and not p.get("tier"):
            errors.append("%s: claims tier basis but source has none" % name)

    for name in NO_SIGNAL:
        if name not in by_name:
            errors.append("NO_SIGNAL entry for unknown partner: %r" % name)
        elif name in DECISIONS:
            errors.append("%s: listed both as classified and as no-signal" % name)

    if errors:
        print("VALIDATION FAILED:")
        for e in errors:
            print("  -", e)
        sys.exit(1)

    # --- emit ---
    out = {}
    for p in partners:
        name = p["name"]
        if name in DECISIONS:
            sector, subs, conf, basis = DECISIONS[name]
            out[name] = {
                "sector": sector,
                "subSectors": subs,
                "confidence": conf,
                "method": method_for(p, basis),
                "evidence": evidence_for(p, basis),
            }
        else:
            rec = dict(UNKNOWN_RECORD)
            if name in NO_SIGNAL:
                rec["method"] = "no-usable-evidence"
                rec["evidence"] = (p.get("whatTheyDo") or "").strip()
                rec["note"] = NO_SIGNAL[name]
            out[name] = rec

    out_path = os.path.join(HERE, "sectors-2026.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    # --- coverage stats ---
    total = len(out)
    classified = [n for n, r in out.items() if r["sector"] != "Unknown"]
    unknown = [n for n, r in out.items() if r["sector"] == "Unknown"]
    by_method = Counter(out[n]["method"] for n in classified)
    by_conf = Counter(out[n]["confidence"] for n in classified)
    by_sector = Counter(r["sector"] for r in out.values())
    unknown_reason = Counter(out[n]["method"] for n in unknown)

    stats = {
        "total": total,
        "classified": len(classified),
        "unknown": len(unknown),
        "byMethod": dict(by_method),
        "byConfidence": dict(by_conf),
        "bySector": dict(by_sector.most_common()),
        "unknownReason": dict(unknown_reason),
    }
    with open(os.path.join(HERE, "coverage.json"), "w", encoding="utf-8") as fh:
        json.dump(stats, fh, indent=2)
        fh.write("\n")

    print("wrote %s" % out_path)
    print("total partners (logos excluded): %d" % total)
    print("classified: %d   unknown: %d" % (len(classified), len(unknown)))
    print("by method:", dict(by_method))
    print("by confidence:", dict(by_conf))
    print("unknown breakdown:", dict(unknown_reason))
    print()
    for sec, n in by_sector.most_common():
        print("  %-42s %3d" % (sec, n))


if __name__ == "__main__":
    main()
