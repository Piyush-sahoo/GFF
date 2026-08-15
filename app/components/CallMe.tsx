"use client";

import { useState } from "react";
import { FEST_DAYS, type FestDay } from "../lib/types";

/**
 * "Call me with this plan."
 *
 * The day is chosen explicitly and defaults to Day 1. There is deliberately no
 * "today" option and no clock: the app has no idea when it is being used, and a
 * guessed "today" during a three-day fest is the kind of confident wrongness
 * that makes someone miss a session. An explicit picker is honest.
 */
const DAY_LABELS: Record<FestDay, string> = {
  "2026-09-09": "Day 1 · Wed 9 Sep",
  "2026-09-10": "Day 2 · Thu 10 Sep",
  "2026-09-11": "Day 3 · Fri 11 Sep",
};

type Props = {
  /** Sessions per day, so the button can say what it will actually read out. */
  countsByDay: Record<string, number>;
};

export default function CallMe({ countsByDay }: Props) {
  const [day, setDay] = useState<FestDay>(FEST_DAYS[0]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const count = countsByDay[day] ?? 0;

  async function call() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day }),
      });
      const data = await res.json();
      setResult(
        res.ok
          ? { ok: true, text: `Calling your registered number now with your ${DAY_LABELS[day].split(" · ")[0]} plan.` }
          : { ok: false, text: data.error ?? "The call could not be placed." },
      );
    } catch {
      setResult({ ok: false, text: "Network error — nothing was dialled." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="callme">
      <div className="callme-head">Hear it on the phone</div>

      <div className="callme-days">
        {FEST_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            className={`callme-day${d === day ? " on" : ""}`}
            onClick={() => setDay(d)}
            aria-pressed={d === day}
          >
            {DAY_LABELS[d]}
            <span className="callme-n">
              {countsByDay[d] ?? 0} session{(countsByDay[d] ?? 0) === 1 ? "" : "s"}
            </span>
          </button>
        ))}
      </div>

      <button type="button" className="callme-go" onClick={call} disabled={busy || count === 0}>
        {busy ? "Dialling…" : "Call me with this plan"}
      </button>

      <p className="callme-note">
        {count === 0
          ? `Nothing planned for ${DAY_LABELS[day].split(" · ")[0]} yet — add something and the button turns on.`
          : "Calls the phone number on your account, and only that number."}
      </p>

      {result && <p className={`callme-result${result.ok ? " ok" : " err"}`}>{result.text}</p>}
    </div>
  );
}
