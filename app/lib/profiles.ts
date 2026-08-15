import type { Collection } from "mongodb";
import { db } from "./db";

/**
 * USER-GENERATED WRITES ONLY.
 *
 * Mongo is deliberately confined to data users create: profiles, accounts,
 * plans, conversations and calls. Partners, speakers and sessions stay static
 * from vendored JSON at build time — that was chosen so venue wifi or an Atlas
 * outage cannot take the directory or agenda down, and it still holds. Nothing
 * in the read path for GFF content should ever import this file.
 *
 * The connection itself now lives in lib/db.ts, which owns every collection.
 */
export { PROFILES_ENABLED } from "./db";

export type Profile = {
  /** Login identity. Not verified — no email is ever sent. */
  email: string;
  slug: string;
  name: string;
  org: string | null;
  role: string | null;
  /** Self-declared links. We never check that these belong to the person. */
  linkedin: string | null;
  x: string | null;
  interests: string[];
  /** Plain-language business objective, drives recommendations. */
  lookingFor: string | null;
  /** Explicit opt-in. false => invisible to everyone else, everywhere. */
  consentPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function profiles(): Promise<Collection<Profile>> {
  const c = (await db()).collection<Profile>("profiles");
  await c.createIndex({ email: 1 }, { unique: true }).catch(() => {});
  await c.createIndex({ slug: 1 }, { unique: true }).catch(() => {});
  return c;
}

export function slugify(name: string, email: string): string {
  const base = (name || email.split("@")[0] || "attendee")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  // Short suffix from the email keeps slugs unique without exposing the address.
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return `${base || "attendee"}-${h.toString(36).slice(0, 4)}`;
}

export async function getByEmail(email: string): Promise<Profile | null> {
  return (await profiles()).findOne({ email }, { projection: { _id: 0 } });
}

/** Public lookup. Only ever returns consented profiles. */
export async function getPublicBySlug(slug: string): Promise<Profile | null> {
  return (await profiles()).findOne(
    { slug, consentPublic: true },
    { projection: { _id: 0, email: 0 } },
  );
}

/**
 * The people directory. Filtering on consentPublic here is what makes
 * withdrawing consent remove someone from OTHERS' views and recommendations —
 * not merely hide their own page.
 */
export async function listPublic(limit = 200): Promise<Omit<Profile, "email">[]> {
  return (await profiles())
    .find({ consentPublic: true }, { projection: { _id: 0, email: 0 } })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();
}

export async function upsert(email: string, patch: Partial<Profile>): Promise<Profile> {
  const col = await profiles();
  const now = new Date().toISOString();
  const existing = await col.findOne({ email });
  const name = (patch.name ?? existing?.name ?? "").trim();

  const doc: Profile = {
    email,
    slug: existing?.slug ?? slugify(name, email),
    name,
    org: patch.org ?? existing?.org ?? null,
    role: patch.role ?? existing?.role ?? null,
    linkedin: patch.linkedin ?? existing?.linkedin ?? null,
    x: patch.x ?? existing?.x ?? null,
    interests: patch.interests ?? existing?.interests ?? [],
    lookingFor: patch.lookingFor ?? existing?.lookingFor ?? null,
    consentPublic: patch.consentPublic ?? existing?.consentPublic ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await col.replaceOne({ email }, doc, { upsert: true });
  return doc;
}

/** One-click delete. Removes the record entirely, not just its visibility. */
export async function remove(email: string): Promise<boolean> {
  const r = await (await profiles()).deleteOne({ email });
  return r.deletedCount > 0;
}
