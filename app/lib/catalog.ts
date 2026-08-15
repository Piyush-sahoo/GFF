/**
 * THE FULL CATALOG, AND THE ID SET THAT MAKES IT SAFE.
 *
 * The entire GFF 2026 dataset compresses to ~22k tokens in the compact line
 * format below, which fits comfortably in a single model context. So the agent
 * is given ALL of it and picks records itself, by id. That is what lets it
 * reason semantically — "I'm raising a Series A" surfaces investor-track
 * sessions that share not one keyword with the question, which the deterministic
 * matcher in lib/match.ts structurally cannot do.
 *
 * The safety property is NOT that the model is well-behaved. It is that every id
 * the model returns is looked up in the real id set and dropped if absent, and
 * every rendered title is resolved from lib/content.ts rather than echoed from
 * the model. A hallucinated session cannot survive either step, so invention is
 * structurally impossible rather than merely discouraged.
 *
 * Two filters are applied HERE, in code, before the model ever sees the text:
 *   1. The 34 invite-only / closed-door sessions are removed. The contract
 *      requires this be enforced in code, not by instruction — a prompt rule can
 *      be argued with, an absent row cannot be picked.
 *   2. Speakers reachable only through an invite-only session are removed, since
 *      "go see them at X" is not actionable advice if X cannot be attended.
 *
 * Exhibitors carry NO location field of any kind. GFF published no 2026 floor
 * plan; lib/content.ts already nulls `booth`, and this file never emits a hall
 * for a partner. Session halls are emitted for sessions only.
 */
import {
  PARTNERS,
  SESSIONS,
  SPEAKERS,
  dayLabel,
  getPartner,
  getSession,
  isBookmarkable,
  speakerSlug,
} from "./content";
import type { Partner, Plan, PlanSource, Session, Speaker } from "./types";

/** Sessions the agent is allowed to plan. Invite-only never appears here. */
export const PLANNABLE_SESSIONS: Session[] = SESSIONS.filter(isBookmarkable);

/** The 34 excluded sessions, kept only so the UI can report the number honestly. */
export const EXCLUDED_SESSIONS: Session[] = SESSIONS.filter((s) => !isBookmarkable(s));

const PLANNABLE_CODES = new Set(PLANNABLE_SESSIONS.map((s) => s.agendaCode));

/**
 * A speaker is "reachable" if at least one of their sessions can be attended.
 * Speakers appearing only in closed-door sessions are withheld: recommending
 * someone you cannot actually get to is a dead end dressed up as a suggestion.
 */
export const REACHABLE_SPEAKERS: Speaker[] = SPEAKERS.filter((sp) =>
  (sp.sessionCodes || []).some((c) => PLANNABLE_CODES.has(c)),
);

export const SESSION_IDS: ReadonlySet<string> = PLANNABLE_CODES;
export const SPEAKER_IDS: ReadonlySet<string> = new Set(REACHABLE_SPEAKERS.map((s) => s.nameKey));
export const PARTNER_IDS: ReadonlySet<string> = new Set(PARTNERS.map((p) => p.slug));

const SPEAKER_BY_KEY = new Map<string, Speaker>(REACHABLE_SPEAKERS.map((s) => [s.nameKey, s]));

export type IdKind = "session" | "person" | "partner";

/**
 * Which collection an id belongs to, decided by LOOKUP rather than by shape.
 * Shape-sniffing ("A#### is a session") would silently mis-file the first id
 * whose format drifts in a re-scrape; a lookup just fails closed instead.
 */
export function classifyId(id: string): IdKind | null {
  if (SESSION_IDS.has(id)) return "session";
  if (SPEAKER_IDS.has(id)) return "person";
  if (PARTNER_IDS.has(id)) return "partner";
  return null;
}

export type ValidatedIds = {
  sessions: string[];
  people: string[];
  partners: string[];
  /** Ids the model returned that match no real record. Dropped, and reported. */
  dropped: string[];
};

/**
 * THE GROUNDING GATE. Every id from the model passes through here before it can
 * reach a plan, a reply, or a phone call. Unknown ids are dropped, not repaired
 * and not fuzzy-matched — a near-miss corrected to a real session is still a
 * recommendation nobody made.
 */
