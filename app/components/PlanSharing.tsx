"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Plan } from "../lib/types";

/**
 * The second, separate opt-in.
 *
 * consentPublic puts a name in a directory. This publishes a timetable: which
 * room a named person is in, at what time, for three days. Bundling the two
 * into one checkbox would mean nobody ever actually chose the second one, so
 * it lives here on its own and starts off.
 */
export default function PlanSharing() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none" | "off">("loading");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plan")
      .then(async (r) => {
        if (!r.ok) return setState("off");
        const d = await r.json();
        if (!d.plan) return setState("none");
        setPlan(d.plan);
        setState("ready");
      })
      .catch(() => setState("off"));
  }, []);

  async function set(visibility: "private" | "shared") {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/plan/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      const d = await r.json();
      if (!r.ok) return setErr(d.error ?? "Could not change that.");
      setPlan(d.plan);
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "off") return null;

  if (state === "none") {
    return (
      <p className="coverage">
        You have nothing in your plan yet, so there is nothing to share. Save a session from the{" "}
        <Link href="/agenda">agenda</Link> first.
      </p>
    );
  }

  const shared = plan?.visibility === "shared";
  const count = (plan?.sessions.length ?? 0) + (plan?.partners.length ?? 0);

  return (
    <div className="coverage">
      <label className="consent">
        <input type="checkbox" checked={shared} disabled={busy} onChange={(e) => set(e.target.checked ? "shared" : "private")} />
        <span>
          <strong>Share my plan with other attendees</strong> so they can find a time to meet me. This
          is separate from being listed in the directory, because it discloses something different:
          your {count} saved item{count === 1 ? "" : "s"} tell anyone reading which room you are in and
          when, across all three days. Off by default. Untick it and your plan disappears from{" "}
          <Link href="/meet">the meeting-point page</Link> immediately — there is no cached copy.
        </span>
      </label>
      {shared && (
        <p className="mthin">
          Currently shared. Your email is never shown — people see your name and profile slug only.
        </p>
      )}
      {err && <p className="mthin" style={{ color: "#ff9b9b" }}>{err}</p>}
    </div>
  );
}
