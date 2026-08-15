import { NextResponse } from "next/server";
import {
  ATLAS_OFF_MESSAGE,
  PROFILES_ENABLED,
  commonInterests,
  listSharedPlans,
  mutualFreeWindows,
} from "../../../lib/db";
import type { MeetResponse } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PEOPLE = 2;
const MAX_PEOPLE = 4;

/**
 * GET /api/meet?slugs=a,b,c -> 200 MeetResponse
 *
 * Reads only plans that passed both gates in listSharedPlans, so a private
 * plan is unreachable here even with the exact slug. No session is invented:
 * a shared session is one every selected person already had, and a free
 * window is the absence of anything booked. When there is neither, the
 * response says so and the page says so.
 */
export async function GET(req: Request) {
  if (!PROFILES_ENABLED) {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }

  const raw = new URL(req.url).searchParams.get("slugs") ?? "";
  const wanted = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_PEOPLE),
    ),
  );

  if (wanted.length < MIN_PEOPLE) {
    return NextResponse.json(
      { error: `Pick at least ${MIN_PEOPLE} people to find a meeting point.` },
      { status: 400 },
    );
  }

  let shared;
  try {
    shared = await listSharedPlans();
  } catch {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }

  const bySlug = new Map(shared.map((p) => [p.slug, p]));
  const people = wanted.map((s) => bySlug.get(s)).filter((p) => p !== undefined);
  const unavailable = wanted.filter((s) => !bySlug.has(s));

  if (people.length < MIN_PEOPLE) {
    return NextResponse.json(
      {
        error:
          "Not enough of those people have shared a plan. A plan is only readable when its owner has opted in to sharing it.",
        unavailable,
      },
      { status: 404 },
    );
  }

  // A shared session is one that appears in EVERY selected plan — an
  // intersection, not a popularity count. Two out of four is not "you are
  // all going anyway", so it belongs under common interests instead.
  const sharedSessions = people[0].sessions.filter((code) =>
    people.every((p) => p.sessions.includes(code)),
  );

  const body: MeetResponse = {
    people,
    sharedSessions,
    freeWindows: mutualFreeWindows(people.map((p) => p.sessions)),
    commonInterests: commonInterests(people),
    unavailable,
  };
  return NextResponse.json(body);
}
