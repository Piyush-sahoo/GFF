"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SignInToPlan, usePlan, type SlimSession } from "./AgendaList";

export type SlimSpeaker = {
  nameKey: string;
  slug: string;
  name: string;
  title: string | null;
  org: string | null;
};

export type SlimPartner = {
  slug: string;
  name: string;
  tier: string | null;
  category: string | null;
  website: string | null;
};

function toMin(t: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

export default function MyPlan({
  sessions,
  speakers,
  partners,
  days,
}: {
  sessions: SlimSession[];
  speakers: SlimSpeaker[];
  partners: SlimPartner[];
  days: { day: string; label: string }[];
}) {
  const plan = usePlan();

  /**
   * The day picker is explicit and defaults to day one. It is never derived
   * from the wall clock: outside 9-11 September a "today" would be a lie, and
   * during the fest a stale render would claim the wrong day. Nothing here
   * ever says a session is happening now.
   */
  const [day, setDay] = useState<string>(days[0]?.day ?? "2026-09-09");

  const chosen = useMemo(() => {
    const set = new Set(plan.plan?.sessions ?? []);
    return sessions.filter((s) => set.has(s.agendaCode));
  }, [sessions, plan.plan]);

  const people = useMemo(() => {
    const set = new Set(plan.plan?.people ?? []);
    return speakers.filter((s) => set.has(s.nameKey));
  }, [speakers, plan.plan]);

  const exhibitors = useMemo(() => {
    const set = new Set(plan.plan?.partners ?? []);
    return partners.filter((p) => set.has(p.slug));
  }, [partners, plan.plan]);

  const forDay = useMemo(
    () => chosen.filter((s) => s.day === day).sort((a, b) => toMin(a.startTime) - toMin(b.startTime)),
    [chosen, day],
  );

  /** A clash is any pair on this day whose time ranges intersect. */
  const clashes = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < forDay.length; i++) {
      for (let j = i + 1; j < forDay.length; j++) {
        const a = forDay[i], b = forDay[j];
        if (toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime)) {
          set.add(a.agendaCode);
          set.add(b.agendaCode);
        }
      }
    }
    return set;
  }, [forDay]);

  const countFor = (d: string) => chosen.filter((s) => s.day === d).length;
  const src = (id: string) => plan.plan?.source?.[id];
  const why = (id: string) => plan.plan?.why?.[id];

  if (plan.status === "loading") return <div className="coverage">Loading your plan…</div>;

  if (plan.status === "anon") {
    return (
      <div className="pending">
        <div className="pending-mark">Sign in required</div>
        <h3>Your plan lives with your account.</h3>
        <p>
          Plans are stored against an account so the same one is there on your phone on the show floor
          and can be read out to you over the phone.
        </p>
        <SignInToPlan next="/my-plan" />
      </div>
    );
  }

  if (plan.status === "off") {
    return (
      <div className="pending">
        <div className="pending-mark">Unavailable</div>
        <h3>Plans are offline.</h3>
        <p>{plan.error ?? "The plan database is not reachable right now."}</p>
        <p className="pending-foot">
          <span className="pending-dim">
            The <Link href="/agenda">agenda</Link>, speakers and exhibitors are static and still work.
          </span>
        </p>
      </div>
    );
  }

  const total = chosen.length + people.length + exhibitors.length;

  if (total === 0) {
    return (
      <div className="pending">
        <div className="pending-mark">Nothing saved yet</div>
        <h3>Your plan is empty.</h3>
        <p>
          Browse the <Link href="/agenda">agenda</Link> and tap Save on any session, or tell the{" "}
          <Link href="/ask">concierge</Link> what you are after and let it fill the plan for you.
          Invite-only sessions can&apos;t be saved.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="coverage">
        <strong>{chosen.length}</strong> session{chosen.length === 1 ? "" : "s"}
        {people.length > 0 && <>, {people.length} {people.length === 1 ? "person" : "people"}</>}
        {exhibitors.length > 0 && <>, {exhibitors.length} exhibitor{exhibitors.length === 1 ? "" : "s"}</>}
        {" "}saved to your account.
        {clashes.size > 0 && (
          <> <span className="clashwarn">{clashes.size} on this day overlap in time.</span></>
        )}
      </p>
      {plan.error && <p className="coverage warn">{plan.error}</p>}

      <div className="daytabs">
        {days.map((d) => (
          <button key={d.day} className="daytab" data-on={day === d.day} onClick={() => setDay(d.day)}>
            {d.label}
            <span className="daytab-n">{countFor(d.day)}</span>
          </button>
        ))}
      </div>

      {forDay.length === 0 ? (
        <div className="empty">Nothing saved for this day yet.</div>
      ) : (
        <ol className="timetable">
          {forDay.map((s) => (
            <li className="slot" key={s.agendaCode} data-clash={clashes.has(s.agendaCode)}>
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
                  {clashes.has(s.agendaCode) && <span className="mpill clash">Overlaps</span>}
                  {src(s.agendaCode) === "agent" && <span className="mpill">Added by the concierge</span>}
                </div>
                {why(s.agendaCode) && <p className="mwhy">{why(s.agendaCode)}</p>}
                {s.speakers.length > 0 && <div className="slot-speakers">{s.speakers.join(" · ")}</div>}
              </div>
              <div className="slot-act">
                <button
                  className="bookmark"
                  data-on
                  disabled={plan.pending.has(s.agendaCode)}
                  onClick={() => plan.remove(s.agendaCode)}
                >
                  {plan.pending.has(s.agendaCode) ? "…" : "Remove"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {people.length > 0 && (
        <section className="matchsec">
          <h3 className="matchh">People to meet</h3>
          <p className="matchcov">
            Attached to the sessions that make them reachable — check the day above for where they
            appear.
          </p>
          <div className="matchlist">
            {people.map((sp) => (
              <article className="matchcard row" key={sp.nameKey}>
                <div>
                  <h4>
                    <Link href={`/speakers/${sp.slug}`}>{sp.name}</Link>
                  </h4>
                  <div className="mrole">{[sp.title, sp.org].filter(Boolean).join(" · ")}</div>
                  {why(sp.nameKey) && <p className="mwhy">{why(sp.nameKey)}</p>}
                  <button
                    className="clearfilters"
                    disabled={plan.pending.has(sp.nameKey)}
                    onClick={() => plan.remove(sp.nameKey)}
                  >
                    remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {exhibitors.length > 0 && (
        <section className="matchsec">
          <h3 className="matchh">Exhibitors worth finding</h3>
          <p className="matchcov warn">
            GFF has published no 2026 floor plan, so this list deliberately carries no booth, stall or
            hall. Ask at the venue information desk.
          </p>
          <div className="matchlist">
            {exhibitors.map((p) => (
              <article className="matchcard row" key={p.slug}>
                <div>
                  <h4>{p.name}</h4>
                  <div className="mrole">{[p.tier, p.category].filter(Boolean).join(" · ")}</div>
                  {why(p.slug) && <p className="mwhy">{why(p.slug)}</p>}
                  {p.website && (
                    <a className="mlink" href={p.website} target="_blank" rel="noopener noreferrer">
                      Website ↗
                    </a>
                  )}
                  <button
                    className="clearfilters"
                    disabled={plan.pending.has(p.slug)}
                    onClick={() => plan.remove(p.slug)}
                  >
                    remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
