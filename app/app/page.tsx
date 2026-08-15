import Link from "next/link";
import Nav from "../components/Nav";
import {
  DAYS,
  EVENT_YEAR,
  PARTNERS,
  SESSIONS,
  SPEAKERS,
  dayLabel,
  sessionsByDay,
} from "../lib/content";

export const dynamic = "force-static";

/** Every figure below is derived from the records we actually hold. */
const HALLS = new Set(SESSIONS.map((s) => s.hall).filter(Boolean)).size;
const CLOSED = SESSIONS.filter((s) => s.isClosedDoor || s.accessType === "invite-only").length;
const DATE_RANGE =
  DAYS.length > 1
    ? `${dayLabel(DAYS[0]).replace(/^\w+ /, "")}–${dayLabel(DAYS[DAYS.length - 1]).replace(/^\w+ /, "")} ${EVENT_YEAR}`
    : `${EVENT_YEAR}`;

export default function Home() {
  return (
    <main className="shell">
      <Nav />

      <header className="hero">
        <span className="eyebrow">
          <span className="dot" />
          Global Fintech Fest {EVENT_YEAR} · 7th edition
        </span>

        <h1 className="display">
          Your GFF agenda, <em>in one place.</em>
        </h1>

        <p className="lede">
          {SESSIONS.length} sessions across {DAYS.length} days and {HALLS} halls, {SPEAKERS.length}{" "}
          speakers, and {PARTNERS.length} exhibitors and partners. Browse the timetable, build a personal
          plan, and ask questions answered only from published GFF records.
        </p>

        <div className="factbar">
          <div className="fact">
            <div className="k">Dates</div>
            <div className="v">{DATE_RANGE}</div>
          </div>
          <div className="fact">
            <div className="k">Venue</div>
            <div className="v">Jio World Centre &amp; Trident BKC</div>
          </div>
          <div className="fact">
            <div className="k">Sessions</div>
            <div className="v">{SESSIONS.length}</div>
          </div>
          <div className="fact">
            <div className="k">Speakers</div>
            <div className="v">{SPEAKERS.length}</div>
          </div>
          <div className="fact">
            <div className="k">Exhibitors &amp; partners</div>
            <div className="v">{PARTNERS.length}</div>
          </div>
        </div>

        <div className="notice warn">
          <span className="badge">Booth locations</span>
          <span>
            <strong>GFF has not published a floor plan for {EVENT_YEAR}.</strong> No exhibitor booth or
            stall numbers are shown anywhere on this site, and the concierge will not guess one. Session
            halls and times <em>are</em> published and are shown throughout. Counts on this page are
            derived from the records we hold, not from marketing figures.
          </span>
        </div>
      </header>

      <section className="section">
        <div className="section-head">
          <h2 className="sec">The three days</h2>
          <span className="count">
            {SESSIONS.length} sessions · {CLOSED} invite-only
          </span>
        </div>
        <div className="daygrid">
          {DAYS.map((d) => {
            const list = sessionsByDay(d);
            const tracks = new Set(list.map((s) => s.track).filter(Boolean)).size;
            const first = list[0];
            const last = list[list.length - 1];
            return (
              <Link key={d} href={`/agenda?day=${d}`} className="daycard">
                <div className="dayname">{dayLabel(d)}</div>
                <div className="daycount">{list.length}</div>
                <div className="daymeta">sessions</div>
                <div className="dayfoot">
                  {first?.startTime}–{last?.endTime} · {tracks} tracks
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="sec">Explore</h2>
        </div>
        <div className="entrygrid">
          <Link href="/agenda" className="entry">
            <span className="entry-k">Agenda</span>
            <span className="entry-d">
              Full timetable by day, with hall, format and track filters.
            </span>
          </Link>
          <Link href="/exhibitors" className="entry">
            <span className="entry-k">Exhibitors &amp; partners</span>
            <span className="entry-d">
              All {PARTNERS.length} organisations, searchable by sector and group.
            </span>
          </Link>
          <Link href="/speakers" className="entry">
            <span className="entry-k">Speakers</span>
            <span className="entry-d">{SPEAKERS.length} speakers with photos, roles and bios.</span>
          </Link>
          <Link href="/my-plan" className="entry">
            <span className="entry-k">My Plan</span>
            <span className="entry-d">
              Bookmarked sessions grouped by day, with clash warnings. Stored on this device only.
            </span>
          </Link>
        </div>
      </section>

      <footer>
        Built from published Global Fintech Fest {EVENT_YEAR} data: {SESSIONS.length} sessions,{" "}
        {SPEAKERS.length} speakers, {PARTNERS.length} exhibitors and partners. Every answer from the
        concierge is grounded in those records and cites them. Booth locations are omitted throughout
        because GFF has not published a floor plan. This is an independent companion, not an official GFF
        product — see{" "}
        <a href="https://www.globalfintechfest.com" target="_blank" rel="noopener noreferrer">
          globalfintechfest.com
        </a>{" "}
        for official information.
      </footer>
    </main>
  );
}
