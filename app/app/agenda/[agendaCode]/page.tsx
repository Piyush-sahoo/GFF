import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "../../../components/Nav";
import {
  EVENT_YEAR, SESSIONS, dayLabel, getSession, speakerSlug, speakersForSession,
} from "../../../lib/content";

export const dynamic = "force-static";
export function generateStaticParams() {
  return SESSIONS.map((s) => ({ agendaCode: s.agendaCode }));
}

export async function generateMetadata({ params }: { params: Promise<{ agendaCode: string }> }): Promise<Metadata> {
  const { agendaCode } = await params;
  const s = getSession(agendaCode);
  if (!s) return { title: `Session not found — GFF ${EVENT_YEAR}` };
  return {
    title: `${s.title} — GFF ${EVENT_YEAR}`,
    description: (s.description || `${s.title}. ${dayLabel(s.day)}, ${s.startTime}–${s.endTime}${s.hall ? `, ${s.hall}` : ""}.`).slice(0, 200),
  };
}

export default async function SessionPage({ params }: { params: Promise<{ agendaCode: string }> }) {
  const { agendaCode } = await params;
  const s = getSession(agendaCode);
  if (!s) notFound();

  const speakers = speakersForSession(s);
  const closed = s.isClosedDoor || s.accessType === "invite-only";

  return (
    <main className="shell">
      <Nav active="Agenda" />
      <header className="subhero">
        <Link href="/agenda" className="backlink">← Agenda</Link>
        <div className="mtime" style={{ marginTop: 16 }}>
          {dayLabel(s.day)} · {s.startTime}–{s.endTime}
        </div>
        <h1 className="display sub">{s.title}</h1>
        <div className="slot-meta" style={{ marginTop: 14 }}>
          {s.hall && <span className="mpill">{s.hall}</span>}
          {s.format && <span className="mpill">{s.format}</span>}
          {s.track && <span className="mpill track">{s.track}</span>}
          {closed && <span className="mpill invite">Invite only</span>}
        </div>
        {closed && (
          <div className="notice warn" style={{ marginTop: 20 }}>
            <span className="badge">Invite only</span>
            <span>
              <strong>This is a closed-door session.</strong> It is listed here for completeness, but it
              is not open to general attendance and cannot be added to your plan.
            </span>
          </div>
        )}
      </header>

      {s.description && (
        <section className="section">
          <h2 className="sec">About</h2>
          <p className="lede" style={{ marginTop: 14 }}>{s.description}</p>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="sec">Speakers</h2>
          <span className="count">{speakers.length} linked</span>
        </div>
        {speakers.length === 0 ? (
          <div className="empty">No speakers are listed against this session in the published agenda.</div>
        ) : (
          <div className="spgrid">
            {speakers.map((sp) => (
              <Link className="spcard" key={sp.nameKey} href={`/speakers/${speakerSlug(sp)}`}>
                {sp.headshotUrl && <img className="sphead" src={sp.headshotUrl} alt="" loading="lazy" />}
                <div className="spbody">
                  <h3>{sp.name}</h3>
                  {(sp.title || sp.org) && (
                    <div className="sprole">{[sp.title, sp.org].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer>
        Published GFF {EVENT_YEAR} agenda data. The hall shown is a session room. GFF has not published an
        exhibitor floor plan, so no booth locations appear anywhere on this site.
      </footer>
    </main>
  );
}
