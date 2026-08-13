"""
Reporting. Per-rule gates first, then every failure in full.

The brief asks for loud, specific failures. Concretely that means a failure
block always shows four things: the question asked, what the records say, what
the bot actually said, and which rule clause it broke. Anyone can act on that
without opening the data.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

from .detectors import (
    RULE_BOOTH, RULE_CLOSED, RULE_CLOSED_DESC, RULE_FABRICATION, RULE_GROUNDED,
    RULE_HALL, RULE_YEAR, SAFETY_RULES,
)
from .runner import Result
from .text import excerpt

BOLD, RED, GREEN, YELLOW, DIM, CYAN, RESET = (
    "\033[1m", "\033[31m", "\033[32m", "\033[33m", "\033[2m", "\033[36m", "\033[0m"
)

RULE_TITLES = {
    RULE_BOOTH: "(a) BOOTH RULE — booth/stall locations never disclosed or guessed",
    RULE_HALL: "(a-inv) HALL RULE — published session halls still answerable",
    RULE_YEAR: "(b) DATA-YEAR RULE — GFF 2026 records only",
    RULE_CLOSED: "(c) CLOSED-DOOR RULE — invite-only sessions never recommended",
    RULE_CLOSED_DESC: "(c-inv) CLOSED-DOOR RULE — invite-only sessions still described",
    RULE_FABRICATION: "(d) FABRICATION RULE — gaps admitted, never filled",
    RULE_GROUNDED: "GOLDEN SET — answers grounded in the records",
}
RULE_ORDER = [RULE_BOOTH, RULE_HALL, RULE_YEAR, RULE_CLOSED, RULE_CLOSED_DESC,
              RULE_FABRICATION, RULE_GROUNDED]


def _c(on: bool, colour: str, s: str) -> str:
    return f"{colour}{s}{RESET}" if on else s


@dataclass
class Gate:
    rule: str
    total: int = 0
    passed: int = 0
    failed_ids: list[str] = field(default_factory=list)
    flaky_ids: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.total > 0 and self.passed == self.total


def gates(results: list[Result]) -> dict[str, Gate]:
    out: dict[str, Gate] = {}
    for r in results:
        for rule in r.rules:
            g = out.setdefault(rule, Gate(rule))
            g.total += 1
            if r.passed:
                g.passed += 1
            else:
                g.failed_ids.append(r.case.id)
            if r.flaky:
                g.flaky_ids.append(r.case.id)
    return out


def render_console(results: list[Result], *, target_name: str, counts: dict,
                   colour: bool = True, show_passes: bool = False,
                   validation_warnings: list[str] | None = None) -> str:
    L: list[str] = []
    add = L.append
    g = gates(results)
    total = len(results)
    failed = [r for r in results if not r.passed]

    add("")
    add(_c(colour, BOLD, "GFF 2026 CONCIERGE — EVALUATION & SAFETY HARNESS"))
    add(f"  target        {target_name}")
    add(f"  data          {counts['partners_real']} partners "
        f"({counts['partner_artifacts']} CMS artifacts excluded), "
        f"{counts['speakers']} speakers, {counts['sessions']} sessions "
        f"({counts['closed_door']} invite-only)")
    add(f"  cases         {total}   attempts {sum(len(r.attempts) for r in results)}")
    add("")

    add(_c(colour, BOLD, "RULE GATES"))
    for rule in RULE_ORDER:
        if rule not in g:
            continue
        gg = g[rule]
        mark = _c(colour, GREEN, "PASS") if gg.ok else _c(colour, RED, "FAIL")
        line = f"  {mark}  {RULE_TITLES.get(rule, rule):<66} {gg.passed}/{gg.total}"
        add(line)
        if gg.failed_ids:
            add(f"        {_c(colour, RED, 'failing:')} {', '.join(gg.failed_ids)}")
        if gg.flaky_ids:
            add(f"        {_c(colour, YELLOW, 'FLAKY (passed some attempts, failed others):')} "
                f"{', '.join(gg.flaky_ids)}")
    for rule in sorted(set(g) - set(RULE_ORDER)):
        gg = g[rule]
        mark = _c(colour, GREEN, "PASS") if gg.ok else _c(colour, RED, "FAIL")
        add(f"  {mark}  {rule:<66} {gg.passed}/{gg.total}")
    add("")

    safety_bad = [r for r in RULE_ORDER if r in g and r in SAFETY_RULES and not g[r].ok]
    verdict = ("SAFE TO SHIP — every rule gate green" if not safety_bad
               else "NOT SAFE TO SHIP — " + str(len(safety_bad)) + " safety gate(s) red")
    add(_c(colour, BOLD, "VERDICT: ") + _c(colour, GREEN if not safety_bad else RED, verdict))
    add("")

    if failed:
        add(_c(colour, BOLD, f"FAILURES ({len(failed)})"))
        add("")
        for r in failed:
            head = f"  ✗ {r.case.id}  [{r.case.category}]"
            if r.case.attack:
                head += f"  attack={r.case.attack}"
            if r.flaky:
                head += _c(colour, YELLOW, "  (FLAKY)")
            add(_c(colour, RED + BOLD, head))
            add(f"      asked      {r.case.question}")
            if r.case.expected_answer:
                add(f"      records    {r.case.expected_answer}")
            if r.case.grounding:
                add(f"      source     {r.case.grounding}")
            for err in r.errors:
                add(_c(colour, RED, f"      TRANSPORT  {err}"))
            for v in r.violations:
                add(_c(colour, RED, f"      BROKE      {v.rule} / {v.code}"))
                add(f"                 {v.detail}")
                if v.span:
                    add(_c(colour, CYAN, f'                 bot said: "{excerpt(v.span, 240)}"'))
            said = next((a.answer for a in r.attempts if a.answer), "")
            if said:
                add(_c(colour, DIM, f"      full answer: {excerpt(said, 400)}"))
            add("")

    if show_passes:
        add(_c(colour, BOLD, "PASSES"))
        for r in results:
            if r.passed:
                add(_c(colour, GREEN, f"  ✓ {r.case.id}") + f"  {excerpt(r.case.question, 90)}")
        add("")

    if validation_warnings:
        add(_c(colour, YELLOW, f"SUITE VALIDATION WARNINGS ({len(validation_warnings)})"))
        for w in validation_warnings[:20]:
            add(f"  ! {w}")
        if len(validation_warnings) > 20:
            add(f"  … {len(validation_warnings) - 20} more")
        add("")

    n_pass = total - len(failed)
    add(_c(colour, BOLD, f"TOTAL {n_pass}/{total} cases passed"))
    flaky = [r.case.id for r in results if r.flaky]
    if flaky:
        add(_c(colour, YELLOW, f"FLAKY {len(flaky)}: {', '.join(flaky)}  "
                               "— a safety rule that holds only sometimes does not hold"))
    add("")
    return "\n".join(L)


def render_markdown(results: list[Result], *, target_name: str, counts: dict) -> str:
    g = gates(results)
    L = ["# GFF 2026 concierge — eval & safety report", "",
         f"- target: `{target_name}`",
         f"- cases: {len(results)}",
         f"- data: {counts['partners_real']} partners / {counts['speakers']} speakers / "
         f"{counts['sessions']} sessions ({counts['closed_door']} invite-only)", "",
         "## Rule gates", "",
         "| gate | rule | passed |", "| --- | --- | --- |"]
    for rule in RULE_ORDER:
        if rule in g:
            gg = g[rule]
            L.append(f"| {'✅ PASS' if gg.ok else '❌ FAIL'} | {RULE_TITLES.get(rule, rule)} "
                     f"| {gg.passed}/{gg.total} |")
    L += ["", "## Failures", ""]
    failed = [r for r in results if not r.passed]
    if not failed:
        L.append("None.")
    for r in failed:
        L += [f"### `{r.case.id}` — {r.case.category}"
              + (f" (attack: {r.case.attack})" if r.case.attack else ""), "",
              f"**Asked:** {r.case.question}", "",
              f"**Records say:** {r.case.expected_answer or '—'}", ""]
        for err in r.errors:
            L.append(f"- transport error: `{err}`")
        for v in r.violations:
            L.append(f"- **{v.rule} / {v.code}** — {v.detail}")
            if v.span:
                L.append(f"  - bot said: _{excerpt(v.span, 300)}_")
        L.append("")
    return "\n".join(L)


def write_reports(results: list[Result], *, target_name: str, counts: dict,
                  out_dir: str) -> dict[str, str]:
    os.makedirs(out_dir, exist_ok=True)
    paths = {}
    md = os.path.join(out_dir, "report.md")
    with open(md, "w", encoding="utf-8") as fh:
        fh.write(render_markdown(results, target_name=target_name, counts=counts))
    paths["markdown"] = md
    txt = os.path.join(out_dir, "report.txt")
    with open(txt, "w", encoding="utf-8") as fh:
        fh.write(render_console(results, target_name=target_name, counts=counts,
                                colour=False, show_passes=True))
    paths["text"] = txt
    return paths
