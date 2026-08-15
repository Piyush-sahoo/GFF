import { NextResponse } from "next/server";
import { ATLAS_OFF_MESSAGE, PROFILES_ENABLED, setPlanVisibility } from "../../../../lib/db";
import { currentEmail } from "../../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/plan/visibility { visibility: "private" | "shared" } -> 200 { plan }
 *
 * Deliberately its own route rather than a field on POST /api/plan: that
 * endpoint takes add/remove ops and the agent writes through it, and a
 * visibility key riding along there would eventually be set by something
 * that only meant to add a session.
 */
export async function POST(req: Request) {
  if (!PROFILES_ENABLED) {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: "Sign in to change this." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { visibility?: unknown };
  if (body.visibility !== "private" && body.visibility !== "shared") {
    return NextResponse.json({ error: "visibility must be 'private' or 'shared'." }, { status: 400 });
  }

  try {
    const plan = await setPlanVisibility(email, body.visibility);
    if (!plan) {
      return NextResponse.json(
        { error: "You have nothing in your plan yet — save a session first." },
        { status: 404 },
      );
    }
    return NextResponse.json({ plan });
  } catch {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }
}
