import type { Metadata } from "next";
import Link from "next/link";
import Nav from "../../components/Nav";
import MeetPicker, { type SlimForMeet } from "./MeetPicker";
import { DAYS, EVENT_YEAR, SESSIONS, dayLabel } from "../../lib/content";
import { ATLAS_OFF_MESSAGE, PROFILES_ENABLED, listSharedPlans } from "../../lib/db";
import type { SharedPlanSummary } from "../../lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Find a meeting point — GFF ${EVENT_YEAR} Concierge`,
  description: `Pick a few attendees who have shared their plan and find the sessions you are all already going to, or a window when everyone is free.`,
};

/** Ids only in Atlas, so titles and times are resolved here, at render. */
const slim: SlimForMeet[] = SESSIONS.map((s) => ({
  agendaCode: s.agendaCode,
  title: s.title,
  day: s.day,
  dayLabel: dayLabel(s.day),
  startTime: s.startTime,
  endTime: s.endTime,
  hall: s.hall,
}));

const dayLabels: Record<string, string> = Object.fromEntries(DAYS.map((d) => [d, dayLabel(d)]));

export default async function MeetPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string }>;
}) {
  const { with: withParam } = await searchParams;
  const initial = (withParam ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  let people: SharedPlanSummary[] = [];
  let error: string | null = null;
  if (PROFILES_ENABLED) {
    try {
      people = await listSharedPlans();
    } catch {
      error = "Shared plans are temporarily unreachable.";
    }
  } else {
    error = ATLAS_OFF_MESSAGE;
  }

  return (
    <main className="shell">
      <Nav />
      <header className="subhero">
        <h1 className="display sub">
          Find a <em>meeting point</em>
        </h1>
        <p className="lede">
          Pick two to four people who have shared their plan. We look for the sessions you are all
          already going to, and for the windows when none of you is booked.
        </p>
      </header>

      <section className="section">
        {error ? (
          <div className="empty">{error}</div>
        ) : (
          <MeetPicker people={people} sessions={slim} dayLabels={dayLabels} initial={initial} />
        )}
      </section>

      <footer>
        Only people who opted in <strong>twice</strong> appear here: once to be listed in the directory,
        and again to share their plan. Being listed is not consent to publish your movements, so the two
        are separate and either can be withdrawn at any time — withdrawing removes the plan from this
        page immediately. We tell you <strong>when</strong> everyone is free, never where to stand: GFF
        published no 2026 floor plan and no exhibitor locations exist to give.{" "}
        <Link href="/profile">Manage your own sharing →</Link>
      </footer>
    </main>
  );
}
