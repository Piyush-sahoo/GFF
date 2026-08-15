import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "../../../components/Nav";
import {
  EVENT_YEAR, SPEAKERS, dayLabel, getSpeaker, sessionsForSpeaker, speakerSlug,
} from "../../../lib/content";

export const dynamic = "force-static";
export function generateStaticParams() {
  return SPEAKERS.map((s) => ({ slug: speakerSlug(s) }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const sp = getSpeaker(slug);
  if (!sp) return { title: `Speaker not found — GFF ${EVENT_YEAR}` };
  return {
    title: `${sp.name} — GFF ${EVENT_YEAR}`,
    description: (sp.bio || `${sp.name}${sp.title ? `, ${sp.title}` : ""}${sp.org ? ` at ${sp.org}` : ""}, speaking at Global Fintech Fest ${EVENT_YEAR}.`).slice(0, 200),
  };
}

export default async function SpeakerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sp = getSpeaker(slug);
  if (!sp) notFound();

  const sessions = sessionsForSpeaker(sp);

  return (
    <main className="shell">
      <Nav active="Speakers" />
      <header className="subhero">
        <Link href="/speakers" className="backlink">← Speakers</Link>
        <div className="spdetail">
          {sp.headshotUrl && <img className="spdetail-head" src={sp.headshotUrl} alt="" />}
          <div>
            <h1 className="display sub" style={{ marginTop: 0 }}>{sp.name}</h1>
            {(sp.title || sp.org) && (
              <div className="sprole" style={{ fontSize: 15 }}>
                {[sp.title, sp.org].filter(Boolean).join(" · ")}
              </div>
            )}
            <div className="spfoot" style={{ marginTop: 12 }}>
              {sp.country && <span>{sp.country}</span>}
              {sp.linkedin && (
                <a href={sp.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>
              )}
            </div>
          </div>
        </div>
        {sp.bio && <p className="lede" style={{ marginTop: 22 }}>{sp.bio}</p>}
      </header>

      <section className="section">
        <div className="section-head">
          <h2 className="sec">Sessions</h2>
          <span className="count">{sessions.length}</span>
        </div>
        {sessions.length === 0 ? (
          <div className="empty">
            No sessions are linked to this speaker in the published agenda.
          </div>
        ) : (
          <ol className="timetable">
            {sessions.map((s) => (
              <li className="slot" key={s.agendaCode} data-closed={s.isClosedDoor}>
                <div className="slot-time">
                  <span className="t1">{s.startTime}</span>
                  <span className="t2">{s.endTime}</span>
                </div>
                <div className="slot-body">
                  <h3>
                    <Link href={`/agenda/${s.agendaCode}`}>{s.title}</Link>
                  </h3>
                  <div className="slot-meta">
                    <span className="mpill">{dayLabel(s.day)}</span>
                    {s.hall && <span className="mpill">{s.hall}</span>}
                    {s.format && <span className="mpill">{s.format}</span>}
                    {(s.isClosedDoor || s.accessType === "invite-only") && (
                      <span className="mpill invite">Invite only</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer>
        Published GFF {EVENT_YEAR} speaker and agenda data. Sessions are linked via the agenda codes GFF
        publishes against each speaker.
      </footer>
    </main>
  );
}
