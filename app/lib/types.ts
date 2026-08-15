export type Partner = {
  name: string;
  slug: string;
  website: string | null;
  logoUrl: string | null;
  tier: string | null;
  category: string | null;
  whatTheyDo: string | null;
  useCases: string[];
  booth: string | null;
  boothSource: string | null;
  year: number;
  sourceUrl: string | null;
  confidence: number;
  extractedAt: string | null;
};

export type Speaker = {
  name: string;
  /** Normalised, lowercased join key. Salutations/suffixes/accents stripped. */
  nameKey: string;
  title: string | null;
  org: string | null;
  bio: string | null;
  headshotUrl: string | null;
  linkedin: string | null;
  country: string | null;
  /** Agenda codes this speaker appears in — the reliable session join. */
  sessionCodes: string[];
  sessionTitle: string | null;
  year: number;
  sourceUrl: string | null;
};

export type Session = {
  agendaCode: string;
  documentId: string;
  title: string;
  description: string | null;
  /** ISO date, e.g. "2026-09-09". */
  day: string;
  /** 24h clock, e.g. "10:00". */
  startTime: string;
  endTime: string;
  /** Session hall, e.g. "Jasmine 3". NEVER a partner booth. */
  hall: string | null;
  format: string | null;
  track: string | null;
  accessType: "public" | "invite-only" | string;
  isClosedDoor: boolean;
  topics: string[];
  /** Display-case names; fold case before joining to Speaker.nameKey. */
  speakerNames: string[];
  hostNames: string[];
  year: number;
  sourceUrl: string | null;
};

export type Citation = {
  name: string;
  year: number;
  sourceUrl: string | null;
  booth: string | null;
};

/* ------------------------------------------------------------------ *
 * Atlas-backed types. Shapes are pinned by the shared build contract; *
 * if one of these is wrong, raise it — do not edit it here.           *
 * ------------------------------------------------------------------ */

/** The three real fest days. No fake clock is ever derived from these. */
export const FEST_DAYS = ["2026-09-09", "2026-09-10", "2026-09-11"] as const;
export type FestDay = (typeof FEST_DAYS)[number];

export function isFestDay(v: unknown): v is FestDay {
  return typeof v === "string" && (FEST_DAYS as readonly string[]).includes(v);
}

/**
 * Login credentials. Separate from Profile on purpose: Profile is
 * user-authored and partly public, this is never returned to a client.
 */
export type Account = {
  /** Lowercased. Unique index. The identity key everywhere. */
  email: string;
  /** bcrypt cost>=12 or argon2id. NEVER logged, returned or rendered. */
  passwordHash: string;
  /** E.164, e.g. "+919876543210". Captured at registration. */
  phone: string;
  createdAt: string;
  lastLoginAt: string | null;
};

/** What is safe to hand to a caller. Deliberately has no passwordHash. */
export type PublicAccount = Pick<Account, "email" | "phone" | "createdAt" | "lastLoginAt">;

/** Who put an item in the plan. */
export type PlanSource = "agent" | "manual";

/**
 * Whether other attendees may read this plan.
 *
 * DEFAULT "private", and it must stay that way. Profile.consentPublic is
 * consent to be *listed* — it is not consent to publish your movements. A
 * plan says where a named person physically is, at a given time, for three
 * days. That is a different disclosure and it takes its own opt-in.
 */
export type PlanVisibility = "private" | "shared";

/**
 * ONE persistent plan per account, mutated by explicit add/remove ops.
 * Never silently regenerated — a manual pick must survive an agent edit.
 * Ids only: no denormalised session, speaker or partner content, so a
 * rebuilt dataset can never leave a stale title behind in Atlas.
 */
export type Plan = {
  email: string;
  /** Compiled from the conversation. null until the agent has one. */
  objective: string | null;
  /** Session ids — Session.agendaCode. */
  sessions: string[];
  /** Speaker ids — Speaker.nameKey. */
  people: string[];
  /** Exhibitor ids — Partner.slug. "Worth finding", never a location. */
  partners: string[];
  /** id -> who added it. */
  source: Record<string, PlanSource>;
  /** id -> one-line grounded reason. */
  why: Record<string, string>;
  /** Absent on plans written before sharing existed — treat absent as private. */
  visibility?: PlanVisibility;
  /** Seeded demo attendee. Badged in the UI and safe to delete wholesale. */
  isDemo?: boolean;
  updatedAt: string;
};

