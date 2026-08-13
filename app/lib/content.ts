/**
 * STATIC-FIRST DATA LAYER.
 *
 * Everything here is read from vendored JSON at build time. There is no runtime
 * database call anywhere in the read path: pages prerender and serve from the
 * CDN, so venue wifi and an Atlas outage cannot take the site down.
 *
 * Refresh the vendored files with ./sync-data.sh.
 */
import partnersJson from "../data/partners-2026.json";
import sessionsJson from "../data/sessions-2026.json";
import speakersJson from "../data/speakers-2026.json";
import type { Partner, Session, Speaker } from "./types";

export const EVENT_YEAR = 2026;

/**
 * FREE-TEXT CONTAMINATION GUARD.
 *
 * Nulling the `booth` field is not sufficient. Partner descriptions are scraped,
 * and at least one arrived carrying a previous edition's marketing block:
 *   "Global Fintech Fest 2025 ... Venue Jasmine Hall ... Booth No. JC9"
 * — a booth number and last year's dates, rendered as a current description.
 *
 * Both failures the floor-plan and data-year rules exist to prevent, arriving
 * through a field neither rule was watching. So every free-text field is checked
 * before it can reach a page or the model.
 *
 * Suppression is whole-field and deliberate: a partially scrubbed sentence can
 * read as authoritative while having had its qualifier removed. Dropping the
 * text and saying so is safer than editing it into something plausible.
 */
