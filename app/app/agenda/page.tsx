import type { Metadata } from "next";
import Nav from "../../components/Nav";
import AgendaList, { type SlimSession } from "../../components/AgendaList";
import { DAYS, EVENT_YEAR, SESSIONS, dayLabel, speakersForSession } from "../../lib/content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Agenda — Global Fintech Fest ${EVENT_YEAR}`,
  description: `The full Global Fintech Fest ${EVENT_YEAR} timetable: ${SESSIONS.length} sessions across three days with times, halls, formats and tracks.`,
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

const days = DAYS.map((d) => ({ day: d, label: dayLabel(d) }));

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const { day } = await searchParams;
  const closed = slim.filter((s) => s.closedDoor).length;

  return (
    <main className="shell">
      <Nav active="Agenda" />
      <header className="subhero">
        <h1 className="display sub">
          The <em>agenda</em>
        </h1>
        <p className="lede">
          All {SESSIONS.length} published sessions across {DAYS.length} days, with real start and end
          times, halls, formats and tracks. Save the ones you want and they appear in My Plan.
        </p>
      </header>

      <section className="section">
        <AgendaList sessions={slim} days={days} initialDay={day} />
      </section>

      <footer>
        Published GFF {EVENT_YEAR} agenda: {SESSIONS.length} sessions, all with a date, start and end time
        and hall. {closed} are invite-only — they are listed for completeness, badged clearly, and cannot
        be added to a personal plan. Halls shown here are session rooms; GFF has not published an exhibitor
        floor plan, so no booth locations appear anywhere on this site.
      </footer>
    </main>
  );
}
