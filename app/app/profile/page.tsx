import type { Metadata } from "next";
import Nav from "../../components/Nav";
import ProfileEditor from "../../components/ProfileEditor";
import { EVENT_YEAR } from "../../lib/content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `My profile — GFF ${EVENT_YEAR} Concierge`,
  description: `Set up an opt-in attendee profile and get session, speaker and exhibitor recommendations based on what you are looking for.`,
};

export default function ProfilePage() {
  return (
    <main className="shell">
      <Nav active="Profile" />
      <header className="subhero">
        <h1 className="display sub">My <em>profile</em></h1>
        <p className="lede">
          Tell us what you do and what you want out of GFF {EVENT_YEAR}, and we&apos;ll recommend sessions,
          speakers and exhibitors from the published records — with the reason for each one.
        </p>
      </header>
      <section className="section">
        <ProfileEditor />
      </section>
      <footer>
        Profiles are self-declared and unverified: signing in with an email does not confirm identity, and
        nothing here is checked. Your email is never displayed. Your profile is private until you tick the
        consent box, and deleting it removes it entirely — including from other people&apos;s
        recommendations. We collect only what you type on this page.
      </footer>
    </main>
  );
}
