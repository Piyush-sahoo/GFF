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
  title: `Plan your GFF — Global Fintech Fest ${EVENT_YEAR}`,
  description: `Build a personal Global Fintech Fest ${EVENT_YEAR} plan in conversation — sessions, people worth meeting and exhibitors worth finding, all from published GFF records.`,
};

export default function AskPage() {
  const stats = catalogStats();

  return (
    <main className="shell">
      <Nav active="Ask" />
      <header className="subhero">
        <h1 className="display sub">
          Plan your <em>GFF</em>
        </h1>
        <p className="lede">
          Tell the agent what you&apos;re here to achieve and it builds your three days — sessions first,
          the people worth meeting at them, and exhibitors worth seeking out. It remembers the conversation
          and edits one plan, so you can change your mind out loud.
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
