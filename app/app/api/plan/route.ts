import { NextResponse } from "next/server";
import { ATLAS_OFF_MESSAGE, PROFILES_ENABLED, getPlan, mutatePlan } from "../../../lib/db";
import { currentEmail } from "../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_SESSION = "Sign in to build a plan.";

/** GET /api/plan — the caller's one plan, or null if they have never saved. */
export async function GET() {
  if (!PROFILES_ENABLED) {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: NO_SESSION }, { status: 401 });

  try {
    return NextResponse.json({ plan: await getPlan(email) });
  } catch {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }
}

/**
 * POST /api/plan — the manual Save button.
 *
 * Ops, not a replacement plan: the agent writes the same document, and a
 * whole-plan PUT from either side would silently delete the other's work.
 * Ids that match no published record are dropped inside applyOps, so a bad
 * request can add noise but never a phantom session.
 */
export async function POST(req: Request) {
  if (!PROFILES_ENABLED) {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: NO_SESSION }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { add?: unknown; remove?: unknown };
  const add = ids(body.add);
  const remove = ids(body.remove);

  if (!add.length && !remove.length) {
    return NextResponse.json({ error: "Nothing to add or remove." }, { status: 400 });
  }

  try {
    return NextResponse.json({ plan: await mutatePlan(email, { add, remove }, "manual") });
  } catch {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }
}

/** Accept only a bounded list of plausible id strings. */
function ids(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.length <= 120)
    .slice(0, 100);
}