export function validateIds(ids: unknown): ValidatedIds {
  const out: ValidatedIds = { sessions: [], people: [], partners: [], dropped: [] };
  if (!Array.isArray(ids)) return out;
  const seen = new Set<string>();
  for (const raw of ids) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    switch (classifyId(id)) {
      case "session": out.sessions.push(id); break;
      case "person": out.people.push(id); break;
      case "partner": out.partners.push(id); break;
      default: out.dropped.push(id);
    }
  }
  return out;
}

export function getReachableSpeaker(nameKey: string): Speaker | undefined {
  return SPEAKER_BY_KEY.get(nameKey);
}

/* ------------------------------------------------------------------ *
 * Label resolution — the only path from an id to displayed text
 * ------------------------------------------------------------------ */

export type ResolvedItem = {
  id: string;
  kind: IdKind;
  label: string;
  detail: string;
  href: string;
  /** Present for sessions only. Never emitted for a partner. */
  day: string | null;
};

/**
 * Resolve an id to display text from the STATIC dataset. Nothing here reads the
 * model's output: the agent chooses which record, never what the record says.
 */
export function resolveItem(id: string): ResolvedItem | null {
  const kind = classifyId(id);
  if (!kind) return null;

  if (kind === "session") {
    const s = getSession(id);
    if (!s) return null;
    return {
      id,
      kind,
      label: s.title,
      detail: [dayLabel(s.day), `${s.startTime}–${s.endTime}`, s.hall].filter(Boolean).join(" · "),
      href: `/agenda/${s.agendaCode}`,
      day: s.day,
    };
  }

  if (kind === "person") {
    const sp = getReachableSpeaker(id);
    if (!sp) return null;
    return {
      id,
      kind,
      label: sp.name,
      detail: [sp.title, sp.org].filter(Boolean).join(" · "),
      href: `/speakers/${speakerSlug(sp)}`,
      day: null,
    };
  }

  const p = getPartner(id);
  if (!p) return null;
  return {
    id,
    kind,
    // No location, ever. An exhibitor's detail line is what they do, nothing more.
    label: p.name,
    detail: p.category ?? "",
    href: `/exhibitors#${p.slug}`,
    day: null,
  };
}

export function resolveItems(ids: string[]): ResolvedItem[] {
  return ids.map(resolveItem).filter((x): x is ResolvedItem => x !== null);
}

/* ------------------------------------------------------------------ *
 * Plan views — resolved on the SERVER, always
 * ------------------------------------------------------------------ */

export type PlanItem = ResolvedItem & { why: string; source: PlanSource };

export type PlanView = {
  objective: string | null;
  sessions: PlanItem[];
  people: PlanItem[];
  partners: PlanItem[];
  updatedAt: string | null;
  /** Ids stored in the plan that no longer resolve, e.g. after a data rebuild. */
  unresolved: string[];
};

const EMPTY_VIEW: PlanView = {
  objective: null,
  sessions: [],
  people: [],
  partners: [],
  updatedAt: null,
  unresolved: [],
};

/**
 * Turn a stored plan (ids only) into displayable items.
 *
 * This runs on the server for a reason beyond correctness: the client must
 * never import lib/content.ts, or the entire 2026 dataset ships to the browser.
 * It resolves through the static data, so a title can only ever be the real one.
 */
export function viewPlan(plan: Plan | null): PlanView {
  if (!plan) return EMPTY_VIEW;

  const unresolved: string[] = [];
  const build = (ids: string[]): PlanItem[] =>
    ids.flatMap((id) => {
      const item = resolveItem(id);
      if (!item) {
        unresolved.push(id);
        return [];
      }
      return [{ ...item, why: plan.why[id] ?? "", source: plan.source[id] ?? "agent" }];
    });

  const sessions = build(plan.sessions).sort((a, b) =>
    (a.day ?? "").localeCompare(b.day ?? "") || a.detail.localeCompare(b.detail),
  );

  return {
    objective: plan.objective,
    sessions,
    people: build(plan.people),
    partners: build(plan.partners),
    updatedAt: plan.updatedAt,
    unresolved,
  };
}

/**
 * ONE day of the plan as compact spoken-friendly text, for injection into the
 * voice call. Built from resolved records only.
 *
 * Sessions carry their hall because a hall is published session data. Exhibitors
 * carry no location and never can — they are a "worth finding" list, and the
 * text says exactly that so the voice agent has nothing to embellish.
 */
