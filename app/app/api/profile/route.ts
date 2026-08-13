import { NextResponse } from "next/server";
import { currentEmail } from "../../../lib/session";
import { getByEmail, remove, upsert, PROFILES_ENABLED } from "../../../lib/profiles";
import { match, reason } from "../../../lib/match";
import { speakerSlug } from "../../../lib/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json(
    { error: "Profiles are unavailable — the profile store is not configured on this server." },
    { status: 503 },
  );
}

export async function GET() {
  if (!PROFILES_ENABLED) return unavailable();
  const email = await currentEmail();
  if (!email) return NextResponse.json({ profile: null, email: null });
  try {
    const profile = await getByEmail(email);
    let recs = null;
    if (profile) {
      const objective = [profile.lookingFor, ...(profile.interests || [])].filter(Boolean).join(" ");
      if (objective.trim()) {
        const r = match(objective, 5);
        recs = {
          terms: r.terms,
          coverage: r.coverage,
          sessions: r.sessions.map((x) => ({
            agendaCode: x.session.agendaCode, title: x.session.title, day: x.session.day,
            startTime: x.session.startTime, endTime: x.session.endTime, hall: x.session.hall,
            format: x.session.format, track: x.session.track, why: reason(x.why),
          })),
          speakers: r.speakers.map((x) => ({
            slug: speakerSlug(x.speaker), name: x.speaker.name, title: x.speaker.title,
            org: x.speaker.org, headshotUrl: x.speaker.headshotUrl, why: reason(x.why),
          })),
          partners: r.partners.map((x) => ({
            slug: x.partner.slug, name: x.partner.name, tier: x.partner.tier,
            category: x.partner.category, website: x.partner.website, logoUrl: x.partner.logoUrl,
            hasDescription: Boolean(x.partner.whatTheyDo?.trim()), why: reason(x.why),
          })),
        };
      }
    }
    return NextResponse.json({ profile, email, recs });
  } catch (e) {
    console.error("[profile] read failed:", e);
    return NextResponse.json({ error: "Could not reach the profile store." }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  if (!PROFILES_ENABLED) return unavailable();
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Your name is required." }, { status: 400 });

  const interests = Array.isArray(body.interests)
    ? body.interests.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 12)
    : String(body.interests || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12);

  try {
    const profile = await upsert(email, {
      name: name.slice(0, 80),
      org: (body.org ? String(body.org).slice(0, 80) : null) || null,
      role: (body.role ? String(body.role).slice(0, 80) : null) || null,
      linkedin: (body.linkedin ? String(body.linkedin).slice(0, 200) : null) || null,
      x: (body.x ? String(body.x).slice(0, 80) : null) || null,
      interests,
      lookingFor: (body.lookingFor ? String(body.lookingFor).slice(0, 400) : null) || null,
      consentPublic: Boolean(body.consentPublic),
    });
    return NextResponse.json({ profile });
  } catch (e) {
    console.error("[profile] write failed:", e);
    return NextResponse.json({ error: "Could not save — the profile store is unreachable." }, { status: 502 });
  }
}

export async function DELETE() {
  if (!PROFILES_ENABLED) return unavailable();
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await remove(email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[profile] delete failed:", e);
    return NextResponse.json({ error: "Could not delete — the profile store is unreachable." }, { status: 502 });
  }
}
