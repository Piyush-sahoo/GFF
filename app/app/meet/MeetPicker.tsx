"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MeetResponse, SharedPlanSummary } from "../../lib/types";
import PersonCardStyle from "../../components/PersonCardStyle";

export type SlimForMeet = {
  agendaCode: string;
  title: string;
  day: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  hall: string | null;
};

const MIN_PEOPLE = 2;
const MAX_PEOPLE = 4;

export default function MeetPicker({
  people,
  sessions,
  dayLabels,
  initial,
}: {
  people: SharedPlanSummary[];
  sessions: SlimForMeet[];
  dayLabels: Record<string, string>;
  initial: string[];
}) {
  const [picked, setPicked] = useState<string[]>(
    initial.filter((s) => people.some((p) => p.slug === s)).slice(0, MAX_PEOPLE),
  );
  const [result, setResult] = useState<MeetResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byCode = useMemo(() => new Map(sessions.map((s) => [s.agendaCode, s])), [sessions]);

  function toggle(slug: string) {
    setResult(null);
    setErr(null);
    setPicked((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length >= MAX_PEOPLE
          ? prev
          : [...prev, slug],
    );
  }

  const find = useCallback(async (slugs: string[]) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/meet?slugs=${encodeURIComponent(slugs.join(","))}`);
      const d = await r.json();
      if (!r.ok) {
        setResult(null);
        setErr(d.error ?? "Could not work that out.");
        return;
      }
      setResult(d);
      // Keep the selection in the URL so a meeting point can be sent to the
      // people it is about.
      const url = new URL(window.location.href);
      url.searchParams.set("with", slugs.join(","));
      window.history.replaceState(null, "", url.toString());
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }, []);

  // A link with ?with=a,b arrives ready to answer; don't make them click again.
  useEffect(() => {
    if (picked.length >= MIN_PEOPLE && initial.length >= MIN_PEOPLE) find(picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!people.length) {
    return (
      <div className="pending">
        <div className="pending-mark">Nobody has shared a plan</div>
        <h3>There is nothing to compare yet.</h3>
        <p>
          A plan is only readable here when its owner has opted in to sharing it — being listed in the{" "}
          <Link href="/people">directory</Link> is not enough on its own. Share yours from your{" "}
          <Link href="/profile">profile</Link>.
        </p>
      </div>
    );
  }

  return (
    <>
      <PersonCardStyle />
      <p className="coverage">
        {people.length} {people.length === 1 ? "person has" : "people have"} shared a plan. Pick{" "}
        {MIN_PEOPLE}–{MAX_PEOPLE}.{" "}
        {picked.length > 0 && (
          <strong>
            {picked.length} selected
            {picked.length >= MAX_PEOPLE && " — that's the maximum"}.
          </strong>
        )}
      </p>

      <div className="spgrid">
        {people.map((p) => {
          const on = picked.includes(p.slug);
          return (
            <button
              type="button"
              key={p.slug}
              className="spcard spcard-btn"
              data-on={on}
              onClick={() => toggle(p.slug)}
              style={{ cursor: "pointer", opacity: !on && picked.length >= MAX_PEOPLE ? 0.5 : 1 }}
              aria-pressed={on}
            >
              <span className="sphead placeholder">{(p.name || "?").slice(0, 1).toUpperCase()}</span>
              <div className="spbody">
                <h3 className="pname">
                  <span className="pname-link">
                    {on ? "✓ " : ""}
                    {p.name}
                  </span>
                  {p.isDemo && <span className="pname-badge">Demo attendee</span>}
                </h3>
                {(p.role || p.org) && (
                  <div className="sprole">{[p.role, p.org].filter(Boolean).join(" · ")}</div>
                )}
                <p className="spbio">
                  {p.sessions.length} session{p.sessions.length === 1 ? "" : "s"} in their plan
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="objrow">
        <button type="button" disabled={picked.length < MIN_PEOPLE || busy} onClick={() => find(picked)}>
          {busy ? "Working it out…" : "Find a meeting point"}
        </button>
        {picked.length > 0 && (
          <button type="button" className="clearfilters" onClick={() => { setPicked([]); setResult(null); setErr(null); }}>
            clear selection
          </button>
        )}
      </div>

      {err && <p className="coverage warn" role="alert">{err}</p>}

      {result && (
        <>
          <div className="section-head">
            <h2 className="sec">
              {result.people.map((p) => p.name).join(", ")}
            </h2>
          </div>

          {result.unavailable.length > 0 && (
            <p className="coverage warn">
              {result.unavailable.length} of the people you picked no longer has a shared plan and was
              left out. Sharing can be switched off at any time.
            </p>
          )}

          <section className="matchsec">
            <h3 className="matchh">
              Sessions you are all already going to{" "}
              {result.sharedSessions.length > 0 && <span className="matchbest">strongest answer</span>}
            </h3>
            {result.sharedSessions.length === 0 ? (
              <p className="matchcov">
                Nothing in common — no single session appears in all {result.people.length} plans.
              </p>
            ) : (
              <ol className="timetable">
                {result.sharedSessions.map((code) => {
                  const s = byCode.get(code);
                  if (!s) return null;
                  return (
                    <li className="slot" key={code}>
                      <div className="slot-time">
                        <span className="t1">{s.startTime}</span>
                        <span className="t2">{s.endTime}</span>
                      </div>
                      <div className="slot-body">
                        <h3>
                          <Link href={`/agenda/${code}`}>{s.title}</Link>
                        </h3>
                        <div className="slot-meta">
                          <span className="mpill">{s.dayLabel}</span>
                          {s.hall && <span className="mpill">{s.hall}</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="matchsec">
            <h3 className="matchh">When everyone is free</h3>
            {result.freeWindows.length === 0 ? (
              <p className="matchcov">
                There is no window on any day when all {result.people.length} of you are unbooked. You
                would have to drop something to meet.
              </p>
            ) : (
              <>
                <p className="matchcov">
                  Gaps inside published festival hours when nobody selected has anything booked. We say
                  when, not where — GFF published no 2026 floor plan, so pick the spot yourselves.
                </p>
                <ol className="timetable">
                  {result.freeWindows.map((w) => (
                    <li className="slot" key={`${w.day}-${w.start}`}>
                      <div className="slot-time">
                        <span className="t1">{w.start}</span>
                        <span className="t2">{w.end}</span>
                      </div>
                      <div className="slot-body">
                        <h3>
                          {Math.floor(w.minutes / 60) > 0 && `${Math.floor(w.minutes / 60)}h `}
                          {w.minutes % 60 > 0 && `${w.minutes % 60}m`} free
                        </h3>
                        <div className="slot-meta">
                          <span className="mpill">{dayLabels[w.day] ?? w.day}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>

          {result.commonInterests.length > 0 && (
            <section className="matchsec">
              <h3 className="matchh">What more than one of you is chasing</h3>
              <p className="matchcov">
                Topics and exhibitors appearing in at least two of the selected plans — a reason to talk,
                not a place to stand.
              </p>
              <div className="matchterms">
                {result.commonInterests.map((c) => (
                  <span className="term" key={`${c.kind}-${c.label}`}>
                    {c.label} <span className="chip-n">{c.count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {result.sharedSessions.length === 0 && result.freeWindows.length === 0 && (
            <div className="pending">
              <div className="pending-mark">No meeting point</div>
              <h3>These plans do not meet.</h3>
              <p>
                No session is in all of them and there is no gap when everyone is free. We are not going
                to invent a time — try a smaller group, or someone drops a session.
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