export function planDayText(plan: Plan | null, day: string): {
  text: string;
  sessionCount: number;
  isEmpty: boolean;
  /** Start time of the earliest planned session that day, e.g. "10:00". */
  firstStart: string | null;
} {
  const view = viewPlan(plan);
  const forDay = view.sessions.filter((s) => s.day === day);
  const firstStart = forDay.length ? (getSession(forDay[0].id)?.startTime ?? null) : null;

  if (!forDay.length && !view.partners.length) {
    return { text: "", sessionCount: 0, isEmpty: true, firstStart: null };
  }

  const lines: string[] = [];
  if (forDay.length) {
    lines.push(`${forDay.length} session${forDay.length === 1 ? "" : "s"} on ${dayLabel(day)}:`);
    for (const s of forDay) {
      const sp = getSession(s.id);
      const at = sp ? `${sp.startTime} to ${sp.endTime}` : "";
      const where = sp?.hall ? `, in ${sp.hall}` : "";
      lines.push(`At ${at}${where}: ${s.label}.${s.why ? ` ${s.why}` : ""}`);
    }
  } else {
    lines.push(`Nothing scheduled on ${dayLabel(day)} yet.`);
  }

  if (view.partners.length) {
    const names = view.partners.slice(0, 6).map((p) => p.label);
    lines.push(
      `Exhibitors worth finding: ${names.join(", ")}. GFF has not published a floor plan, so there are no stand locations to give.`,
    );
  }

  return { text: lines.join(" "), sessionCount: forDay.length, isEmpty: false, firstStart };
}

/* ------------------------------------------------------------------ *
 * The catalog text itself
 * ------------------------------------------------------------------ */

/** Collapse whitespace and cap length; keeps one runaway description from
 *  distorting the whole catalog. */
function trim(s: string | null | undefined, max: number): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

function sessionLine(s: Session): string {
  return [
    s.agendaCode,
    s.day.slice(5), // "09-09" — the year is constant and stated in the header
    `${s.startTime}-${s.endTime}`,
    s.hall || "-",
    trim(s.title, 130),
    [s.track, ...(s.topics || [])].filter(Boolean).join("/") || "-",
  ].join("|");
}

function speakerLine(sp: Speaker): string {
  return [
    sp.nameKey,
    sp.name,
    trim(sp.title, 60) || "-",
    trim(sp.org, 60) || "-",
    (sp.sessionCodes || []).filter((c) => PLANNABLE_CODES.has(c)).join(","),
  ].join("|");
}

function partnerLine(p: Partner): string {
  const what = (p.useCases || []).join("/") || trim(p.whatTheyDo, 110);
  return [p.slug, p.name, p.category || "-", what || "-"].join("|");
}

let CACHED: string | null = null;

/**
 * The whole universe, as text, built once per process. ~22k tokens.
 *
 * Column headers are stated rather than implied so the model does not have to
 * infer field order from examples — cheaper and less error-prone than JSON, and
 * it keeps ids visually adjacent to the text that justifies picking them.
 */
export function buildCatalog(): string {
  if (CACHED) return CACHED;

  const sessions = PLANNABLE_SESSIONS.map(sessionLine).join("\n");
  const speakers = REACHABLE_SPEAKERS.map(speakerLine).join("\n");
  const partners = PARTNERS.map(partnerLine).join("\n");

  CACHED = [
    `GFF 2026 CATALOG — every record below is real and published. All dates are September 2026.`,
    ``,
    `SESSIONS (${PLANNABLE_SESSIONS.length}) — id|date|time|hall|title|track/topics`,
    `The ${EXCLUDED_SESSIONS.length} invite-only sessions are already removed from this list; you cannot see them and must not plan one.`,
    `The hall belongs to the SESSION. It is never an exhibitor's location.`,
    sessions,
    ``,
    `SPEAKERS (${REACHABLE_SPEAKERS.length}) — id|name|role|organisation|sessions they appear in`,
    speakers,
    ``,
    `EXHIBITORS (${PARTNERS.length}) — id|name|sector|what they do`,
    `GFF has published NO floor plan for 2026. These records contain no booth, stall or location, and none exists to look up.`,
    partners,
  ].join("\n");

  return CACHED;
}

/** Rough size, surfaced in logs so a dataset that outgrows the context is noticed. */
export function catalogStats() {
  const text = buildCatalog();
  return {
    sessions: PLANNABLE_SESSIONS.length,
    excludedSessions: EXCLUDED_SESSIONS.length,
    speakers: REACHABLE_SPEAKERS.length,
    speakersTotal: SPEAKERS.length,
    partners: PARTNERS.length,
    chars: text.length,
    approxTokens: Math.round(text.length / 3.7),
  };
}