/** A shared plan as another attendee may see it. Never carries an email. */
export type SharedPlanSummary = {
  slug: string;
  name: string;
  role: string | null;
  org: string | null;
  /** Profile data, gated by consentPublic — already public in the directory. */
  interests: string[];
  isDemo: boolean;
  /** agendaCode[] — ids only, resolved against the static catalog on render. */
  sessions: string[];
  partners: string[];
  objective: string | null;
};

/** A stretch of a festival day when nobody selected has anything booked. */
export type FreeWindow = {
  day: string;
  /** "14:30" */
  start: string;
  end: string;
  minutes: number;
};

/** Something more than one selected person has in their plan. */
export type CommonInterest = {
  label: string;
  kind: "topic" | "exhibitor";
  /** How many of the selected people it appears for. */
  count: number;
};

// GET /api/meet?slugs=a,b,c -> 200 { people, sharedSessions, freeWindows, commonInterests }
export type MeetResponse = {
  people: SharedPlanSummary[];
  /** agendaCode[] every selected person already has. The strongest answer. */
  sharedSessions: string[];
  freeWindows: FreeWindow[];
  commonInterests: CommonInterest[];
  /** Slugs asked for that had no shared plan, so the UI can say which. */
  unavailable: string[];
};

/**
 * One shared-plan attendee, annotated with how they overlap with a specific
 * caller. Everything here has already passed both gates, so it is safe to
 * hand to a model — see attendeeOverlapsFor in lib/db.ts.
 */
export type AttendeeOverlap = {
  slug: string;
  name: string;
  role: string | null;
  org: string | null;
  interests: string[];
  isDemo: boolean;
  /** How many sessions they have. Only ever set for a plan that IS shared. */
  sessionCount: number;
  /** agendaCodes both they and the caller hold. Empty if the caller has none. */
  sharedSessions: string[];
  /** Windows when the caller and this person are both unbooked. */
  freeWindows: FreeWindow[];
  commonInterests: CommonInterest[];
};

export type ConversationTurn = {
  role: "user" | "agent";
  text: string;
  at: string;
  ops?: PlanOps;
};

/** ONE doc per email. The agent's memory across page loads. */
export type Conversation = {
  email: string;
  turns: ConversationTurn[];
  updatedAt: string;
};

/** One outbound Bolna call. Outbound only — nothing calls us back. */
export type CallRecord = {
  email: string;
  day: FestDay;
  bolnaAgentId: string;
  executionId: string;
  status: string;
  requestedAt: string;
  /** The number actually dialled, snapshotted in case the profile changes. */
  phoneAtDial: string;
};

/* ---------------------------- API shapes ---------------------------- */

/** Ids to add / remove. Validated against the real id set before use. */
export type PlanOps = {
  add: string[];
  remove: string[];
};

// POST /api/auth/register -> 201 { email } | 400 | 409
export type RegisterRequest = {
  email: string;
  password: string;
  /** E.164. */
  phone: string;
};
export type RegisterResponse = { email: string };

// POST /api/auth -> 200 { email } | 401
export type LoginRequest = { email: string; password: string };
export type LoginResponse = { email: string };

// DELETE /api/auth -> 204, no body.

// GET /api/plan -> 200 { plan: Plan | null }
export type PlanGetResponse = { plan: Plan | null };

// POST /api/plan { add?, remove? } -> 200 { plan }
export type PlanPostRequest = { add?: string[]; remove?: string[] };
export type PlanPostResponse = { plan: Plan };

// POST /api/agent { message } -> 200 { reply, ops, plan }
export type AgentRequest = { message: string };
export type AgentResponse = {
  reply: string;
  /** VALIDATED ids only — anything unknown is dropped before this point. */
  ops: PlanOps;
  /** The plan AFTER ops are applied. */
  plan: Plan;
};

// POST /api/call { day } -> 200 { executionId } | 400 | 503
export type CallRequest = { day: FestDay };
export type CallResponse = { executionId: string };

/** Every non-2xx JSON body in this app is this shape. */
export type ApiError = { error: string };
