import bcrypt from "bcryptjs";
import { MongoClient, type Collection, type Db } from "mongodb";
import { DAYS, PARTNERS, SESSIONS, SPEAKERS, getSession, isBookmarkable, toMinutes } from "./content";
import type {
  Account,
  CallRecord,
  CommonInterest,
  Conversation,
  ConversationTurn,
  FreeWindow,
  Plan,
  PlanOps,
  PlanSource,
  PlanVisibility,
  SharedPlanSummary,
} from "./types";

/**
 * THE ONLY FILE THAT TALKS TO MONGO.
 *
 * Everything user-generated lives here: accounts, profiles, plans,
 * conversations and call records. GFF *content* — partners, speakers,
 * sessions — is static vendored JSON read at build time and must never
 * reach through this file, so venue wifi or an Atlas outage can take out
 * planning without taking out the agenda or the directories.
 *
 * Store ids only. Never denormalise a session title, a speaker bio or a
 * partner blurb into Atlas: the dataset gets rebuilt and stale copies
 * would outlive the rebuild.
 */
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "gff";

/**
 * No MONGODB_URI => every user-generated feature degrades with a clear
 * message instead of throwing. Callers check this before touching a
 * collection.
 */
export const PROFILES_ENABLED = Boolean(uri);

/** Same flag, named for the features that grew on top of it. */
export const ATLAS_ENABLED = PROFILES_ENABLED;

/** One sentence every degraded surface shows, so the wording matches. */
export const ATLAS_OFF_MESSAGE =
  "Accounts and plans are unavailable right now — the database is not configured. The agenda, speakers and exhibitors still work.";

let clientPromise: Promise<MongoClient> | null = null;

function client(): Promise<MongoClient> {
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, {
      serverSelectionTimeoutMS: 6000,
      maxPoolSize: 5,
    })
      .connect()
      .catch((e) => {
        // Drop the memo so the next request retries instead of latching a
        // one-off connect failure for the life of the process.
        clientPromise = null;
        throw e;
      });
  }
  return clientPromise;
}

export async function db(): Promise<Db> {
  return (await client()).db(dbName);
}

/**
 * Index creation is idempotent and cheap, but it is not free, so each
 * collection's indexes are ensured once per process rather than per call.
 * Failures are swallowed on purpose: a read-only Atlas user should still
 * be able to read.
 */
const ensured = new Set<string>();

async function ensure(name: string, make: () => Promise<unknown>): Promise<void> {
  if (ensured.has(name)) return;
  ensured.add(name);
  await make().catch(() => {
    // Let a later request try again rather than assuming it worked.
    ensured.delete(name);
  });
}

export async function accounts(): Promise<Collection<Account>> {
  const c = (await db()).collection<Account>("accounts");
  await ensure("accounts", () => c.createIndex({ email: 1 }, { unique: true }));
  return c;
}

export async function plans(): Promise<Collection<Plan>> {
  const c = (await db()).collection<Plan>("plans");
  await ensure("plans", () => c.createIndex({ email: 1 }, { unique: true }));
  return c;
}

export async function conversations(): Promise<Collection<Conversation>> {
  const c = (await db()).collection<Conversation>("conversations");
  await ensure("conversations", () => c.createIndex({ email: 1 }, { unique: true }));
  return c;
}

export async function calls(): Promise<Collection<CallRecord>> {
  const c = (await db()).collection<CallRecord>("calls");
  await ensure("calls", () =>
    // Not unique: one account may legitimately be called more than once.
    c.createIndex({ email: 1, requestedAt: -1 }),
  );
  return c;
}

/* ------------------------------------------------------------------ *
 * Accounts. The plaintext password exists only inside these two       *
 * functions and is never logged, returned, or written anywhere.       *
 * ------------------------------------------------------------------ */

/** bcrypt work factor. 12 is ~200ms here — slow enough to matter offline. */
const BCRYPT_COST = 12;

export const PASSWORD_MIN = 10;

