import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "../../../components/Nav";
import { EVENT_YEAR } from "../../../lib/content";
import { getPublicBySlug, PROFILES_ENABLED } from "../../../lib/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!PROFILES_ENABLED) return { title: `Profile — GFF ${EVENT_YEAR}` };
  const p = await getPublicBySlug(slug).catch(() => null);
  return {
    title: p ? `${p.name} — GFF ${EVENT_YEAR} Concierge` : `Profile not found — GFF ${EVENT_YEAR}`,
    description: p?.lookingFor?.slice(0, 200) ?? "Self-declared attendee profile.",
  };
}

export default async function PersonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!PROFILES_ENABLED) notFound();
  const p = await getPublicBySlug(slug).catch(() => null);
  if (!p) notFound();

  return (
    <main className="shell">
      <Nav active="People" />
      <header className="subhero">
        <Link href="/people" className="backlink">← People</Link>
        <h1 className="display sub">{p.name}</h1>
        {(p.role || p.org) && (
          <div className="sprole" style={{ fontSize: 15 }}>{[p.role, p.org].filter(Boolean).join(" · ")}</div>
        )}
        <div className="notice">
          <span className="badge">Self-declared</span>
          <span>
            Everything on this page was entered by this person and is <strong>not verified</strong> by us
            or by GFF. It is not proof of identity, employment, or event registration.
          </span>
        </div>
      </header>

      {p.lookingFor && (
        <section className="section">
          <h2 className="sec">What they&apos;re looking for</h2>
          <p className="lede" style={{ marginTop: 14 }}>{p.lookingFor}</p>
        </section>
      )}

      {p.interests?.length > 0 && (
        <section className="section">
          <h2 className="sec">Interests</h2>
          <div className="matchterms" style={{ marginTop: 12 }}>
            {p.interests.map((i) => <span className="term" key={i}>{i}</span>)}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="sec">Links</h2>
        <div className="spfoot" style={{ marginTop: 12 }}>
          {p.linkedin ? <a href={p.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a> : null}
          {p.x ? <span>X: {p.x}</span> : null}
          {!p.linkedin && !p.x && <span>No links provided.</span>}
        </div>
        <p className="mthin">Links are pasted by the person and not checked.</p>
      </section>

      <footer>
        Opt-in profile shown with consent. This person can delete it at any time, which removes it from
        this directory and from recommendations shown to others.
      </footer>
    </main>
  );
}
