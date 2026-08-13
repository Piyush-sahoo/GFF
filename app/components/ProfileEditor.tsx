"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Profile = {
  slug: string; name: string; org: string | null; role: string | null;
  linkedin: string | null; x: string | null; interests: string[];
  lookingFor: string | null; consentPublic: boolean;
};

type Recs = {
  terms: string[];
  coverage: { partnersTotal: number; partnersWithDescription: number; partnersWithUseCases: number; partnersWithSpecificSector: number; speakersTotal: number; speakersWithBio: number; closedDoorExcluded: number };
  sessions: { agendaCode: string; title: string; day: string; startTime: string; endTime: string; hall: string | null; format: string | null; track: string | null; why: string }[];
  speakers: { slug: string; name: string; title: string | null; org: string | null; headshotUrl: string | null; why: string }[];
  partners: { slug: string; name: string; tier: string | null; category: string | null; website: string | null; logoUrl: string | null; hasDescription: boolean; why: string }[];
};

/**
 * Split on commas ONLY. Whitespace inside an item is preserved, so
 * "voice agents" stays one interest rather than becoming two.
 */
function parseInterests(raw: string): string[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}

const BLANK: Profile = {
  slug: "", name: "", org: "", role: "", linkedin: "", x: "",
  interests: [], lookingFor: "", consentPublic: false,
};

