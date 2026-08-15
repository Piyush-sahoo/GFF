"use client";

import { useState } from "react";

type Cov = {
  partnersTotal: number;
  partnersWithUseCases: number;
  partnersWithDescription: number;
  partnersWithSpecificSector: number;
  sessionsTotal: number;
  sessionsWithDescription: number;
  sessionsWithTrack: number;
  speakersTotal: number;
  speakersWithBio: number;
  closedDoorExcluded: number;
};

type Res = {
  terms: string[];
  retrieval?: { channel: string; configured: string; degraded: boolean; degradedReason: string | null };
  coverage: Cov;
  sessions: {
    agendaCode: string; title: string; day: string; startTime: string; endTime: string;
    hall: string | null; format: string | null; track: string | null; why: string;
    speakers: { name: string; org: string | null }[];
  }[];
  speakers: {
    slug: string; name: string; title: string | null; org: string | null;
    headshotUrl: string | null; why: string;
  }[];
  partners: {
    slug: string; name: string; tier: string | null; category: string | null;
    website: string | null; logoUrl: string | null; hasDescription: boolean; why: string;
  }[];
};

const EXAMPLES = [
  "I'm raising a Series A for a lending startup",
  "I want to find a payments partner for cross-border settlement",
  "I'm hiring engineers and want to meet AI infrastructure teams",
  "I sell compliance software to banks",
];

export default function Matcher() {
  const [objective, setObjective] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(text: string) {
    const o = text.trim();
    if (!o || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective: o }),
      });
      const d = await r.json();
      if (!r.ok) setErr(d.error ?? "Something went wrong.");
      else setRes(d);
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const empty = res && !res.sessions.length && !res.speakers.length && !res.partners.length;

  return (
    <>
      <form
        className="objform"
        onSubmit={(e) => {
          e.preventDefault();
          run(objective);
        }}
      >
        <label htmlFor="obj" className="objlabel">
          What are you trying to get done at GFF?
        </label>
        <textarea
          id="obj"
          className="objinput"
          rows={3}
          placeholder="e.g. I'm raising a Series A for a lending startup and want to meet investors and banking partners"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
        />
        <div className="objrow">
          <button type="submit" disabled={busy || !objective.trim()}>
            {busy ? "Matching…" : "Find my matches"}
          </button>
          <span className="objnote">Nothing is saved. This runs against published GFF records only.</span>
        </div>
      </form>

      {!res && (
        <div className="suggest examples">
          {EXAMPLES.map((x) => (
            <button
              key={x}
              onClick={() => {
                setObjective(x);
                run(x);
              }}
            >
              {x}
            </button>
          ))}
        </div>
      )}

      {err && <div className="empty">{err}</div>}

      {empty && (
        <div className="empty">
          Nothing matched that closely enough to recommend. Rather than show you weak matches with
          invented reasons, we&apos;re showing none. Try naming a sector, technology, or business goal —
          &ldquo;payments&rdquo;, &ldquo;lending&rdquo;, &ldquo;compliance&rdquo;, &ldquo;fundraising&rdquo;.
        </div>
      )}

      {res && !empty && (
        <>
          {res.retrieval?.degraded && (
            <div className="notice warn" style={{ marginTop: 20 }}>
              <span className="badge">Reduced results</span>
              <span>
                <strong>These results came from a fallback search.</strong>{" "}
                {res.retrieval.degradedReason} Semantic matching is unavailable right now, so results
                rely on your exact words appearing in the records — a relevant item phrased differently
                may be missing.
              </span>
            </div>
          )}

          <div className="matchterms">
            Matching on: {res.terms.map((t, i) => (<span key={t}>{i > 0 ? ", " : " "}<span className="term">{t}</span></span>))}
          </div>

          {res.speakers.length > 0 && (
            <section className="matchsec">
              <h3 className="matchh">People to meet <span className="matchbest">strongest data</span></h3>
              <p className="matchcov">
                From {res.coverage.speakersTotal} speakers — {res.coverage.speakersWithBio} have bios and all have a role and organisation, so this is our most complete basis for &ldquo;who should I meet&rdquo;.
              </p>
              <div className="matchlist">
                {res.speakers.map((sp) => (
                  <article className="matchcard row" key={sp.slug}>
                    {sp.headshotUrl && (
                      <img className="mhead" src={sp.headshotUrl} alt="" loading="lazy" decoding="async" />
                    )}
                    <div>
                      <h4>{sp.name}</h4>
                      <div className="mrole">
                        {[sp.title, sp.org].filter(Boolean).join(" · ")}
                      </div>
                      <p className="mwhy">{sp.why}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {res.sessions.length > 0 && (
            <section className="matchsec">
              <h3 className="matchh">Sessions to attend</h3>
              <p className="matchcov">
                From {res.coverage.sessionsTotal} sessions ({res.coverage.sessionsWithDescription} have
                descriptions, {res.coverage.sessionsWithTrack} have a track).{" "}
                {res.coverage.closedDoorExcluded} invite-only sessions are excluded from recommendations.
              </p>
              <div className="matchlist">
                {res.sessions.map((s) => (
                  <article className="matchcard" key={s.agendaCode}>
                    <div className="mtime">
                      {s.day.slice(8)}/{s.day.slice(5, 7)} · {s.startTime}–{s.endTime}
                    </div>
                    <h4>{s.title}</h4>
                    <div className="mmeta">
                      {s.hall && <span className="mpill">{s.hall}</span>}
                      {s.format && <span className="mpill">{s.format}</span>}
                      {s.track && <span className="mpill track">{s.track}</span>}
                    </div>
                    {s.speakers.length > 0 && (
                      <div className="mspeakers">
                        {s.speakers.map((sp) => sp.name + (sp.org ? ` (${sp.org})` : "")).join(" · ")}
                      </div>
                    )}
                    <p className="mwhy">{s.why}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {res.partners.length > 0 && (
            <section className="matchsec">
              <h3 className="matchh">Exhibitors to visit</h3>
              <p className="matchcov warn">
                <strong>Limited data.</strong> Only {res.coverage.partnersWithDescription} of{" "}
                {res.coverage.partnersTotal} exhibitors have a description and{" "}
                {res.coverage.partnersWithUseCases} have listed use cases, and only{" "}
                {res.coverage.partnersWithSpecificSector} have a specific sector (the rest are
                &ldquo;other&rdquo;). Description coverage is now good, but{" "}
                {res.coverage.partnersTotal - res.coverage.partnersWithUseCases} exhibitors still list no
                use cases and {res.coverage.partnersTotal - res.coverage.partnersWithSpecificSector} have
                no specific sector, so matching on those is weaker. An exhibitor with no description
                cannot be matched however relevant it is. Booth locations are not published by GFF and are
                not shown.
              </p>
              <div className="matchlist">
                {res.partners.map((p) => (
                  <article className="matchcard row" key={p.slug}>
                    {p.logoUrl && (
                      <span className="mlogo">
                        <img src={p.logoUrl} alt="" loading="lazy" decoding="async" />
                      </span>
                    )}
                    <div>
                      <h4>{p.name}</h4>
                      <div className="mrole">{[p.tier, p.category].filter(Boolean).join(" · ")}</div>
                      <p className="mwhy">{p.why}</p>
                      {!p.hasDescription && (
                        <p className="mthin">Matched on name or sector only — no description available.</p>
                      )}
                      {p.website && (
                        <a className="mlink" href={p.website} target="_blank" rel="noopener noreferrer">
                          Website ↗
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
