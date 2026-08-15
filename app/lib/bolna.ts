/**
 * BOLNA — OUTBOUND VOICE, ONE DIRECTION ONLY.
 *
 * The attendee taps a button and their own phone rings with one day of their own
 * plan read out. That is the entire feature.
 *
 * What this deliberately is NOT:
 *  - There is no inbound agent, no SIP trunk, no purchased number, no webhook
 *    and no publicly reachable URL. Bolna calls out; nothing calls us back.
 *  - The call does not BUILD a plan. The plan is already built by lib/agent.ts
 *    and is injected as text. The voice agent reads, it does not decide — which
 *    is what keeps the grounding guarantees intact across the phone.
 *  - It never dials a number the caller typed. The number comes from the
 *    logged-in account, server-side. This is a personal agent: the only phone it
 *    can ever ring is its own owner's.
 *
 * The plan text is assembled by lib/catalog.ts#planDayText from resolved records
 * only, and invite-only sessions can never be in a plan in the first place — so
 * there is no path by which one reaches the call.
 */
import type { FestDay } from "./types";

const API_URL = "https://api.bolna.ai/call";

export const BOLNA_ENABLED = Boolean(process.env.BOLNA_API_KEY && process.env.BOLNA_AGENT_ID);

export const BOLNA_OFF_MESSAGE =
  "Voice calls are not configured on this server — BOLNA_API_KEY and BOLNA_AGENT_ID are missing. Your plan is on screen and unaffected.";

/**
 * E.164: a leading + and 8–15 digits. Checked before dialling because a
 * malformed number is a silent no-answer at the provider, which reads to the
 * attendee as "the feature is broken" rather than "my number is wrong".
 */
export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

/**
 * Dynamic variables filling {placeholders} in the agent prompt configured in the
 * Bolna dashboard. Flat strings — the documented shape is a flat key/value
 * object, so nothing here nests.
 *
 * TWO GROUPS, ON PURPOSE.
 *
 * Group A is what the CURRENTLY CONFIGURED agent (the one named in
 * BOLNA_AGENT_ID) actually references. Verified by reading its prompt over the API
 * rather than assumed: it is a scripted event-reminder agent whose only
 * placeholders are {name}, {event_name}, {event_date}, {event_time}, {venue}.
 * Leaving them unset makes a caller hear the literal text "{name}", so they are
 * filled with grounded values.
 *
 * Group B is the plan itself. That agent's prompt does NOT reference these yet,
 * and its own anti-fabrication rule confines it to its scripted FAQ — so today
 * these are carried but not spoken. They are sent anyway so that the moment the
 * dashboard prompt gains {plan_text} the feature is live with no code change.
 *
 * See the report accompanying this work: the prompt edit is a dashboard action.
 */
export type CallVariables = {
  // --- Group A: referenced by the current agent prompt ---
  name: string;
  event_name: string;
  event_date: string;
  event_time: string;
  venue: string;
  // --- Group B: the plan, ready for a prompt that reads it out ---
  day_label: string;
  session_count: string;
  objective: string;
  plan_text: string;
  /** Restates the rules that must survive into the spoken channel. */
  ground_rules: string;
};

/** Published and constant. Not derived from a record, so it cannot go stale. */
export const EVENT_NAME = "Global Fintech Fest 2026";
export const VENUE = "Jio World Centre and Trident BKC, Mumbai";

export const GROUND_RULES =
  "Read only the plan given to you. Never invent a session, speaker or exhibitor. " +
  "GFF has published no floor plan for 2026, so never state or guess where an exhibitor's stand is — " +
  "a session hall belongs to that session and says nothing about an exhibitor's location. " +
  "Never say a session is happening now or starting soon; you do not know the current time. " +
  "Refer to this as their plan for that day. If asked something not in the plan, say you don't have it.";

export type PlacedCall = { executionId: string; status: string };

/**
 * Place the call. Only documented parameters are sent — agent_id,
 * recipient_phone_number and user_data. Nothing is invented beyond the
 * published API surface.
 *
 * Throws with a message safe to show the attendee.
 */
export async function placeCall(input: {
  phone: string;
  variables: CallVariables;
}): Promise<PlacedCall> {
  const apiKey = process.env.BOLNA_API_KEY;
  const agentId = process.env.BOLNA_AGENT_ID;
  if (!apiKey || !agentId) throw new Error(BOLNA_OFF_MESSAGE);
  if (!isE164(input.phone)) {
    throw new Error(
      "The phone number on your account isn't in international format (e.g. +919876543210), so I haven't dialled it.",
    );
  }

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: agentId,
        recipient_phone_number: input.phone,
        user_data: input.variables,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    console.error("[bolna] request failed:", err);
    throw new Error("Couldn't reach the calling service. Nothing was dialled — try again.");
  }

  const body = await res.text();
  if (!res.ok) {
    // The provider's body may carry a key or account detail; log it, don't echo it.
    console.error(`[bolna] ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
    throw new Error(
      res.status === 401 || res.status === 403
        ? "The calling service rejected our credentials. Nothing was dialled."
        : `The calling service refused the call (HTTP ${res.status}). Nothing was dialled.`,
    );
  }

  /**
   * The docs show `call_id` in one place and a generic status object in another,
   * so several key names are accepted rather than assuming one. An id we cannot
   * find is recorded as "unknown" instead of being fabricated — the call really
   * was placed, and pretending we have a handle on it would be the worse lie.
   */
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    console.warn("[bolna] non-JSON success body:", body.slice(0, 200));
  }

  const executionId =
    firstString(parsed, ["call_id", "execution_id", "id", "callId", "executionId"]) ?? "unknown";
  const status = firstString(parsed, ["status", "state"]) ?? "initiated";

  return { executionId, status };
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export const DAY_NUMBER: Record<FestDay, string> = {
  "2026-09-09": "Day 1",
  "2026-09-10": "Day 2",
  "2026-09-11": "Day 3",
};
