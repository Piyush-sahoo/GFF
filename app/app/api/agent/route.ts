/**
 * POST /api/agent  { message } -> { reply, ops, plan }
 * GET  /api/agent             -> { turns, plan, enabled, degraded }
 *
 * One turn of the planning conversation. The turn is persisted and the plan is
 * mutated through lib/db.ts helpers only — the agent has no direct Atlas access
 * and no way to replace a plan wholesale.
 *
 * The GET exists so a returning attendee's conversation and plan are on screen
 * before they type anything. Memory the user cannot see is not memory.
 */
import { NextResponse } from "next/server";
import { runAgent, AGENT_ENABLED } from "../../../lib/agent";
import { catalogStats, resolveItems, viewPlan } from "../../../lib/catalog";
import {
  ATLAS_OFF_MESSAGE,
  PROFILES_ENABLED,
  appendTurns,
  getConversation,
  getPlan,
  mutatePlan,
} from "../../../lib/db";
import { currentEmail, clientKey, rateLimit } from "../../../lib/session";
import type { ConversationTurn } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UNAUTHENTICATED = "Sign in to plan — your plan and conversation are saved to your account.";

export async function GET() {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: UNAUTHENTICATED }, { status: 401 });
  if (!PROFILES_ENABLED) return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });

  const [conversation, plan] = await Promise.all([getConversation(email), getPlan(email)]);
  return NextResponse.json({
    turns: conversation?.turns ?? [],
    plan,
    planView: viewPlan(plan),
    enabled: AGENT_ENABLED,
    catalog: catalogStats(),
  });
}

export async function POST(req: Request) {
  const email = await currentEmail();
  if (!email) return NextResponse.json({ error: UNAUTHENTICATED }, { status: 401 });

  if (!PROFILES_ENABLED) {
    return NextResponse.json({ error: ATLAS_OFF_MESSAGE }, { status: 503 });
  }

  // A model call per message is the expensive path in this app; bound it.
  if (!rateLimit(`agent:${email}:${clientKey(req)}`, 30, 60_000)) {
    return NextResponse.json(
      { error: "That's a lot of messages very quickly. Give it a minute." },
      { status: 429 },
    );
  }

  let message = "";
  try {
    const body = await req.json();
    message = String(body?.message ?? "").slice(0, 2000).trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Tell me what you're trying to get out of GFF." }, { status: 400 });
  }

  const [conversation, plan] = await Promise.all([getConversation(email), getPlan(email)]);

  let outcome;
  try {
    outcome = await runAgent({ message, history: conversation?.turns ?? [], plan });
  } catch (err) {
    const kind = err instanceof Error ? err.message : "";
    console.error("[api/agent] agent turn failed:", err);
    return NextResponse.json(
      {
        error:
          kind === "MODEL_TRUNCATED"
            ? "That was too much to plan in one go — the agent ran out of room mid-answer. Nothing was changed in your plan. Try asking for one day, or a smaller batch, at a time."
            : kind === "MODEL_BAD_OUTPUT"
              ? "The agent returned something I couldn't read. Nothing was changed in your plan — try again."
              : "The agent couldn't reach the model. Nothing was changed in your plan — try again.",
      },
      { status: 502 },
    );
  }

  /**
   * Write order matters. The plan is mutated first so that if persisting the
   * transcript fails, the attendee still has the plan they can see on screen —
   * the reverse would leave a conversation claiming a change that never landed.
   *
   * Ops are already validated; mutatePlan re-checks each id independently and
   * preserves `source` authorship, so an item the attendee added by hand stays
   * theirs even if the agent names it again.
   */
  const nextPlan = await mutatePlan(email, outcome.ops, "agent", {
    why: outcome.why,
    objective: outcome.objective,
  });

  const now = new Date().toISOString();
  const turns: ConversationTurn[] = [
    { role: "user", text: message, at: now },
    { role: "agent", text: outcome.reply, at: now, ops: outcome.ops },
  ];
  try {
    await appendTurns(email, turns);
  } catch (err) {
    // The plan landed; losing the transcript costs memory, not correctness.
    console.error("[api/agent] failed to persist conversation turns:", err);
  }

  return NextResponse.json({
    reply: outcome.reply,
    ops: outcome.ops,
    plan: nextPlan,
    planView: viewPlan(nextPlan),
    // Resolved from the static dataset by id — never echoed from model output.
    added: resolveItems(outcome.ops.add).map((i) => ({ ...i, why: outcome.why[i.id] ?? "" })),
    removed: resolveItems(outcome.ops.remove),
    degraded: outcome.degraded,
    droppedCount: outcome.dropped.length,
    // Real sessions withheld to avoid a double-booking. Surfaced, not swallowed:
    // the attendee asked for these and is owed an explanation.
    clashes: outcome.clashes,
    // Records the reply discussed without touching the plan. Resolved from the
    // static dataset by id, like everything else the attendee is shown.
    references: resolveItems(outcome.refs),
  });
}
