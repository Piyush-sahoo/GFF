/**
 * GOAL-DRIVEN MATCHING.
 *
 * Deterministic and fully grounded: every recommendation is a real record, and
 * every reason is built from terms that literally occur in both the user's
 * stated objective and the record. Nothing here calls a model, so there is no
 * path by which a rationale can be invented — the honesty rule is enforced by
 * construction rather than by instruction.
 *
 * Weak matches are omitted rather than padded with a vague reason.
 */
import {
  PARTNERS,
  SESSIONS,
  SPEAKERS,
  speakersForSession,
  tokenize,
} from "./content";
import type { Partner, Session, Speaker } from "./types";

export type Why = {
  /** Terms present in BOTH the objective and the record. Never fabricated. */
  terms: string[];
  /** Which fields those terms were found in. */
  fields: string[];
};

export type SessionRec = { session: Session; score: number; why: Why; speakers: Speaker[] };
export type SpeakerRec = { speaker: Speaker; score: number; why: Why };
export type PartnerRec = { partner: Partner; score: number; why: Why };

export type MatchResult = {
  objective: string;
  terms: string[];
  sessions: SessionRec[];
  speakers: SpeakerRec[];
  partners: PartnerRec[];
  coverage: {
    partnersTotal: number;
    partnersWithUseCases: number;
    partnersWithDescription: number;
    partnersWithSpecificSector: number;
    sessionsTotal: number;
    sessionsWithDescription: number;
    sessionsWithTrack: number;
    speakersTotal: number;
    speakersWithBio: number;
    closedDoorExcluded: number;
  };
};

/** Score one record. Returns matched terms and the fields they came from. */
function scoreFields(terms: string[], fields: [string, string | null | undefined, number][]) {
  const hit = new Set<string>();
  const where = new Set<string>();
  let score = 0;
  for (const [fieldName, raw, weight] of fields) {
    if (!raw) continue;
    const hay = raw.toLowerCase();
    for (const t of terms) {
      if (hay.includes(t)) {
        score += weight;
        hit.add(t);
        where.add(fieldName);
      }
    }
  }
  return { score, why: { terms: Array.from(hit), fields: Array.from(where) } };
}

/**
 * QUERY-SIDE NOISE.
 *
 * These are words people use to describe THEMSELVES and their intent, not the
 * thing they want. Left in, "company" matches the job title "Company Secretary"
 * and an org called "...Innovation Company of Trinidad & Tobago", and "looking"
 * / "networking" match nothing meaningful at all. They are stripped from the
 * QUERY only — documents keep every word, so a session genuinely about
 * partnerships is still findable by other terms.
 *
 * Domain nouns (voice, agent, payments, lending, ai…) are deliberately NOT here.
 */
const QUERY_NOISE = new Set([
  "company", "companies", "startup", "startups", "business", "businesses",
  "looking", "look", "seeking", "seek", "want", "wants", "need", "needs",
  "find", "finding", "meet", "meeting", "networking", "network",
  "partner", "partners", "partnership", "partnerships", "connect", "connection",
  "connections", "interested", "interest", "help", "opportunity", "opportunities",
  "founder", "ceo", "cto", "team", "our", "ours", "someone", "people", "person",
]);

const MIN_SCORE = 2;

/** Content-bearing terms only: tokenised, stopworded, and self-description stripped. */
export function contentTerms(q: string): string[] {
  return tokenize(q).filter((t) => !QUERY_NOISE.has(t));
}

export function match(objective: string, limit = 6): MatchResult {
  const terms = tokenize(objective).filter((t) => !QUERY_NOISE.has(t));

  const closedDoor = SESSIONS.filter((s) => s.isClosedDoor || s.accessType === "invite-only");

  const coverage = {
    partnersTotal: PARTNERS.length,
    partnersWithUseCases: PARTNERS.filter((p) => p.useCases?.length).length,
    partnersWithDescription: PARTNERS.filter((p) => p.whatTheyDo?.trim()).length,
    partnersWithSpecificSector: PARTNERS.filter((p) => p.category && p.category !== "other").length,
    sessionsTotal: SESSIONS.length,
    sessionsWithDescription: SESSIONS.filter((s) => s.description?.trim()).length,
    sessionsWithTrack: SESSIONS.filter((s) => s.track).length,
    speakersTotal: SPEAKERS.length,
    speakersWithBio: SPEAKERS.filter((s) => s.bio?.trim()).length,
    closedDoorExcluded: closedDoor.length,
  };

  if (!terms.length) {
    return { objective, terms, sessions: [], speakers: [], partners: [], coverage };
  }

  // Closed-door sessions are excluded from recommendations entirely — they are
  // visible elsewhere on the site, but must never be suggested for attendance.
  const sessions: SessionRec[] = SESSIONS.filter(
    (s) => !s.isClosedDoor && s.accessType !== "invite-only",
  )
    .map((s) => {
      const { score, why } = scoreFields(terms, [
        ["title", s.title, 5],
        ["description", s.description, 2],
        ["track", s.track, 4],
        ["format", s.format, 1],
        ["topics", (s.topics || []).join(" "), 3],
      ]);
      return { session: s, score, why, speakers: speakersForSession(s) };
    })
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const speakers: SpeakerRec[] = SPEAKERS.map((sp) => {
    const { score, why } = scoreFields(terms, [
      ["role", sp.title, 3],
      ["organisation", sp.org, 4],
      ["bio", sp.bio, 2],
    ]);
    return { speaker: sp, score, why };
  })
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const partners: PartnerRec[] = PARTNERS.map((p) => {
    const { score, why } = scoreFields(terms, [
      ["name", p.name, 4],
      ["what they do", p.whatTheyDo, 3],
      ["use cases", (p.useCases || []).join(" "), 4],
      ["sector", p.category, 2],
    ]);
    return { partner: p, score, why };
  })
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { objective, terms, sessions, speakers, partners, coverage };
}

/** Human-readable rationale, assembled only from real matched terms. */
export function reason(why: Why): string {
  if (!why.terms.length) return "";
  const t = why.terms.map((x) => `“${x}”`).join(", ");
  const f = why.fields.join(", ");
  return `Matched ${t} in its ${f}.`;
}
