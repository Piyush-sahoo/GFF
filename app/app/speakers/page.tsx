import type { Metadata } from "next";
import Nav from "../../components/Nav";
import SpeakerDirectory, { type SlimSpeaker } from "../../components/SpeakerDirectory";
import { EVENT_YEAR, SPEAKERS, sessionsForSpeaker, speakerSlug } from "../../lib/content";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: `Speakers — Global Fintech Fest ${EVENT_YEAR}`,
  description: `All ${SPEAKERS.length} Global Fintech Fest ${EVENT_YEAR} speakers with photos, roles, organisations and bios.`,
};

const slim: SlimSpeaker[] = SPEAKERS.map((s) => ({
  slug: speakerSlug(s),
  name: s.name,
  title: s.title,
  org: s.org,
  bio: s.bio,
  headshotUrl: s.headshotUrl,
  linkedin: s.linkedin,
  country: s.country,
  sessionCount: sessionsForSpeaker(s).length,
})).sort((a, b) => b.sessionCount - a.sessionCount || a.name.localeCompare(b.name));

export default function SpeakersPage() {
  const withBio = SPEAKERS.filter((s) => s.bio?.trim()).length;
  const withLinkedIn = SPEAKERS.filter((s) => s.linkedin).length;

  return (
    <main className="shell">
      <Nav active="Speakers" />
      <header className="subhero">
        <h1 className="display sub">
          {SPEAKERS.length} <em>speakers</em>
        </h1>
        <p className="lede">
          Everyone speaking at Global Fintech Fest {EVENT_YEAR}. Search by name, role, or organisation, or
          filter by country.
        </p>
      </header>

      <section className="section">
        <SpeakerDirectory speakers={slim} />
      </section>

      <footer>
        Published GFF {EVENT_YEAR} speaker data: {SPEAKERS.length}/{SPEAKERS.length} have a photo, role and
        organisation, {withBio}/{SPEAKERS.length} have a bio, and {withLinkedIn}/{SPEAKERS.length} list a
        LinkedIn profile. Session counts come from the published agenda.
      </footer>
    </main>
  );
}
