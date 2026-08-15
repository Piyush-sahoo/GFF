/**
 * POST /api/call  { day } -> { executionId } | 400 | 401 | 503
 *
 * Rings the logged-in attendee's OWN registered number and reads out ONE day of
 * their plan. The number is read from their account server-side and is never
 * accepted from the request body — this agent has no way to dial anyone else.
 */
import { NextResponse } from "next/server";
import {
  BOLNA_ENABLED,
  BOLNA_OFF_MESSAGE,
  DAY_NUMBER,
  EVENT_NAME,
  GROUND_RULES,
  VENUE,
  placeCall,
} from "../../../lib/bolna";
import { planDayText } from "../../../lib/catalog";
import { dayLabel } from "../../../lib/content";
import { ATLAS_OFF_MESSAGE, PROFILES_ENABLED, accounts, calls, getPlan } from "../../../lib/db";
import { getByEmail } from "../../../lib/profiles";
import { clientKey, currentEmail, rateLimit } from "../../../lib/session";
import { isFestDay } from "../../../lib/types";
import type { CallRecord } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const email = await currentEmail();
  if (!email) {
    return NextResponse.json({ error: "Sign in first — I can only call your own registered number." }, { status: 401 });
  }
  if (!PROFILES_ENABLED) return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  if (!BOLNA_ENABLED) return NextResponse.json({ error: BOLNA_OFF_MESSAGE }, { status: 503 });

  // Placing a phone call is the one action here with a real-world cost.
  if (!rateLimit(`call:${email}:${clientKey(req)}`, 3, 5 * 60_000)) {
    return NextResponse.json(
      { error: "That's three calls in five minutes. Give it a moment before requesting another." },
      { status: 429 },
    );
  }

  let day: unknown;
  try {
    day = (await req.json())?.day;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isFestDay(day)) {
    return NextResponse.json({ error: "Pick one of the three festival days." }, { status: 400 });
  }

  const account = await (await accounts()).findOne({ email }, { projection: { phone: 1 } });
  const phone = account?.phone?.trim();
  if (!phone) {
    return NextResponse.json(
      { error: "There's no phone number on your account, so there's nothing to call." },
      { status: 400 },
    );
  }

  const plan = await getPlan(email);
  /**
   * A day with no sessions is not worth a phone call, even when the plan has
   * exhibitors on it — the exhibitor list is plan-wide, not tied to a day, so
   * the call would ring to say "nothing scheduled, but here are some companies".
   * Requiring a session that day is what makes the call worth answering.
   */
  const { text, sessionCount, firstStart } = planDayText(plan, day);
  if (sessionCount === 0) {
    return NextResponse.json(
      {
        error: `Your plan has nothing on ${dayLabel(day)} yet. Build it with the agent first — I won't call you to read out an empty schedule.`,
      },
      { status: 400 },
    );
  }

  const profile = await getByEmail(email).catch(() => null);

  let placed;
  try {
    placed = await placeCall({
      phone,
      variables: {
        // Referenced by the configured agent's prompt today.
        // Falls back to the empty string, never to "there" or "friend" — the
        // voice agent handles an absent name better than we can guess one.
        name: profile?.name?.trim() || "",
        event_name: EVENT_NAME,
        event_date: dayLabel(day),
        // The attendee's own first session that day. Real, and the only "time"
        // for this day we can state without inventing a schedule GFF never published.
        event_time: firstStart ?? "",
        venue: VENUE,
        // Carried for a prompt that reads the plan out. See lib/bolna.ts.
        day_label: DAY_NUMBER[day],
        session_count: String(sessionCount),
        objective: plan?.objective ?? "",
        plan_text: text,
        ground_rules: GROUND_RULES,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The call could not be placed.";
    console.error("[api/call] placing call failed:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const record: CallRecord = {
    email,
    day,
    bolnaAgentId: process.env.BOLNA_AGENT_ID!,
    executionId: placed.executionId,
    status: placed.status,
    requestedAt: new Date().toISOString(),
    phoneAtDial: phone,
  };
  try {
    await (await calls()).insertOne(record);
  } catch (err) {
    // The phone is already ringing; losing the audit row must not fail the request.
    console.error("[api/call] failed to record call:", err);
  }

  return NextResponse.json({ executionId: placed.executionId, status: placed.status, day });
}
