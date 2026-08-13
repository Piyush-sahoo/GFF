"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readBookmarks, writeBookmarks, type SlimSession } from "./AgendaList";

function toMin(t: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

export default function MyPlan({ sessions }: { sessions: SlimSession[] }) {
  const [marks, setMarks] = useState<string[] | null>(null);

  useEffect(() => setMarks(readBookmarks()), []);

  function remove(code: string) {
    setMarks((prev) => {
      const next = (prev ?? []).filter((c) => c !== code);
      writeBookmarks(next);
      return next;
    });
  }

  const chosen = useMemo(
    () => (marks ? sessions.filter((s) => marks.includes(s.agendaCode)) : []),
    [sessions, marks],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, SlimSession[]>();
    for (const s of chosen) {
      const list = m.get(s.day) ?? [];
      list.push(s);
      m.set(s.day, list);
    }
    for (const [, list] of m) list.sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [chosen]);

  /** A clash is any pair on the same day whose time ranges intersect. */
  const clashes = useMemo(() => {
    const set = new Set<string>();
    for (const [, list] of byDay) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime)) {
            set.add(a.agendaCode);
            set.add(b.agendaCode);
          }
        }
      }
    }
    return set;
  }, [byDay]);

  if (marks === null) return <div className="coverage">Loading your plan…</div>;

  if (!chosen.length) {
    return (
      <div className="pending">
        <div className="pending-mark">Nothing saved yet</div>
        <h3>Your plan is empty.</h3>
        <p>
          Browse the <Link href="/agenda">agenda</Link> and tap Save on any session to build a personal
          schedule. Invite-only sessions can&apos;t be saved.
        </p>
        <p className="pending-foot">
          <span className="pending-dim">
            Saved sessions live in this browser only — no account, no server, nothing shared. Clearing
            your browser data will clear the plan.
          </span>
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="coverage">
        <strong>{chosen.length}</strong> session{chosen.length === 1 ? "" : "s"} saved across{" "}
        {byDay.length} day{byDay.length === 1 ? "" : "s"}.
        {clashes.size > 0 && (
          <> <span className="clashwarn">{clashes.size} of them overlap in time.</span></>
        )}{" "}
        Stored in this browser only.
      </p>

      {byDay.map(([day, list]) => (
        <section className="matchsec" key={day}>
          <h3 className="matchh">{list[0].dayLabel}</h3>
          <ol className="timetable">
            {list.map((s) => (
              <li className="slot" key={s.agendaCode} data-clash={clashes.has(s.agendaCode)}>
                <div className="slot-time">
                  <span className="t1">{s.startTime}</span>
                  <span className="t2">{s.endTime}</span>
                </div>
                <div className="slot-body">
                  <h3>{s.title}</h3>
                  <div className="slot-meta">
                    {s.hall && <span className="mpill">{s.hall}</span>}
                    {s.format && <span className="mpill">{s.format}</span>}
                    {clashes.has(s.agendaCode) && <span className="mpill clash">Overlaps</span>}
                  </div>
                  {s.speakers.length > 0 && <div className="slot-speakers">{s.speakers.join(" · ")}</div>}
                </div>
                <div className="slot-act">
                  <button className="bookmark" data-on onClick={() => remove(s.agendaCode)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
