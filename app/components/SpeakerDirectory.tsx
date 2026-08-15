"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type SlimSpeaker = {
  slug: string;
  name: string;
  title: string | null;
  org: string | null;
  bio: string | null;
  headshotUrl: string | null;
  linkedin: string | null;
  country: string | null;
  sessionCount: number;
};

export default function SpeakerDirectory({ speakers }: { speakers: SlimSpeaker[] }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState<string | null>(null);

  const countries = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of speakers) if (s.country) c.set(s.country, (c.get(s.country) ?? 0) + 1);
    return Array.from(c.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [speakers]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return speakers.filter((s) => {
      if (country && s.country !== country) return false;
      if (!needle) return true;
      return [s.name, s.title, s.org, s.bio, s.country]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [speakers, q, country]);

  const withBio = shown.filter((s) => s.bio && s.bio.trim()).length;

  return (
    <>
      <div className="controls">
        <div className="searchwrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            className="search"
            placeholder="Search speakers by name, role, organisation, or bio"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search speakers"
          />
        </div>

        <div className="filterrow">
          <span className="filterlabel">Country</span>
          <button className="chip" data-on={country === null} onClick={() => setCountry(null)}>
            All
          </button>
          {countries.map(([c, n]) => (
            <button
              key={c}
              className="chip"
              data-on={country === c}
              onClick={() => setCountry(country === c ? null : c)}
            >
              {c} <span className="chip-n">{n}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="coverage">
        Showing <strong>{shown.length}</strong> of {speakers.length} speakers. Every one has a photo, role
        and organisation; <strong>{withBio}</strong> of these have a bio.
      </p>

      {shown.length === 0 ? (
        <div className="empty">No speakers match that search. Try a broader term or clear the filter.</div>
      ) : (
        <div className="spgrid">
          {shown.map((s) => (
            <Link className="spcard" href={`/speakers/${s.slug}`} key={s.slug}>
              {s.headshotUrl ? (
                <img className="sphead" src={s.headshotUrl} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="sphead placeholder">{s.name.slice(0, 1)}</span>
              )}
              <div className="spbody">
                <h3>{s.name}</h3>
                {(s.title || s.org) && (
                  <div className="sprole">{[s.title, s.org].filter(Boolean).join(" · ")}</div>
                )}
                {s.bio && <p className="spbio">{s.bio}</p>}
                <div className="spfoot">
                  {s.sessionCount > 0 && (
                    <span>
                      {s.sessionCount} session{s.sessionCount === 1 ? "" : "s"}
                    </span>
                  )}
                  {s.country && <span>{s.country}</span>}
                  {s.linkedin && <span>LinkedIn</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
