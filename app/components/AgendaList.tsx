"use client";

import { useEffect, useMemo, useState } from "react";

export type SlimSession = {
  agendaCode: string;
  title: string;
  day: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  hall: string | null;
  format: string | null;
  track: string | null;
  closedDoor: boolean;
  speakers: string[];
};

const KEY = "gff.bookmarks.v1";

export function readBookmarks(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function writeBookmarks(codes: string[]) {
  localStorage.setItem(KEY, JSON.stringify(codes));
}

export default function AgendaList({
  sessions,
  days,
  initialDay,
}: {
  sessions: SlimSession[];
  days: { day: string; label: string }[];
  initialDay?: string;
}) {
  const [day, setDay] = useState(initialDay && days.some((d) => d.day === initialDay) ? initialDay : days[0]?.day);
  const [q, setQ] = useState("");
  const [track, setTrack] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [marks, setMarks] = useState<string[]>([]);

  useEffect(() => setMarks(readBookmarks()), []);

  /**
   * Deep links (?day=2026-09-10) are read on the client, not from server
   * searchParams: this page is force-static, so searchParams are empty at build
   * time and every prerendered copy would otherwise pin to day one — silently
   * sending "Thu 10 Sep" links to Wednesday.
   */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("day");
    if (wanted && days.some((d) => d.day === wanted)) setDay(wanted);
  }, [days]);

  function toggle(code: string) {
    setMarks((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      writeBookmarks(next);
      return next;
    });
  }

  const dayList = useMemo(() => sessions.filter((s) => s.day === day), [sessions, day]);

  const tracks = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of dayList) if (s.track) c.set(s.track, (c.get(s.track) ?? 0) + 1);
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1]);
  }, [dayList]);

  const formats = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of dayList) if (s.format) c.set(s.format, (c.get(s.format) ?? 0) + 1);
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [dayList]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return dayList.filter((s) => {
      if (track && s.track !== track) return false;
      if (format && s.format !== format) return false;
      if (!needle) return true;
      return [s.title, s.hall, s.format, s.track, ...s.speakers]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [dayList, q, track, format]);

  const activeFilters = [track, format].filter(Boolean) as string[];

  return (
    <>
      <div className="daytabs">
        {days.map((d) => (
          <button
            key={d.day}
            className="daytab"
            data-on={day === d.day}
            onClick={() => {
              setDay(d.day);
              setTrack(null);
              setFormat(null);
            }}
          >
            {d.label}
            <span className="daytab-n">{sessions.filter((s) => s.day === d.day).length}</span>
          </button>
        ))}
      </div>

      <div className="controls">
        <div className="searchwrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            className="search"
            placeholder="Search this day by title, speaker, hall, or track"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search sessions"
          />
        </div>

        {tracks.length > 0 && (
          <div className="filterrow">
            <span className="filterlabel">Track</span>
            <button className="chip" data-on={track === null} onClick={() => setTrack(null)}>
              All
            </button>
            {tracks.map(([t, n]) => (
              <button key={t} className="chip" data-on={track === t} onClick={() => setTrack(track === t ? null : t)}>
                {t} <span className="chip-n">{n}</span>
              </button>
            ))}
          </div>
        )}

        {formats.length > 0 && (
          <div className="filterrow">
            <span className="filterlabel">Format</span>
            <button className="chip" data-on={format === null} onClick={() => setFormat(null)}>
              All
            </button>
            {formats.map(([f, n]) => (
              <button key={f} className="chip" data-on={format === f} onClick={() => setFormat(format === f ? null : f)}>
                {f} <span className="chip-n">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="coverage">
        <strong>{shown.length}</strong> of {dayList.length} sessions on this day
        {activeFilters.length > 0 && (
          <>
            {" "}
            — filtered by {activeFilters.map((f) => <span key={f} className="term">{f}</span>)}
            <button className="clearfilters" onClick={() => { setTrack(null); setFormat(null); }}>
              clear
            </button>
          </>
        )}
        . Invite-only sessions are shown but cannot be added to your plan.
      </p>

      {shown.length === 0 ? (
        <div className="empty">No sessions match. Try clearing the filters or searching for something else.</div>
      ) : (
        <ol className="timetable">
          {shown.map((s) => (
            <li className="slot" key={s.agendaCode} data-closed={s.closedDoor}>
              <div className="slot-time">
                <span className="t1">{s.startTime}</span>
                <span className="t2">{s.endTime}</span>
              </div>
              <div className="slot-body">
                <h3>{s.title}</h3>
                <div className="slot-meta">
                  {s.hall && <span className="mpill">{s.hall}</span>}
                  {s.format && <span className="mpill">{s.format}</span>}
                  {s.track && <span className="mpill track">{s.track}</span>}
                  {s.closedDoor && <span className="mpill invite">Invite only</span>}
                </div>
                {s.speakers.length > 0 && <div className="slot-speakers">{s.speakers.join(" · ")}</div>}
              </div>
              <div className="slot-act">
                {s.closedDoor ? (
                  <span className="cantbook" title="Invite-only sessions cannot be added to a personal plan">
                    Invite only
                  </span>
                ) : (
                  <button
                    className="bookmark"
                    data-on={marks.includes(s.agendaCode)}
                    onClick={() => toggle(s.agendaCode)}
                    aria-label={marks.includes(s.agendaCode) ? "Remove from my plan" : "Add to my plan"}
                  >
                    {marks.includes(s.agendaCode) ? "★ Saved" : "☆ Save"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
