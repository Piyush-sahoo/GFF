import type { Metadata } from "next";
import Link from "next/link";
import Nav from "../../components/Nav";
import { EVENT_YEAR } from "../../lib/content";
import { listPublic, PROFILES_ENABLED } from "../../lib/profiles";
import { listSharedPlans } from "../../lib/db";
import PeopleDirectory from "./PeopleDirectory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `People — GFF ${EVENT_YEAR} Concierge`,
  description: `Opt-in directory of attendees who chose to be listed. Self-declared and unverified.`,
};

export default async function PeoplePage() {
  let people: Awaited<ReturnType<typeof listPublic>> = [];
  /** Slugs whose owner ALSO opted in to sharing the plan itself. */
  let sharedSlugs: string[] = [];
  let error: string | null = null;
  if (PROFILES_ENABLED) {
    try {
      people = await listPublic();
      sharedSlugs = (await listSharedPlans()).map((p) => p.slug);
    } catch { error = "The people directory is temporarily unreachable."; }
  } else {
    error = "The people directory is not configured on this server.";
  }

  return (
    <main className="shell">
      <Nav active="People" />
      <header className="subhero">
        <h1 className="display sub">People <em>to meet</em></h1>
        <p className="lede">
          Attendees who opted in to be listed. Everything here is self-declared — we do not verify names,
          roles, employers or links, and nobody here is &ldquo;verified&rdquo;.
        </p>
        <div className="notice warn">
          <span className="badge">Not GFF registration</span>
          <span>
            <strong>This directory is not run by GFF and is not registration.</strong> Being listed does
            not mean someone holds a ticket or will attend. Official information:{" "}
            <a href="https://www.globalfintechfest.com" target="_blank" rel="noopener noreferrer">globalfintechfest.com</a>.
          </span>
        </div>
      </header>

      <section className="section">
        <div className="section-head">
          <h2 className="sec">Directory</h2>
          <span className="count">{people.length} listed</span>
        </div>
        {error ? (
          <div className="empty">{error}</div>
        ) : people.length === 0 ? (
          <div className="pending">
            <div className="pending-mark">Nobody listed yet</div>
            <h3>No one has opted in yet.</h3>
            <p>
              This directory only shows people who explicitly ticked the consent box on their profile.
              It is empty because nobody has yet — not because it failed to load.
            </p>
            <p className="pending-foot">
              <Link href="/profile">Create your profile →</Link>
            </p>
          </div>
        ) : (
          <PeopleDirectory
            people={people.map((p) => ({
              slug: p.slug,
              name: p.name,
              role: p.role,
              org: p.org,
              lookingFor: p.lookingFor,
              interests: p.interests ?? [],
              isDemo: Boolean(p.isDemo),
              hasSharedPlan: sharedSlugs.includes(p.slug),
            }))}
          />
        )}
      </section>

      <footer>
        Self-declared, unverified, opt-in. People can remove themselves at any time, which also removes
        them from recommendations shown to others. Being listed here is <strong>not</strong> the same as
        sharing a plan: a plan says where a named person is at a given time for three days, so it takes
        its own separate opt-in and most people here have not given it.
      </footer>
    </main>
  );
}
