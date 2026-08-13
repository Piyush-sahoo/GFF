import type { Metadata } from "next";
import Nav from "../../components/Nav";
import MyPlan from "../../components/MyPlan";
import { type SlimSession } from "../../components/AgendaList";
import { DAYS, EVENT_YEAR, SESSIONS, dayLabel, speakersForSession } from "../../lib/content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `My Plan — Global Fintech Fest ${EVENT_YEAR}`,
  description: `Your saved Global Fintech Fest ${EVENT_YEAR} sessions, grouped by day with overlap warnings. Stored in your browser only.`,
};

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

export default function MyPlanPage() {
  return (
    <main className="shell">
      <Nav active="My Plan" />
      <header className="subhero">
        <h1 className="display sub">
          My <em>plan</em>
        </h1>
        <p className="lede">
          Sessions you saved from the agenda, grouped by day and ordered by start time, with a warning
          when two overlap.
        </p>
      </header>
      <section className="section">
        <MyPlan sessions={slim} />
      </section>
      <footer>
        Your plan is stored in this browser using localStorage. There is no account, nothing is sent to a
        server, and nothing is shared. Across {DAYS.length} days there are {SESSIONS.length} published
        sessions to choose from; invite-only sessions cannot be saved.
      </footer>
    </main>
  );
}
