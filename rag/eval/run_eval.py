#!/usr/bin/env python3
"""
GFF 2026 attendee-chatbot evaluation and safety harness.

  # score the live concierge
  ./run_eval.py --target http://localhost:3311/api/chat

  # safety suite only, three attempts each (an LLM rule must hold every time)
  ./run_eval.py --target http://localhost:3311/api/chat --suite adversarial --repeat 3

  # re-grade the last run after changing a detector — costs nothing
  ./run_eval.py --target replay:runs/latest/responses.json

  # prove the harness itself bites (fixture bots, no network)
  ./run_eval.py --target bot:leaky_bot --expect-fail

Exit codes:  0 all gates green · 1 a rule gate is red · 2 the suite itself is invalid.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gffeval import report as reporting
from gffeval.cases import load_all, validate
from gffeval.detectors import SAFETY_RULES
from gffeval.facts import DEFAULT_DATA_DIR, load_facts
from gffeval.runner import run_suite, save_run
from gffeval.targets import build_target

HERE = os.path.dirname(os.path.abspath(__file__))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Evaluate a GFF 2026 attendee chatbot against the golden set "
                    "and the adversarial safety suite.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("--target", required=False, default=os.environ.get("GFF_TARGET", ""),
                    help="http://…/api/chat | cmd:'…{q}…' | bot:NAME | replay:FILE")
    ap.add_argument("--data-dir", default=DEFAULT_DATA_DIR,
                    help="read-only directory holding the *-2026.json records")
    ap.add_argument("--suite", default=None,
                    help="substring filter on suite filename, e.g. golden / adversarial")
    ap.add_argument("--case", default=None, help="substring filter on case id")
    ap.add_argument("--category", default=None, help="filter on case category")
    ap.add_argument("--rule", default=None, help="filter to cases gating this rule")
    ap.add_argument("--repeat", type=int, default=1, help="attempts per case")
    ap.add_argument("--safety-repeat", type=int, default=None,
                    help="attempts per SAFETY case (defaults to --repeat)")
    ap.add_argument("--workers", type=int, default=4, help="concurrent requests")
    ap.add_argument("--timeout", type=float, default=120.0, help="per-request timeout (s)")
    ap.add_argument("--out", default=None, help="run directory (default runs/<timestamp>)")
    ap.add_argument("--show-passes", action="store_true")
    ap.add_argument("--no-colour", action="store_true")
    ap.add_argument("--validate-only", action="store_true",
                    help="check the suites against the records and exit")
    ap.add_argument("--strict-validate", action="store_true",
                    help="treat suite validation warnings as errors")
    ap.add_argument("--expect-fail", action="store_true",
                    help="invert the exit code; used to prove the detectors bite")
    ap.add_argument("--list", action="store_true", help="list cases and exit")
    args = ap.parse_args(argv)

    facts = load_facts(args.data_dir)
    cases = load_all(only=args.suite)
    if args.case:
        cases = [c for c in cases if args.case in c.id]
    if args.category:
        cases = [c for c in cases if c.category == args.category]
    if args.rule:
        cases = [c for c in cases if any(args.rule.upper() in r for r in c.rules)]
    if not cases:
        print("no cases matched the filters", file=sys.stderr)
        return 2

    if args.list:
        for c in cases:
            print(f"{c.id:<26} {c.suite:<12} {c.category:<22} "
                  f"{'|'.join(c.rules) or '-':<40} {c.question[:70]}")
        print(f"\n{len(cases)} cases")
        return 0

    # ---- the suite has to be valid before it is allowed to judge anything ----
    v = validate(cases, facts)
    if v.errors:
        print("\nSUITE IS INVALID — expectations no longer match the source records.")
        print("These are errors in the eval, not in the bot. Fix them first.\n")
        for e in v.errors:
            print(f"  ✗ {e}")
        print(f"\n{len(v.errors)} error(s) across {v.checked} verified claims.")
        return 2
    if args.strict_validate and v.warnings:
        print("\nSUITE VALIDATION WARNINGS (strict mode):")
        for w in v.warnings:
            print(f"  ! {w}")
        return 2
    if args.validate_only:
        print(f"suite valid: {len(cases)} cases, {v.checked} ground-truth claims re-verified "
              f"against {args.data_dir}")
        print(json.dumps(facts.counts(), indent=2))
        for w in v.warnings:
            print(f"  ! {w}")
        return 0

    if not args.target:
        print("--target is required (or set GFF_TARGET). See --help.", file=sys.stderr)
        return 2

    target = build_target(args.target, timeout=args.timeout)
    out_dir = args.out or os.path.join(HERE, "runs", time.strftime("%Y%m%d-%H%M%S"))

    done = [0]
    total = len(cases)

    def tick(res) -> None:
        done[0] += 1
        mark = "✓" if res.passed else "✗"
        sys.stderr.write(f"\r  {done[0]}/{total} {mark} {res.case.id:<28}")
        sys.stderr.flush()

    sys.stderr.write(f"running {total} cases against {target.name}\n")
    results = run_suite(cases, target, facts, repeat=args.repeat,
                        safety_repeat=args.safety_repeat, workers=args.workers,
                        on_done=tick)
    sys.stderr.write("\r" + " " * 60 + "\r")

    counts = facts.counts()
    print(reporting.render_console(
        results, target_name=target.name, counts=counts,
        colour=not args.no_colour and sys.stdout.isatty(),
        show_passes=args.show_passes, validation_warnings=v.warnings,
    ))

    save_run(results, target, facts, out_dir)
    paths = reporting.write_reports(results, target_name=target.name,
                                    counts=counts, out_dir=out_dir)
    latest = os.path.join(HERE, "runs", "latest")
    if os.path.islink(latest) or os.path.exists(latest):
        if os.path.islink(latest):
            os.unlink(latest)
        else:
            shutil.rmtree(latest)
    os.symlink(os.path.abspath(out_dir), latest)
    print(f"artifacts: {out_dir}/  (results.json, responses.json, report.md, report.txt)")
    print(f"re-grade without spending a token:  ./run_eval.py --target "
          f"replay:{os.path.relpath(out_dir, HERE)}/responses.json")

    g = reporting.gates(results)
    safety_red = [r for r, gg in g.items() if r in SAFETY_RULES and not gg.ok]
    any_red = [r for r, gg in g.items() if not gg.ok]
    failed = any_red if not safety_red else safety_red
    code = 1 if failed else 0
    if args.expect_fail:
        if code == 0:
            print("\n--expect-fail: expected at least one red gate, got none. "
                  "The detectors are not biting.")
            return 1
        print("\n--expect-fail: red gates observed as intended.")
        return 0
    return code


if __name__ == "__main__":
    raise SystemExit(main())
