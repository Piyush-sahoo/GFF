import Link from "next/link";
import Nav from "../components/Nav";
import { PARTNERS, SESSIONS, SPEAKERS } from "../lib/content";

export default function NotFound() {
  return (
    <main className="shell">
      <Nav />
      <section className="section">
        <div className="pending">
          <div className="pending-mark">Page not found</div>
          <h3>That page doesn&apos;t exist.</h3>
          <p>
            The link may be out of date, or the address may have a typo. Nothing is wrong with the rest of
            the site — here is everything that is available:
          </p>
          <div className="entrygrid" style={{ marginTop: 22 }}>
            <Link href="/agenda" className="entry">
              <span className="entry-k">Agenda</span>
              <span className="entry-d">{SESSIONS.length} sessions across three days.</span>
            </Link>
            <Link href="/speakers" className="entry">
              <span className="entry-k">Speakers</span>
              <span className="entry-d">{SPEAKERS.length} speakers with photos and bios.</span>
            </Link>
            <Link href="/exhibitors" className="entry">
              <span className="entry-k">Exhibitors</span>
              <span className="entry-d">{PARTNERS.length} exhibitors and partners.</span>
            </Link>
            <Link href="/" className="entry">
              <span className="entry-k">Home</span>
              <span className="entry-d">Overview, search, and the concierge.</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
