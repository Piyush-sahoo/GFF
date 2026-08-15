"""
Execution and scoring.

Two things here that matter more than they look:

REPEATS. The system under test is an LLM. A safety rule that holds four times
out of five is not held. `--repeat N` asks each safety case N times and a case
passes only if EVERY attempt passes; flakiness is reported by name, because a
flaky booth refusal is the failure mode that ships.

CACHING. Every run writes responses.json. `--target replay:<file>` re-grades
those exact answers, so tightening a detector costs nothing and can be checked
against the last real run before anyone pays for another.
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import time
from dataclasses import asdict, dataclass, field

from .cases import Case
from .detectors import DETECTORS, RULE_GROUNDED, SAFETY_RULES, Violation
from .facts import Facts
from .targets import Answer, Target, TargetError


@dataclass
class Attempt:
    answer: str = ""
    error: str = ""
    violations: list[Violation] = field(default_factory=list)
    meta: dict = field(default_factory=dict)
    seconds: float = 0.0

    @property
    def passed(self) -> bool:
        return not self.error and not self.violations


@dataclass
class Result:
    case: Case
    attempts: list[Attempt] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return bool(self.attempts) and all(a.passed for a in self.attempts)

    @property
    def flaky(self) -> bool:
        return len(self.attempts) > 1 and any(a.passed for a in self.attempts) and not self.passed

    @property
    def violations(self) -> list[Violation]:
        seen, out = set(), []
        for a in self.attempts:
            for v in a.violations:
                key = (v.rule, v.code, v.span[:80])
                if key not in seen:
                    seen.add(key)
                    out.append(v)
        return out

    @property
    def errors(self) -> list[str]:
        return [a.error for a in self.attempts if a.error]

    @property
    def rules(self) -> list[str]:
        """Rules this case gates. Declared on the case; violations fill the gap."""
        return (sorted(set(self.case.rules))
                or sorted({v.rule for v in self.violations})
                or [RULE_GROUNDED])


def _resolve_args(chk: dict, case: Case, facts: Facts) -> dict:
    """Turn a check spec into detector kwargs, injecting derived facts."""
    args = {k: v for k, v in chk.items() if k != "detector"}
    args.setdefault("halls", facts.halls)
    args.setdefault("entity", chk.get("entity", ""))
    # Let a case name a partner and have the missing fields derived, so the
    # fabrication suite tracks the data instead of a snapshot of it.
    if chk.get("detector") == "no_fabrication" and chk.get("partner"):
        from .text import norm
        p = facts.partner_by_key.get(norm(chk["partner"]))
        if p is not None:
            derived = []
            if not p.get("whatTheyDo"):
                derived.append("description")
            if not p.get("website"):
                derived.append("website")
            args["missing_fields"] = chk.get("missing_fields") or derived
            args["entity"] = chk.get("entity") or p["name"]
    return args


def grade(case: Case, answer: str, facts: Facts) -> list[Violation]:
    out: list[Violation] = []
    for chk in case.checks:
        det = DETECTORS[chk["detector"]]
        out.extend(det(answer, **_resolve_args(chk, case, facts)))
    return out


def run_case(case: Case, target: Target, facts: Facts, repeat: int = 1) -> Result:
    res = Result(case=case)
    for _ in range(max(1, repeat)):
        t0 = time.time()
        try:
            ans: Answer = target.ask(case.question)
        except TargetError as e:
            res.attempts.append(Attempt(error=str(e), seconds=time.time() - t0))
            continue
        except Exception as e:  # noqa: BLE001 - never let one case kill the run
            res.attempts.append(Attempt(error=f"{type(e).__name__}: {e}",
                                        seconds=time.time() - t0))
            continue
        res.attempts.append(Attempt(
            answer=ans.text,
            violations=grade(case, ans.text, facts),
            meta=ans.meta,
            seconds=time.time() - t0,
        ))
    return res


def run_suite(cases: list[Case], target: Target, facts: Facts, *,
              repeat: int = 1, safety_repeat: int | None = None,
              workers: int = 4, on_done=None) -> list[Result]:
    def repeats_for(c: Case) -> int:
        is_safety = any(r in SAFETY_RULES for r in c.rules)
        if is_safety and safety_repeat:
            return safety_repeat
        return repeat

    results: list[Result] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(run_case, c, target, facts, repeats_for(c)): c for c in cases}
        for fut in concurrent.futures.as_completed(futures):
            res = fut.result()
            results.append(res)
            if on_done:
                on_done(res)
    order = {c.id: i for i, c in enumerate(cases)}
    results.sort(key=lambda r: order[r.case.id])
    return results


# ------------------------------------------------------------------------
# persistence
# ------------------------------------------------------------------------

def save_run(results: list[Result], target: Target, facts: Facts, out_dir: str) -> str:
    os.makedirs(out_dir, exist_ok=True)
    responses = {}
    for r in results:
        for a in r.attempts:
            if a.answer:
                responses[r.case.question] = a.answer
                break
    with open(os.path.join(out_dir, "responses.json"), "w", encoding="utf-8") as fh:
        json.dump({"target": target.name, "responses": responses}, fh,
                  indent=2, ensure_ascii=False)

    payload = {
        "target": target.name,
        "data_counts": facts.counts(),
        "results": [
            {
                "id": r.case.id,
                "suite": r.case.suite,
                "category": r.case.category,
                "attack": r.case.attack,
                "rules": r.case.rules,
                "question": r.case.question,
                "expected_answer": r.case.expected_answer,
                "passed": r.passed,
                "flaky": r.flaky,
                "attempts": len(r.attempts),
                "errors": r.errors,
                "violations": [asdict(v) for v in r.violations],
                "answers": [a.answer for a in r.attempts],
            }
            for r in results
        ],
    }
    path = os.path.join(out_dir, "results.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
    return path
