import type { Metadata } from "next";
import Nav from "../../components/Nav";
import MyPlan, { type SlimPartner, type SlimSpeaker } from "../../components/MyPlan";
import { type SlimSession } from "../../components/AgendaList";
import {
  DAYS,
  EVENT_YEAR,
  PARTNERS,
  SESSIONS,
  SPEAKERS,
  dayLabel,
  speakerSlug,
  speakersForSession,
} from "../../lib/content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `My Plan — Global Fintech Fest ${EVENT_YEAR}`,
  description: `Your saved Global Fintech Fest ${EVENT_YEAR} sessions, grouped by day with overlap warnings.`,
};

/**
 * The whole published catalog is shipped to the client and the plan itself is
 * fetched separately. Storing ids only in Atlas is what makes this the right
 * shape: titles and halls come from the current dataset every render, so a
 * rebuild can never leave a stale title sitting in someone's plan.
 */
const slim: SlimSession[] = SESSIONS.map((s) => ({
  agendaCode: s.agendaCode,
  title: s.title,
  day: s.day,
  dayLabel: dayLabel(s.day),
  startTime: s.startTime,
  endTime: s.endTime,
  hall: s.hall,
  format: s.format,
  track: s.track,
  closedDoor: s.isClosedDoor || s.accessType === "invite-only",
  speakers: speakersForSession(s).slice(0, 4).map((x) => x.name),
}));

const slimSpeakers: SlimSpeaker[] = SPEAKERS.map((sp) => ({
  nameKey: sp.nameKey,
  slug: speakerSlug(sp),
  name: sp.name,
  title: sp.title,
  org: sp.org,
}));

const slimPartners: SlimPartner[] = PARTNERS.map((p) => ({
  slug: p.slug,
  name: p.name,
  tier: p.tier,
  category: p.category,
  website: p.website,
}));

const days = DAYS.map((d) => ({ day: d, label: dayLabel(d) }));

export default function MyPlanPage() {
  return (
    <main className="shell">
      <Nav active="My Plan" />
      <header className="subhero">
        <h1 className="display sub">
          My <em>plan</em>
        </h1>
        <p className="lede">
          Everything you and the concierge have saved, one day at a time, ordered by start time and
          flagged when two sessions overlap.
        </p>
      </header>
      <section className="section">
        <MyPlan sessions={slim} speakers={slimSpeakers} partners={slimPartners} days={days} />
      </section>
      <footer>
        Your plan is stored against your account, so the agenda&apos;s Save button and the concierge
        both write to the same one and it is the same plan on every device you sign in on. The day is
        always an explicit choice, never guessed from the clock, and nothing here claims a session is
        happening now. Across {DAYS.length} days there are {SESSIONS.length} published sessions to
        choose from; invite-only sessions cannot be saved. Exhibitors carry no location: GFF published
        no 2026 floor plan.
      </footer>
    </main>
  );
}
