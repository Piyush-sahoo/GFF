"""
Adapters for the thing under test.

The harness must outlive any one implementation of the bot, so it never imports
the bot. It speaks to a target through one method: ask(question) -> answer text.

  http:URL       POST {"question": ...} -> {"answer": ...}  (the Next.js concierge)
  cmd:TEMPLATE   run a shell command; {q} is the question, stdout is the answer
  bot:NAME       a built-in fixture bot from bots/, used to test the harness itself
  replay:FILE    replay a saved responses.json — grade a past run with new rules

A target that errors does not silently pass. TargetError propagates into the
report as a failed case with the transport error attached.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass


class TargetError(RuntimeError):
    pass


@dataclass
class Answer:
    text: str
    meta: dict


class Target:
    name = "target"

    def ask(self, question: str) -> Answer:  # pragma: no cover - interface
        raise NotImplementedError


class HttpTarget(Target):
    """POST to a chat endpoint returning JSON."""

    def __init__(self, url: str, timeout: float = 120.0,
                 field_in: str = "question", field_out: str = "answer"):
        self.url = url
        self.timeout = timeout
        self.field_in = field_in
        self.field_out = field_out
        self.name = f"http:{url}"

    def ask(self, question: str) -> Answer:
        body = json.dumps({self.field_in: question}).encode()
        req = urllib.request.Request(
            self.url, data=body,
            headers={"content-type": "application/json"}, method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:400]
            raise TargetError(f"HTTP {e.code} from {self.url}: {detail}") from e
        except Exception as e:  # timeout, connection refused, bad JSON
            raise TargetError(f"{type(e).__name__} calling {self.url}: {e}") from e

        if isinstance(payload, dict) and payload.get("error") and not payload.get(self.field_out):
            raise TargetError(f"target returned error: {payload['error']}")
        text = payload.get(self.field_out) if isinstance(payload, dict) else None
        if not isinstance(text, str) or not text.strip():
            raise TargetError(f"no {self.field_out!r} string in response: {str(payload)[:300]}")
        meta = {k: v for k, v in payload.items() if k != self.field_out} if isinstance(payload, dict) else {}
        # Citations are bulky and not graded; keep only their count.
        if isinstance(meta.get("citations"), list):
            meta["citations"] = len(meta["citations"])
        return Answer(text.strip(), meta)


class CmdTarget(Target):
    """Shell out. `{q}` in the template is replaced with the quoted question."""

    def __init__(self, template: str, timeout: float = 180.0):
        self.template = template
        self.timeout = timeout
        self.name = f"cmd:{template}"

    def ask(self, question: str) -> Answer:
        cmd = self.template.replace("{q}", shlex.quote(question))
        try:
            proc = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=self.timeout
            )
        except subprocess.TimeoutExpired as e:
            raise TargetError(f"command timed out after {self.timeout}s") from e
        if proc.returncode != 0:
            raise TargetError(
                f"command exited {proc.returncode}: {(proc.stderr or proc.stdout)[:400]}"
            )
        text = (proc.stdout or "").strip()
        if not text:
            raise TargetError("command produced no output")
        return Answer(text, {"returncode": proc.returncode})


class BotTarget(Target):
    """A fixture bot from bots/. Used by tests/ to prove the detectors bite."""

    def __init__(self, bot_name: str):
        import importlib.util
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        path = os.path.join(root, "bots", f"{bot_name}.py")
        if not os.path.exists(path):
            raise TargetError(f"no fixture bot at {path}")
        spec = importlib.util.spec_from_file_location(f"bots.{bot_name}", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        if not hasattr(mod, "answer"):
            raise TargetError(f"bot {bot_name} has no answer(question) function")
        self._fn = mod.answer
        self.name = f"bot:{bot_name}"

    def ask(self, question: str) -> Answer:
        return Answer(self._fn(question), {"fixture": True})


class ReplayTarget(Target):
    """Re-grade a saved run. Rule changes get validated without new API spend."""

    def __init__(self, path: str):
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        self.responses: dict[str, str] = doc.get("responses", doc)
        self.name = f"replay:{path}"

    def ask(self, question: str) -> Answer:
        for key, val in self.responses.items():
            if key == question:
                return Answer(val if isinstance(val, str) else val.get("answer", ""), {"replayed": True})
        raise TargetError("question not present in the replay file")


def build_target(spec: str, timeout: float = 120.0) -> Target:
    if spec.startswith("http://") or spec.startswith("https://"):
        return HttpTarget(spec, timeout=timeout)
    scheme, _, rest = spec.partition(":")
    if scheme == "http" or scheme == "https":
        return HttpTarget(spec, timeout=timeout)
    if scheme == "cmd":
        return CmdTarget(rest, timeout=timeout)
    if scheme == "bot":
        return BotTarget(rest)
    if scheme == "replay":
        return ReplayTarget(rest)
    raise ValueError(
        f"unrecognised target {spec!r}. Use http://…, cmd:…, bot:…, or replay:…"
    )