const RX_BOOTH_ID = /\b(?:booth|stall|kiosk|pavilion)\b\s*(?:no\.?|number|#)?\s*[:#-]?\s*[A-Za-z]{0,3}-?\d+[A-Za-z]?\b/i;
const RX_HALL_ID = /\b(?:hall|pavilion|zone|wing|level)\s+[A-Za-z]{0,3}-?\d+\b/i;
const RX_PRIOR_EDITION = /\b(?:global fintech fest|gff)\s*(20\d{2})\b/i;
const RX_VENUE = /\b(?:jio world|trident bkc|convention centre|convention center)\b/i;

export function isContaminated(text: string | null | undefined): string[] {
  if (!text) return [];
  const reasons: string[] = [];
  if (RX_BOOTH_ID.test(text)) reasons.push("booth identifier");
  if (RX_HALL_ID.test(text)) reasons.push("hall identifier");
  const m = RX_PRIOR_EDITION.exec(text);
  if (m && Number(m[1]) !== EVENT_YEAR) reasons.push(`GFF ${m[1]} content`);
  if (RX_VENUE.test(text)) reasons.push("venue/location text");
  return reasons;
}

/** Records whose description was withheld, so the UI can report it honestly. */
export const SUPPRESSED: { name: string; reasons: string[] }[] = [];

function cleanPartner(p: Partner): Partner {
  const reasons = isContaminated(p.whatTheyDo);
  if (reasons.length) SUPPRESSED.push({ name: p.name, reasons });
  return {
    ...p,
    // GFF has not published a floor plan; any booth value is wrong.
    booth: null,
    boothSource: null,
    whatTheyDo: reasons.length ? null : p.whatTheyDo,
    useCases: (Array.isArray(p.useCases) ? p.useCases : []).filter(
      (u) => isContaminated(u).length === 0,
    ),
  };
}

/**
 * Some records are altText artifacts from GFF's own CMS rather than exhibiting
 * organisations. The upstream `isDataArtifact` flag is authoritative and is the
 * primary filter, so a re-scrape that introduces a NEW artifact is caught
 * without a code change. The name heuristic is kept only as a backstop for
 * records emitted before the flag existed.
 */
export const ARTIFACTS: string[] = (partnersJson as unknown as (Partner & { isDataArtifact?: boolean })[])
  .filter((p) => p.isDataArtifact || /\blogo\b/i.test(p.name))
  .map((p) => p.name);

export const PARTNERS: Partner[] = (partnersJson as unknown as (Partner & { isDataArtifact?: boolean })[])
  .filter((p) => !p.isDataArtifact && !/\blogo\b/i.test(p.name))
  .map(cleanPartner);

export const SESSIONS: Session[] = (sessionsJson as unknown as Session[]).slice().sort((a, b) => {
  if (a.day !== b.day) return a.day.localeCompare(b.day);
  if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
  return (a.hall || "").localeCompare(b.hall || "");
});

export const SPEAKERS: Speaker[] = speakersJson as unknown as Speaker[];

export const DAYS: string[] = Array.from(new Set(SESSIONS.map((s) => s.day))).sort();

/**
 * Session ↔ speaker linking.
 *
 * Verified against the emitted data rather than assumed: a case-sensitive join
 * on `session.speakerNames` matches 0/304, because the speaker directory's
 * `nameKey` is lowercased while `speakerNames` preserves display case. Folding
 * case takes it to 303/304. `speaker.sessionCodes -> session.agendaCode`
 * resolves 143/143 and is used as the primary index; the name path is the
 * secondary so sessions carrying only names still link.
 */
const BY_NAME_KEY = new Map<string, Speaker>();
for (const sp of SPEAKERS) {
  if (sp.nameKey) BY_NAME_KEY.set(sp.nameKey.toLowerCase().trim(), sp);
}

const BY_AGENDA_CODE = new Map<string, Speaker[]>();
for (const sp of SPEAKERS) {
  for (const code of sp.sessionCodes || []) {
    const list = BY_AGENDA_CODE.get(code) || [];
    list.push(sp);
    BY_AGENDA_CODE.set(code, list);
  }
}

export function speakersForSession(session: Session): Speaker[] {
  const out = new Map<string, Speaker>();
  for (const sp of BY_AGENDA_CODE.get(session.agendaCode) || []) out.set(sp.nameKey, sp);
  for (const raw of session.speakerNames || []) {
    const sp = BY_NAME_KEY.get(raw.toLowerCase().trim());
    if (sp) out.set(sp.nameKey, sp);
  }
  return Array.from(out.values());
}

export function sessionsForSpeaker(speaker: Speaker): Session[] {
  const codes = new Set(speaker.sessionCodes || []);
  const key = speaker.nameKey?.toLowerCase().trim();
  return SESSIONS.filter(
    (s) =>
      codes.has(s.agendaCode) ||
      (s.speakerNames || []).some((n) => n.toLowerCase().trim() === key),
  );
}

/** Free-text search over partners, used by the concierge's retrieval step. */
export function searchPartners(query: string, limit = 8): Partner[] {
  const terms = tokenize(query);
  if (!terms.length) return PARTNERS.slice(0, limit);
  return PARTNERS.map((p) => {
    const name = p.name.toLowerCase();
    const rest = [p.category, p.tier, p.whatTheyDo, ...(p.useCases || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const score = terms.reduce(
      (n, t) => n + (name.includes(t) ? 5 : 0) + (rest.includes(t) ? 1 : 0),
      0,
    );
    return { p, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Free-text search over sessions, for the concierge. */
export function searchSessions(query: string, limit = 8): Session[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  return SESSIONS.map((s) => {
    const title = (s.title || "").toLowerCase();
    const rest = [s.description, s.track, s.format, s.hall, ...(s.topics || []), ...(s.speakerNames || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const score = terms.reduce(
      (n, t) => n + (title.includes(t) ? 5 : 0) + (rest.includes(t) ? 1 : 0),
      0,
    );
    return { s, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

const STOPWORDS = new Set([
  "the", "and", "for", "are", "who", "what", "where", "when", "which", "with",
  "does", "did", "can", "you", "your", "about", "any", "all", "how", "that",
  "this", "from", "have", "has", "was", "were", "will", "would", "there",
  "their", "them", "they", "its", "just", "give", "tell", "show", "please",
  "list", "some", "into", "out", "get", "got", "gff", "partner", "partners",
  "booth", "stall", "number", "me", "my", "is", "it", "at", "of", "to", "in",
  "on", "or", "a", "an", "do", "be", "session", "sessions",
]);

export function tokenize(q: string): string[] {
  return Array.from(
    new Set(
      q
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
    ),
  );
}

/** Honest coverage counts, rendered in the UI rather than papered over. */
export function partnerCoverage() {
  return {
    total: PARTNERS.length,
    withLogo: PARTNERS.filter((p) => p.logoUrl).length,
    withWebsite: PARTNERS.filter((p) => p.website).length,
    withDescription: PARTNERS.filter((p) => p.whatTheyDo && p.whatTheyDo.trim()).length,
    withUseCases: PARTNERS.filter((p) => p.useCases && p.useCases.length).length,
  };
}

/* ------------------------------------------------------------------ *
 * Agenda helpers
 * ------------------------------------------------------------------ */

export const DAY_LABELS: Record<string, string> = {
  "2026-09-09": "Wed 9 Sep",
  "2026-09-10": "Thu 10 Sep",
  "2026-09-11": "Fri 11 Sep",
};

export function dayLabel(day: string): string {
  if (DAY_LABELS[day]) return DAY_LABELS[day];
  const d = new Date(day + "T00:00:00Z");
  return isNaN(d.getTime())
    ? day
    : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "10:00" -> minutes since midnight. Used for sorting and overlap checks. */
export function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Two sessions clash if they share a day and their time ranges intersect. */
export function overlaps(a: Session, b: Session): boolean {
  if (a.day !== b.day) return false;
  const as = toMinutes(a.startTime), ae = toMinutes(a.endTime);
  const bs = toMinutes(b.startTime), be = toMinutes(b.endTime);
  return as < be && bs < ae;
}

export function sessionsByDay(day: string): Session[] {
  return SESSIONS.filter((s) => s.day === day);
}

export function getSession(agendaCode: string): Session | undefined {
  return SESSIONS.find((s) => s.agendaCode === agendaCode);
}

/** URL-safe id for a speaker, derived from the normalised join key. */
export function speakerSlug(sp: Speaker): string {
  return (sp.nameKey || sp.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const SPEAKER_BY_SLUG = new Map<string, Speaker>();
for (const sp of SPEAKERS) SPEAKER_BY_SLUG.set(speakerSlug(sp), sp);

export function getSpeaker(slug: string): Speaker | undefined {
  return SPEAKER_BY_SLUG.get(slug);
}

export function getPartner(slug: string): Partner | undefined {
  return PARTNERS.find((p) => p.slug === slug);
}

export const TRACKS: string[] = Array.from(
  new Set(SESSIONS.map((s) => s.track).filter(Boolean) as string[]),
).sort();

export const FORMATS: string[] = Array.from(
  new Set(SESSIONS.map((s) => s.format).filter(Boolean) as string[]),
).sort();

/** Closed-door sessions are shown but never bookmarkable or recommendable. */
export function isBookmarkable(s: Session): boolean {
  return !s.isClosedDoor && s.accessType !== "invite-only";
}
