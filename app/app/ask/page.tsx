import type { Metadata } from "next";
import Nav from "../../components/Nav";
import AgentSession from "../../components/AgentSession";
import { catalogStats } from "../../lib/catalog";
import { EVENT_YEAR } from "../../lib/content";

/**
 * One session, not two panels.
 *
 * This page used to hold a match form and a chat box that knew nothing about
 * each other — you could get a ranked list and then ask a question that could
 * not act on it. It is now a single persistent conversation that edits one plan.
 *
 * Dynamic because the conversation and plan belong to the signed-in account.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `AI Agent — Global Fintech Fest ${EVENT_YEAR}`,
  description: `Ask anything about Global Fintech Fest ${EVENT_YEAR}, build your schedule, and find the people worth meeting — one conversation, answered only from published GFF records.`,
};

export default function AskPage() {
  const stats = catalogStats();

  return (
    <main className="shell">
      <Nav active="AI Agent" />
      <header className="subhero">
        <h1 className="display sub">
          AI <em>Agent</em>
        </h1>
        <p className="lede">
          One conversation that knows the whole festival. Ask it anything about the agenda, speakers or
          exhibitors; get it to build and reshape your schedule; work out who is worth meeting and when.
          It remembers what you have told it, and it only changes your plan when you actually want it
          changed.
        </p>
      </header>

      <AgentSession />

      <footer>
        The agent chooses from all {stats.sessions} attendable sessions, {stats.speakers} speakers and{" "}
        {stats.partners} exhibitors published by GFF, and every record it returns is checked against that
        list before it reaches your plan — anything it can&apos;t back with a real record is dropped rather
        than shown. The {stats.excludedSessions} invite-only sessions are removed before the agent sees the
        catalogue, so they can never be planned. GFF has published no floor plan for {EVENT_YEAR}, so no
        exhibitor stand locations are given.
      </footer>
    </main>
  );
}
