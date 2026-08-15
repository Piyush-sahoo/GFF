import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Nav from "../../../components/Nav";
import { DAYS, EVENT_YEAR, dayLabel, getPartner, getSession, toMinutes } from "../../../lib/content";
import { getPublicBySlug, PROFILES_ENABLED } from "../../../lib/profiles";
import { listSharedPlans } from "../../../lib/db";
import type { Partner, Session } from "../../../lib/types";

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

  /**
   * Only ever read through listSharedPlans, which requires BOTH opt-ins. A
   * private plan is not fetched here at all — there is no count, no teaser
   * and nothing to leak, because the data never reaches this component.
   */
  const shared = (await listSharedPlans().catch(() => [])).find((x) => x.slug === slug) ?? null;

  // Ids only in Atlas: every title, time and hall below is resolved from the
  // static catalog at render, so a rebuilt dataset can never show a stale one.
  const byDay = DAYS.map((day) => ({
    day,
    label: dayLabel(day),
    sessions: (shared?.sessions ?? [])
      .map((code) => getSession(code))
      .filter((s): s is Session => Boolean(s) && s!.day === day)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)),
  })).filter((d) => d.sessions.length > 0);

  const exhibitors = (shared?.partners ?? [])
    .map((s) => getPartner(s))
    .filter((x): x is Partner => Boolean(x));

  return (
    <main className="shell">
      <Nav active="People" />
      <header className="subhero">
        <Link href="/people" className="backlink">← People</Link>
        <h1 className="display sub">
          {p.name}
          {p.isDemo && <span className="mpill invite" style={{ marginLeft: 10, fontSize: 13 }}>Demo data</span>}
        </h1>
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
        <div className="section-head">
          <h2 className="sec">Their plan</h2>
          {shared && (
            <span className="count">
              {shared.sessions.length} session{shared.sessions.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {!shared ? (
          <div className="pending">
            <div className="pending-mark">Not shared</div>
            <h3>This person has not shared their plan.</h3>
            <p>
              Being listed in the directory is a separate choice from publishing where you will be, and
              they have only made the first one. There is nothing to show here.
            </p>
          </div>
        ) : byDay.length === 0 && exhibitors.length === 0 ? (
          <div className="empty">Their plan is shared but empty — nothing saved yet.</div>
        ) : (
          <>
            <p className="coverage">
              Shared by {p.name}, who can switch this off at any time.{" "}
              <Link className="mlink" href={`/meet?with=${slug}`}>Compare with my plan →</Link>
            </p>

            {byDay.map((d) => (
              <section className="matchsec" key={d.day}>
                <h3 className="matchh">{d.label}</h3>
                <ol className="timetable">
                  {d.sessions.map((s) => (
                    <li className="slot" key={s.agendaCode}>
                      <div className="slot-time">
                        <span className="t1">{s.startTime}</span>
                        <span className="t2">{s.endTime}</span>
                      </div>
                      <div className="slot-body">
                        <h3>
                          <Link href={`/agenda/${s.agendaCode}`}>{s.title}</Link>
                        </h3>
                        <div className="slot-meta">
                          {s.hall && <span className="mpill">{s.hall}</span>}
                          {s.format && <span className="mpill">{s.format}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}

            {exhibitors.length > 0 && (
              <section className="matchsec">
                <h3 className="matchh">Exhibitors they want to find</h3>
                <p className="matchcov warn">
                  No booth, stall or hall is given — GFF published no 2026 floor plan.
                </p>
                <div className="matchterms">
                  {exhibitors.map((x) => <span className="term" key={x.slug}>{x.name}</span>)}
                </div>
              </section>
            )}
          </>
        )}
      </section>

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
