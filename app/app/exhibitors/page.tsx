import type { Metadata } from "next";
import Link from "next/link";
import ExhibitorDirectory from "../../components/ExhibitorDirectory";
import { PARTNERS, partnerCoverage, SUPPRESSED, EVENT_YEAR } from "../../lib/content";

// Statically prerendered at build time and served from the CDN. No database is
// touched on the read path, so venue wifi and any DB outage cannot break it.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Exhibitors & Partners — Global Fintech Fest ${EVENT_YEAR}`,
  description: `Search all ${PARTNERS.length} Global Fintech Fest ${EVENT_YEAR} exhibitors and partners by name, sector, and partnership group.`,
};

export default function ExhibitorsPage() {
  const cov = partnerCoverage();

  return (
    <main className="shell">
      <header className="subhero">
        <Link href="/" className="backlink">
          ← GFF Concierge
        </Link>
        <h1 className="display sub">
          Exhibitors &amp; <em>partners</em>
        </h1>
        <p className="lede">
          All {cov.total} organisations listed for Global Fintech Fest {EVENT_YEAR}. Search by name or
          sector, or filter by partnership group.
        </p>

        <div className="notice warn">
          <span className="badge">No floor plan</span>
          <span>
            <strong>GFF has not published the {EVENT_YEAR} floor plan.</strong> No booth or stall numbers
            are shown here for any exhibitor, and the concierge will not guess one. Hall names shown
            elsewhere on this site refer to <em>sessions</em>, never to an exhibitor location.
          </span>
        </div>
      </header>

      <section className="section" id="exhibitors">
        <ExhibitorDirectory partners={PARTNERS} />
      </section>

      <footer>
        Logos and websites are published by GFF ({cov.withLogo}/{cov.total} logos,{" "}
        {cov.withWebsite}/{cov.total} websites). Descriptions cover {cov.withDescription}/{cov.total} and
        use cases {cov.withUseCases}/{cov.total}; the remainder are still being compiled and are shown
        without a description rather than filled in with generated text. Booth locations are not shown
        because GFF has not published them.
        {SUPPRESSED.length > 0 && (
          <>
            {" "}
            {SUPPRESSED.length} description{SUPPRESSED.length === 1 ? " was" : "s were"} withheld because
            the source text carried a booth number, hall, or a previous edition&apos;s event details.
          </>
        )}
      </footer>
    </main>
  );
}
