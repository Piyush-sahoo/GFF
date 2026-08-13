import type { Metadata } from "next";
import Nav from "../../components/Nav";
import Chat from "../../components/Chat";
import Matcher from "../../components/Matcher";
import { EVENT_YEAR, PARTNERS, SESSIONS, SPEAKERS } from "../../lib/content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Ask the concierge — Global Fintech Fest ${EVENT_YEAR}`,
  description: `Ask questions about the Global Fintech Fest ${EVENT_YEAR} agenda, speakers and exhibitors, answered only from published GFF records.`,
};

export default function AskPage() {
  return (
    <main className="shell">
      <Nav active="Ask" />
      <header className="subhero">
        <h1 className="display sub">
          Ask the <em>concierge</em>
        </h1>
        <p className="lede">
          Two ways in: describe what you want to achieve and get ranked matches, or ask a direct question.
          Both answer only from {SESSIONS.length} sessions, {SPEAKERS.length} speakers and{" "}
          {PARTNERS.length} exhibitors published by GFF.
        </p>
      </header>

      <section className="section">
        <div className="section-head">
          <h2 className="sec">Match me to GFF</h2>
          <span className="count">Ranked results with reasons</span>
        </div>
        <Matcher />
      </section>

      <Chat />

      <footer>
        Recommendations are computed from published records, and every one states which of your words it
        matched and where. Nothing is invented: if a match is weak it is omitted rather than given a
        manufactured reason. Invite-only sessions are never recommended. GFF has not published a floor
        plan, so no exhibitor booth locations are given.
      </footer>
    </main>
  );
}