/** E.164: a leading +, a non-zero country digit, 7-14 more. */
const E164 = /^\+[1-9]\d{7,14}$/;

export function isE164(phone: string): boolean {
  return E164.test(phone);
}

/** Deliberately permissive — we cannot verify an address, only its shape. */
export function normaliseEmail(email: string): string | null {
  const e = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

/**
 * Create an account. Returns null when the email is already taken, so the
 * caller can answer 409 without a second round trip.
 */
export async function createAccount(
  email: string,
  password: string,
  phone: string,
): Promise<Account | null> {
  const col = await accounts();
  const doc: Account = {
    email,
    passwordHash: await bcrypt.hash(password, BCRYPT_COST),
    phone,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  try {
    await col.insertOne({ ...doc });
  } catch (e) {
    // 11000 is the unique index on email doing its job.
    if ((e as { code?: number }).code === 11000) return null;
    throw e;
  }
  return doc;
}

/**
 * True only for a real account with a matching password.
 *
 * When no such account exists we still run a bcrypt comparison against a
 * throwaway hash. Returning early would make a miss measurably faster than a
 * wrong password, which is exactly the signal the generic error text on the
 * login form is there to deny.
 */
export async function verifyCredentials(email: string, password: string): Promise<boolean> {
  const acct = await (await accounts()).findOne({ email });
  if (!acct) {
    await bcrypt.compare(password, dummyHash());
    return false;
  }
  return bcrypt.compare(password, acct.passwordHash);
}

let DUMMY_HASH: string | null = null;
function dummyHash(): string {
  // Built on first miss, not at import: hashing at cost 12 takes ~200ms and
  // nothing else in this module should pay that just to read a plan.
  if (!DUMMY_HASH) DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);
  return DUMMY_HASH;
}

export async function touchLastLogin(email: string): Promise<void> {
  await (await accounts()).updateOne(
    { email },
    { $set: { lastLoginAt: new Date().toISOString() } },
  );
}

export async function accountExists(email: string): Promise<boolean> {
  return Boolean(await (await accounts()).findOne({ email }, { projection: { _id: 1 } }));
}

/** Phone for the outbound call. Never exposes the hash. */
export async function accountPhone(email: string): Promise<string | null> {
  const a = await (await accounts()).findOne({ email }, { projection: { _id: 0, phone: 1 } });
  return a?.phone ?? null;
}

/* ------------------------------------------------------------------ *
 * Plan helpers. Both writers — the agenda Save button and the agent — *
 * go through these, which is what keeps one plan per account true.    *
 * ------------------------------------------------------------------ */

export function emptyPlan(email: string): Plan {
  return {
    email,
    objective: null,
    sessions: [],
    people: [],
    partners: [],
    source: {},
    why: {},
    // Private until the owner says otherwise, every time, with no exception.
    visibility: "private",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Plans written before sharing existed have no visibility field. They must
 * read as private — defaulting the other way would publish the movements of
 * everyone who planned before the choice existed.
 */
export function isShared(plan: Pick<Plan, "visibility"> | null | undefined): boolean {
  return plan?.visibility === "shared";
}

export async function setPlanVisibility(
  email: string,
  visibility: PlanVisibility,
): Promise<Plan | null> {
  const col = await plans();
  const r = await col.findOneAndUpdate(
    { email },
    { $set: { visibility, updatedAt: new Date().toISOString() } },
    { returnDocument: "after", projection: { _id: 0 } },
  );
  return r ?? null;
}

export type PlanBucket = "sessions" | "people" | "partners";

/**
 * Which list an id belongs in, or null if it matches no published record.
 * Every id from the model is run through this — an id we cannot resolve is
 * dropped rather than stored, so a hallucinated code never reaches a plan.
 * Invite-only sessions resolve to null too: they are listed in the
 * directory but can never be planned.
 */
export function classifyId(id: string): PlanBucket | null {
  const s = getSession(id);
  if (s) return isBookmarkable(s) ? "sessions" : null;
  if (SPEAKER_KEYS.has(id)) return "people";
  if (PARTNER_SLUGS.has(id)) return "partners";
  return null;
}

const SPEAKER_KEYS = new Set(SPEAKERS.map((sp) => sp.nameKey));
const PARTNER_SLUGS = new Set(PARTNERS.map((p) => p.slug));

/**
 * Apply add/remove ops to a plan in place and return the new plan.
 *
 * Ops rather than a whole-plan replace is the entire reason a manual pick
 * survives an agent edit: the agent only ever names the ids it is changing,
 * so anything it does not mention is left alone.
 */
export function applyOps(
  plan: Plan,
  ops: PlanOps,
  source: PlanSource,
  why: Record<string, string> = {},
): Plan {
  const next: Plan = {
    ...plan,
    sessions: [...plan.sessions],
    people: [...plan.people],
    partners: [...plan.partners],
    source: { ...plan.source },
    why: { ...plan.why },
  };

  for (const id of ops.remove || []) {
    next.sessions = next.sessions.filter((x) => x !== id);
    next.people = next.people.filter((x) => x !== id);
    next.partners = next.partners.filter((x) => x !== id);
    delete next.source[id];
    delete next.why[id];
  }

  for (const id of ops.add || []) {
    const bucket = classifyId(id);
    if (!bucket) continue; // unknown or invite-only — silently dropped
    if (!next[bucket].includes(id)) next[bucket].push(id);
    // First writer keeps authorship: an agent re-suggesting something the
    // attendee picked by hand must not relabel it as the agent's idea.
    if (!next.source[id]) next.source[id] = source;
    if (why[id]) next.why[id] = why[id];
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

export async function getPlan(email: string): Promise<Plan | null> {
  return (await plans()).findOne({ email }, { projection: { _id: 0 } });
}

/** Read-modify-write the one plan doc. Returns the plan after the ops. */
export async function mutatePlan(
  email: string,
  ops: PlanOps,
  source: PlanSource,
  extra?: { why?: Record<string, string>; objective?: string | null },
): Promise<Plan> {
  const col = await plans();
  const existing = await col.findOne({ email }, { projection: { _id: 0 } });
  let next = applyOps(existing ?? emptyPlan(email), ops, source, extra?.why ?? {});
  if (extra && extra.objective !== undefined) next = { ...next, objective: extra.objective };
  await col.replaceOne({ email }, next, { upsert: true });
  return next;
}

/* ------------------------------------------------------------------ *
 * Shared plans. Two independent gates, and BOTH must be open:         *
 * the profile is consentPublic, and the plan is visibility "shared".  *
 * Revoking either one hides the plan everywhere on the next read —    *
 * there is no cache and no copy to go stale.                          *
 * ------------------------------------------------------------------ */

/**
 * Everyone who has opted in twice, keyed by profile slug. Emails never leave
 * this function: the slug is the public handle for a person everywhere else.
 */
export async function listSharedPlans(): Promise<SharedPlanSummary[]> {
  const profileCol = (await db()).collection<{
    email: string;
    slug: string;
    name: string;
    role: string | null;
    org: string | null;
    consentPublic: boolean;
    isDemo?: boolean;
  }>("profiles");

  const consented = await profileCol
    .find({ consentPublic: true }, { projection: { _id: 0 } })
    .toArray();
  if (!consented.length) return [];

  const shared = await (await plans())
    .find(
      { email: { $in: consented.map((p) => p.email) }, visibility: "shared" },
      { projection: { _id: 0 } },
    )
    .toArray();

  const byEmail = new Map(shared.map((p) => [p.email, p]));
  return consented
    .filter((p) => byEmail.has(p.email))
    .map((p) => {
      const plan = byEmail.get(p.email)!;
      return {
        slug: p.slug,
        name: p.name,
        role: p.role ?? null,
        org: p.org ?? null,
        isDemo: Boolean(p.isDemo || plan.isDemo),
        // Invite-only sessions can never be in a plan, but filter on read too:
        // a plan seeded or written before that rule would otherwise leak one.
        sessions: plan.sessions.filter((c) => {
          const s = getSession(c);
          return s && isBookmarkable(s);
        }),
        partners: plan.partners,
        objective: plan.objective,
      };
    });
}

/** Festival hours, taken from the real schedule rather than assumed. */
export function festivalHours(day: string): { start: number; end: number } | null {
  const day_ = SESSIONS.filter((s) => s.day === day);
  if (!day_.length) return null;
  return {
    start: Math.min(...day_.map((s) => toMinutes(s.startTime))),
    end: Math.max(...day_.map((s) => toMinutes(s.endTime))),
  };
}

function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/** A window shorter than this is not a meeting, it is a corridor collision. */
const MIN_WINDOW_MINUTES = 20;

/**
 * Stretches of each day when NOBODY selected has anything booked.
 *
 * Union every selected person's sessions into one busy set, then return the
 * gaps inside published festival hours. If two people are both free but at
 * opposite ends of the venue that is still their problem — we say when, and
 * deliberately never say where, because GFF published no 2026 floor plan.
 */
export function mutualFreeWindows(sessionSets: string[][]): FreeWindow[] {
  const out: FreeWindow[] = [];

  for (const day of DAYS) {
    const hours = festivalHours(day);
    if (!hours) continue;

    const busy: [number, number][] = [];
    for (const set of sessionSets) {
      for (const code of set) {
        const s = getSession(code);
        if (!s || s.day !== day) continue;
        busy.push([toMinutes(s.startTime), toMinutes(s.endTime)]);
      }
    }
    busy.sort((a, b) => a[0] - b[0]);

    // Walk the merged busy intervals; whatever is not covered is free.
    let cursor = hours.start;
    for (const [start, end] of busy) {
      if (start > cursor) {
        const minutes = start - cursor;
        if (minutes >= MIN_WINDOW_MINUTES) {
          out.push({ day, start: hhmm(cursor), end: hhmm(start), minutes });
        }
      }
      cursor = Math.max(cursor, end);
    }
    if (hours.end > cursor && hours.end - cursor >= MIN_WINDOW_MINUTES) {
      out.push({ day, start: hhmm(cursor), end: hhmm(hours.end), minutes: hours.end - cursor });
    }
  }

  return out;
}

/** Topics and exhibitors that show up in more than one of the selected plans. */
export function commonInterests(people: SharedPlanSummary[]): CommonInterest[] {
  const topic = new Map<string, number>();
  const exhibitor = new Map<string, number>();

  for (const p of people) {
    // Count once per person, not once per session, or a topic someone has
    // four sessions of outranks one that three different people share.
    const theirTopics = new Set<string>();
    for (const code of p.sessions) for (const t of getSession(code)?.topics ?? []) theirTopics.add(t);
    for (const t of theirTopics) topic.set(t, (topic.get(t) ?? 0) + 1);
    for (const slug of new Set(p.partners)) exhibitor.set(slug, (exhibitor.get(slug) ?? 0) + 1);
  }

  const out: CommonInterest[] = [];
  for (const [label, count] of topic) if (count > 1) out.push({ label, kind: "topic", count });
  for (const [slug, count] of exhibitor) {
    if (count < 2) continue;
    const p = PARTNERS.find((x) => x.slug === slug);
    if (p) out.push({ label: p.name, kind: "exhibitor", count });
  }
  return out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/* ------------------------- Conversation ---------------------------- */

export async function getConversation(email: string): Promise<Conversation | null> {
  return (await conversations()).findOne({ email }, { projection: { _id: 0 } });
}

/** Append turns to the one conversation doc, creating it on first use. */
export async function appendTurns(
  email: string,
  turns: ConversationTurn[],
): Promise<Conversation> {
  const col = await conversations();
  const now = new Date().toISOString();
  await col.updateOne(
    { email },
    { $push: { turns: { $each: turns } }, $set: { updatedAt: now }, $setOnInsert: { email } },
    { upsert: true },
  );
  return (await col.findOne({ email }, { projection: { _id: 0 } }))!;
}