export default function ProfileEditor() {
  const [email, setEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [p, setP] = useState<Profile>(BLANK);
  /**
   * The interests INPUT is held as the raw string the user typed. It must never
   * be parsed and re-joined on keystroke: doing that trims the space the moment
   * it is typed and drops the trailing empty item after a comma, so "voice
   * agents, payments" collapses to "voiceagents" and a second interest can
   * never be entered. Parse at the point of use only.
   */
  const [interestsRaw, setInterestsRaw] = useState("");
  const [recs, setRecs] = useState<Recs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/profile");
      const d = await r.json();
      if (d.error) setErr(d.error);
      setEmail(d.email ?? null);
      if (d.profile) {
        setP({ ...BLANK, ...d.profile });
        setInterestsRaw((d.profile.interests || []).join(", "));
      }
      setRecs(d.recs ?? null);
    } catch {
      setErr("Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    await load();
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    setEmail(null); setP(BLANK); setRecs(null); setInterestsRaw("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null); setMsg(null);
    try {
      const r = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...p, interests: parseInterests(interestsRaw) }),
      });
      const d = await r.json();
      if (!r.ok) setErr(d.error);
      else { setMsg("Saved."); await load(); }
    } finally { setSaving(false); }
  }

  async function destroy() {
    if (!confirm("Delete your profile permanently? This also removes you from other people's recommendations.")) return;
    const r = await fetch("/api/profile", { method: "DELETE" });
    if (r.ok) { setP(BLANK); setRecs(null); setInterestsRaw(""); setMsg("Your profile has been deleted."); }
  }

  const NotRegistration = (
    <div className="notice warn">
      <span className="badge">Not GFF registration</span>
      <span>
        <strong>This is not registration for Global Fintech Fest.</strong> Creating a profile here does
        not give you a ticket, a badge, or entry to the event. It is an independent, opt-in directory so
        attendees can find each other. Register officially at{" "}
        <a href="https://www.globalfintechfest.com" target="_blank" rel="noopener noreferrer">
          globalfintechfest.com
        </a>.
      </span>
    </div>
  );

  if (loading) return <div className="coverage">Loading…</div>;

  if (!email) {
    return (
      <>
        {NotRegistration}
        <form className="objform" onSubmit={signIn} style={{ maxWidth: 460 }}>
          <label className="objlabel" htmlFor="em">Your email</label>
          <input
            id="em" className="search" type="email" value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="you@company.com" style={{ paddingLeft: 16 }}
          />
          <div className="objrow">
            <button type="submit" disabled={!emailInput.includes("@")}>Continue</button>
          </div>
          {err && <p className="mthin">{err}</p>}
        </form>
        <p className="coverage" style={{ maxWidth: 620 }}>
          There is no password and <strong>no verification</strong> — we do not send an email and we
          cannot confirm the address belongs to you. It only identifies this browser so you can come back
          to your own profile. Please don&apos;t put anything sensitive here.
        </p>
      </>
    );
  }

  return (
    <>
      {NotRegistration}

      <div className="coverage" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span>Signed in as <strong>{email}</strong> — unverified, self-declared.</span>
        <button className="clearfilters" onClick={signOut}>sign out</button>
      </div>

      <form className="objform profileform" onSubmit={save}>
        <div className="field2">
          <div>
            <label className="objlabel" htmlFor="n">Name *</label>
            <input id="n" className="search" style={{ paddingLeft: 16 }} value={p.name}
              onChange={(e) => setP({ ...p, name: e.target.value })} />
          </div>
          <div>
            <label className="objlabel" htmlFor="o">Organisation</label>
            <input id="o" className="search" style={{ paddingLeft: 16 }} value={p.org ?? ""}
              onChange={(e) => setP({ ...p, org: e.target.value })} />
          </div>
        </div>

        <div className="field2">
          <div>
            <label className="objlabel" htmlFor="r">Role</label>
            <input id="r" className="search" style={{ paddingLeft: 16 }} value={p.role ?? ""}
              onChange={(e) => setP({ ...p, role: e.target.value })} />
          </div>
          <div>
            <label className="objlabel" htmlFor="i">Interests (comma separated)</label>
            <input id="i" className="search" style={{ paddingLeft: 16 }}
              value={interestsRaw}
              placeholder="payments, lending, voice agents"
              onChange={(e) => setInterestsRaw(e.target.value)} />
            {parseInterests(interestsRaw).length > 0 && (
              <div className="matchterms" style={{ marginTop: 8 }}>
                Will be saved as:{" "}
                {parseInterests(interestsRaw).map((t, i) => (
                  <span key={t + i}>{i > 0 ? ", " : ""}<span className="term">{t}</span></span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="field2">
          <div>
            <label className="objlabel" htmlFor="li">LinkedIn URL</label>
            <input id="li" className="search" style={{ paddingLeft: 16 }} value={p.linkedin ?? ""}
              placeholder="https://linkedin.com/in/…"
              onChange={(e) => setP({ ...p, linkedin: e.target.value })} />
          </div>
          <div>
            <label className="objlabel" htmlFor="x">X handle</label>
            <input id="x" className="search" style={{ paddingLeft: 16 }} value={p.x ?? ""}
              placeholder="@yourhandle"
              onChange={(e) => setP({ ...p, x: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="objlabel" htmlFor="lf">What are you looking for at GFF?</label>
          <textarea id="lf" className="objinput" rows={3} value={p.lookingFor ?? ""}
            placeholder="e.g. Raising a Series A for a lending startup; want to meet banking partners and investors"
            onChange={(e) => setP({ ...p, lookingFor: e.target.value })} />
          <p className="mthin">This drives your recommendations below.</p>
        </div>

        <label className="consent">
          <input type="checkbox" checked={p.consentPublic}
            onChange={(e) => setP({ ...p, consentPublic: e.target.checked })} />
          <span>
            <strong>Show my profile publicly</strong> in the attendee directory so other people can find
            me. Everything above is self-declared and shown as-is — we do not verify any of it, and your
            email is never shown. Leave this unticked and your profile stays private to you.
          </span>
        </label>

        <div className="objrow">
          <button type="submit" disabled={saving || !p.name.trim()}>{saving ? "Saving…" : "Save profile"}</button>
          {p.slug && p.consentPublic && (
            <Link className="mlink" href={`/people/${p.slug}`}>View my public page ↗</Link>
          )}
          {p.slug && <button type="button" className="danger" onClick={destroy}>Delete my profile</button>}
        </div>
        {msg && <p className="mthin">{msg}</p>}
        {err && <p className="mthin" style={{ color: "#ff9b9b" }}>{err}</p>}
      </form>

      {recs && (
        <section className="section">
          <div className="section-head">
            <h2 className="sec">Recommended for you</h2>
            <span className="count">from what you told us</span>
          </div>
          <div className="matchterms">
            Based on: {recs.terms.map((t, i) => (<span key={t}>{i > 0 ? ", " : " "}<span className="term">{t}</span></span>))}
          </div>

          {recs.speakers.length > 0 && (
            <section className="matchsec">
              <h3 className="matchh">People to meet <span className="matchbest">strongest data</span></h3>
              <p className="matchcov">
                From {recs.coverage.speakersTotal} speakers; {recs.coverage.speakersWithBio} have bios.
              </p>
              <div className="matchlist">
                {recs.speakers.map((s) => (
                  <Link className="matchcard row" key={s.slug} href={`/speakers/${s.slug}`}>
                    {s.headshotUrl && <img className="mhead" src={s.headshotUrl} alt="" loading="lazy" />}
                    <div>
                      <h4>{s.name}</h4>
                      <div className="mrole">{[s.title, s.org].filter(Boolean).join(" · ")}</div>
                      <p className="mwhy">{s.why}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {recs.sessions.length > 0 && (
            <section className="matchsec">
              <h3 className="matchh">Sessions to attend</h3>
              <p className="matchcov">
                {recs.coverage.closedDoorExcluded} invite-only sessions are excluded from recommendations.
              </p>
              <div className="matchlist">
                {recs.sessions.map((s) => (
                  <Link className="matchcard" key={s.agendaCode} href={`/agenda/${s.agendaCode}`}>
                    <div className="mtime">{s.day.slice(8)}/{s.day.slice(5, 7)} · {s.startTime}–{s.endTime}</div>
                    <h4>{s.title}</h4>
                    <div className="mmeta">
                      {s.hall && <span className="mpill">{s.hall}</span>}
                      {s.format && <span className="mpill">{s.format}</span>}
                      {s.track && <span className="mpill track">{s.track}</span>}
                    </div>
                    <p className="mwhy">{s.why}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {recs.partners.length > 0 && (
            <section className="matchsec">
              <h3 className="matchh">Exhibitors to visit</h3>
              <p className="matchcov warn">
                <strong>Limited data.</strong> Only {recs.coverage.partnersWithDescription} of{" "}
                {recs.coverage.partnersTotal} exhibitors have a description,{" "}
                {recs.coverage.partnersWithUseCases} list use cases and{" "}
                {recs.coverage.partnersWithSpecificSector} have a specific sector. Description coverage is
                now good, but{" "}
                {recs.coverage.partnersTotal - recs.coverage.partnersWithUseCases} exhibitors list no use
                cases, and one with no description cannot be matched however relevant it is. Booth
                locations are not published by GFF.
              </p>
              <div className="matchlist">
                {recs.partners.map((x) => (
                  <article className="matchcard row" key={x.slug}>
                    {x.logoUrl && <span className="mlogo"><img src={x.logoUrl} alt="" loading="lazy" /></span>}
                    <div>
                      <h4>{x.name}</h4>
                      <div className="mrole">{[x.tier, x.category].filter(Boolean).join(" · ")}</div>
                      <p className="mwhy">{x.why}</p>
                      {!x.hasDescription && <p className="mthin">Matched on name or sector only — no description available.</p>}
                      {x.website && <a className="mlink" href={x.website} target="_blank" rel="noopener noreferrer">Website ↗</a>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
      )}
    </>
  );
}
