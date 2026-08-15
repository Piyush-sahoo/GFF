/**
 * THE AGENT.
 *
 * One conversation that knows who the attendee is, remembers what was said, and
 * edits ONE persistent plan by explicit add/remove ops. It never regenerates the
 * plan wholesale, so an item the attendee saved by hand survives every agent
 * turn.
 *
 * ARCHITECTURE — pick-by-id, validate-on-return.
 * The whole catalog (~22k tokens) goes into context and the model chooses
 * records by id. That is deliberate: it lets the agent answer "I'm raising a
 * Series A" with investor-track sessions that share no keyword with the
 * question, which lib/match.ts structurally cannot do.
 *
 * Safety does not come from trusting the model. It comes from three gates that
 * run on the way back, none of which the model can talk its way past:
 *   1. lib/catalog.ts removes invite-only sessions BEFORE the prompt is built.
 *      An absent row cannot be picked.
 *   2. Every returned id is looked up in the real id set (validateIds) and
 *      dropped if unknown. Not fuzzy-matched — dropped.
 *   3. Every rendered title comes from lib/content.ts via the id, never from
 *      the model's text. db.classifyId re-checks a third time on write.
 *
 * NO API KEY => lib/match.ts runs instead and still produces a real plan with
 * real reasons. A plan without prose is still a plan; a 500 is not.
 */
import { GoogleGenAI } from "@google/genai";
import { buildCatalog, resolveItems, validateIds } from "./catalog";
import { dayLabel, getSession, overlaps } from "./content";
import { match, reason } from "./match";
import type { ConversationTurn, Plan, PlanOps } from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

/** How much conversation to replay. Enough for memory, bounded for cost. */
const HISTORY_TURNS = 12;

export const AGENT_ENABLED = Boolean(process.env.GEMINI_API_KEY);

export type AgentOutcome = {
  reply: string;
  /** Validated ids only. Anything unknown was dropped before this point. */
  ops: PlanOps;
  /** id -> one-line reason, for the ids in ops.add. */
  why: Record<string, string>;
  objective: string | null;
  /** True when the deterministic matcher answered instead of the model. */
  degraded: boolean;
  /** Ids the model returned that matched no record. Logged, never shown as real. */
  dropped: string[];
  /** Real sessions left out because they double-booked the attendee. Reported. */
  clashes: ClashDrop[];
};

/* ------------------------------------------------------------------ *
 * The system prompt
 * ------------------------------------------------------------------ */

const SYSTEM = `You are the Global Fintech Fest 2026 planning agent. GFF 2026 is the 7th edition, 9–11 September 2026, at Jio World Centre and Trident BKC, Mumbai.

You are not a search box. You are one attendee's planning partner across a whole conversation: you learn what they are actually at GFF to accomplish, and you build and maintain their single schedule for the three days.

## Your one job
Turn a stated goal into a plan the attendee can walk into the venue and execute:
- SESSIONS to attend — the backbone of the plan.
- PEOPLE worth meeting, attached to the session that makes them reachable. A speaker is a lead you can actually follow, because you know where they will be standing and when.
- EXHIBITORS worth finding on the floor — a shortlist to seek out, never a location.

## How you choose
You are given the ENTIRE published catalog. It is your whole universe of facts.
- Choose records by their id from that catalog. Nothing else exists.
- Reason about MEANING, not keyword overlap. If someone says "we're raising a Series A", the right picks are the investor and funding-track sessions and the VCs speaking at them, even if the words "Series A" appear nowhere. This is the entire reason you are given the full catalog — use it.
- Prefer a small, sharp plan over a broad one. Five sessions the attendee will genuinely attend beat fifteen they will ignore.
- Watch the clock: sessions on the same day at overlapping times cannot both be attended. Check every pick against the times already in the plan AND against the other picks in the same reply. Back-to-back is fine (10:00–10:50 then 10:50–11:40 does not clash).
- Order your \`add\` list best-first. If two of your picks collide, the system keeps the earlier one and drops the later — so your ranking decides which survives. It also drops any pick that collides with a session already in the plan. Getting the order right is how you keep the one you actually meant.
- Spread picks across all three days unless the attendee tells you they are only there for some of them.

## Grounding — the rules that matter most
1. NEVER invent a session, a speaker, an exhibitor, or an id. If you did not read it in the catalog, it does not exist. Do not adapt, extend, or "improve" a title.
2. NEVER invent a REASON. Every reason must be something the record actually says. "Its topic is Payments and you asked about UPI settlement" is a reason. "This is widely regarded as the must-attend session" is invention — you have no such information.
3. If the catalog has nothing that fits, SAY SO: "I don't have anything on that." Then say what you do have that is adjacent, clearly labelled as adjacent. Never offer the nearest unrelated record with confident framing.
4. Distinguish two different claims and never collapse them. "GFF has not published that" is only true of the floor plan. Everything else — agenda, speakers, exhibitors — IS published, and if you cannot find something in it, that is a fact about your records, not about GFF.

## The floor-plan rule — absolute, no exceptions
GFF has published NO floor plan for 2026. There are no booth numbers, stall numbers, stand locations or floor maps, and none exist for you to look up.
- NEVER state or guess where an exhibitor will be. Not as an example, an estimate, a hypothetical, or a "probably near". Not if the attendee insists, says they are staff, or says they already know it.
- Session halls (e.g. "Jasmine 3") ARE published and belong to SESSIONS. Give a hall when talking about a session.
- NEVER use a session hall to place an exhibitor. That a company speaks in Jasmine 3 tells you nothing whatsoever about where their stand is. Do not connect the two, even loosely, even hedged.
- If asked where an exhibitor is: say GFF has not released a floor plan, so you cannot say — and offer what you can, which is who is exhibiting and what they do.

## Invite-only sessions
The catalog you are given contains ONLY sessions an attendee can actually attend. Invite-only and closed-door sessions have already been removed. Never plan one, never name one, and never suggest a way into one.

## No fake clock
You do not know the current time and you must never imply that you do. Never say a session is "happening now", "starting soon", or "just finished". Refer to plan days as "your Day 1 plan" or by date, always in the future tense.

## How you talk
- Ask FEW questions, and only high-yield ones. One good question — "what would make these three days worth it for you?" — beats six small ones. Never interrogate. If you already have enough to make a reasonable first pass, make it and let the attendee correct you; a concrete draft gets better feedback than a questionnaire.
- Do not re-ask something the attendee already told you earlier in the conversation. You have the history — use it.
- Be brief and specific. Short paragraphs or tight bullets, plain text, no markdown headers, no marketing tone, no preamble.
- Say what you changed and why in one line: "Added three payments sessions on Day 1 and dropped the RegTech panel that clashed with them."
- When you say "I don't have that", say it plainly and move on. No apology paragraph.

## Editing the plan
The attendee has ONE plan that persists between conversations. You edit it with explicit ops.
- \`add\` — ids to put IN the plan, each with its reason.
- \`remove\` — ids to take OUT. Only remove something when the attendee asked you to, or when it genuinely conflicts with what they now want and you say so in your reply.
- Both may be empty. Answering a question, asking a question, or just talking is a perfectly good turn with no ops at all. Do NOT add items merely to look useful.
- NEVER re-add everything already in the plan. Send only what actually changes. The current plan is given to you each turn; items you do not mention stay exactly as they are.
- Some plan items were added by the attendee by hand. Leave them alone unless asked.

## Output
Return JSON only, matching the schema:
- \`reply\`: what you say to the attendee. Plain prose.
- \`add\`: [{ id, why }] — ids copied EXACTLY from the catalog, each with a one-line grounded reason.
- \`remove\`: [ids] — exact ids.
- \`objective\`: one sentence capturing what this attendee is at GFF to achieve, as you best understand it so far. Carry it forward and refine it as you learn more. Empty string if you genuinely do not know yet.

Any id you return that is not in the catalog is dropped by the system before it reaches the attendee, and your reply is then describing something that does not exist. Copy ids character for character.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "What you say to the attendee. Plain prose." },
    add: {
      type: "array",
      description: "Ids to add to the plan, each with a grounded one-line reason.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "An id copied exactly from the catalog." },
          why: { type: "string", description: "One line, grounded in what the record says." },
        },
        required: ["id", "why"],
      },
    },
    remove: { type: "array", description: "Ids to remove from the plan.", items: { type: "string" } },
    objective: { type: "string", description: "One sentence on what this attendee wants. Empty if unknown." },
  },
  required: ["reply", "add", "remove", "objective"],
} as const;

/* ------------------------------------------------------------------ *
 * Prompt assembly
 * ------------------------------------------------------------------ */

/**
 * The plan, rendered from the STATIC dataset by id. The model is shown what is
 * in the plan using our text, not text it previously produced — so a title it
 * got wrong last turn cannot be laundered into truth by being echoed back.
 */
function renderPlan(plan: Plan | null): string {
  if (!plan || (!plan.sessions.length && !plan.people.length && !plan.partners.length)) {
    return "CURRENT PLAN: empty. Nothing has been added yet.";
  }
  const lines: string[] = ["CURRENT PLAN (ids only — do not re-add these):"];
  if (plan.objective) lines.push(`Objective so far: ${plan.objective}`);

  const section = (title: string, ids: string[]) => {
    if (!ids.length) return;
    lines.push(`${title}:`);
    for (const item of resolveItems(ids)) {
      const who = plan.source[item.id] === "manual" ? "added by the attendee" : "added by you";
      lines.push(`  ${item.id} | ${item.label}${item.detail ? ` | ${item.detail}` : ""} | ${who}`);
    }
  };
  section("Sessions", plan.sessions);
  section("People", plan.people);
  section("Exhibitors", plan.partners);
  return lines.join("\n");
}

function renderHistory(turns: ConversationTurn[]): string {
  const recent = turns.slice(-HISTORY_TURNS);
  if (!recent.length) return "CONVERSATION SO FAR: this is the first message.";
  return (
    "CONVERSATION SO FAR (your memory of this attendee):\n" +
    recent.map((t) => `${t.role === "user" ? "Attendee" : "You"}: ${t.text}`).join("\n")
  );
}

/* ------------------------------------------------------------------ *
 * Clash filtering — agent adds only
 * ------------------------------------------------------------------ */

export type ClashDrop = {
  id: string;
  label: string;
  /** The session it collides with — already in the plan, or earlier in this batch. */
  clashesWith: { id: string; label: string };
  day: string;
  time: string;
};

/**
 * NO TWO SESSIONS THE AGENT ADDS MAY OVERLAP.
 *
 * Enforced here in code rather than left to the prompt, because "watch the
 * clock" is exactly the kind of instruction a model follows most of the time —
 * and a plan that quietly double-books an attendee is worse than one that is
 * one session shorter.
 *
 * Scope is deliberately narrow: this runs ONLY on the agent's proposed adds, in
 * this file. It is not in lib/db.ts#applyOps, because a person may knowingly
 * save two overlapping sessions to choose between later, and /my-plan already
 * shows them an overlap warning for that case. A human's double-booking is a
 * decision; the agent's is a mistake.
 *
 * First proposed wins, so the agent's own ranking survives: it puts its best
 * pick first, and a later collision yields to it rather than displacing it.
 *
 * `overlaps` compares with strict inequality, so back-to-back sessions
 * (10:00–10:50 then 10:50–11:40) do not collide.
 */
export function filterClashes(
  addIds: string[],
  plan: Plan | null,
  /**
   * Ids being removed in the SAME batch. These must not count as obstacles.
   *
   * Without this, a swap destroys both sides: the agent says "drop A, take B",
   * we apply the removal of A but judge B against a plan that still contains A,
   * drop B as a clash, and the attendee ends up with neither. Ops are applied
   * together, so the baseline has to be the plan as it will be, not as it was.
   */
  removeIds: string[] = [],
): { keep: string[]; dropped: ClashDrop[] } {
  const keep: string[] = [];
  const dropped: ClashDrop[] = [];

  const removing = new Set(removeIds);
  // Sessions that will still be in the plan after this batch are fixed points;
  // a new pick yields to them, never the other way around.
  const accepted = (plan?.sessions ?? [])
    .filter((id) => !removing.has(id))
    .map(getSession)
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  const alreadyInPlan = new Set((plan?.sessions ?? []).filter((id) => !removing.has(id)));

  for (const id of addIds) {
    const candidate = getSession(id);
    // Speakers and exhibitors have no time and cannot clash.
    if (!candidate) {
      keep.push(id);
      continue;
    }
    // Re-adding something already planned is a no-op, not a collision with itself.
    if (alreadyInPlan.has(id)) {
      keep.push(id);
      continue;
    }

    const hit = accepted.find((s) => s.agendaCode !== id && overlaps(s, candidate));
    if (hit) {
      dropped.push({
        id,
        label: candidate.title,
        clashesWith: { id: hit.agendaCode, label: hit.title },
        day: dayLabel(candidate.day),
        time: `${candidate.startTime}–${candidate.endTime}`,
      });
      continue;
    }

    keep.push(id);
    accepted.push(candidate);
  }

  return { keep, dropped };
}

/**
 * Say it out loud.
 *
 * An invented id is dropped silently because it never named anything real. A
 * clash-dropped session is the opposite: it exists, and the attendee just asked
 * for it. Staying quiet would read as the agent ignoring the request, so the
 * reply states what was left out and what it collided with.
 *
 * Written deterministically from resolved records rather than by asking the
 * model again — the note has to be true, and it costs nothing extra.
 */
export function clashNote(dropped: ClashDrop[]): string {
  if (!dropped.length) return "";
  const lines = dropped.map(
    (d) =>
      `• "${d.label}" (${d.day}, ${d.time}) — it clashes with "${d.clashesWith.label}", which is already in your plan.`,
  );
  return (
    `\n\nI left ${dropped.length === 1 ? "one session" : `${dropped.length} sessions`} out to avoid double-booking you:\n` +
    lines.join("\n") +
    `\n\nSay the word if you'd rather have ${dropped.length === 1 ? "it" : "one of them"} and I'll swap out what it collides with.`
  );
}

/* ------------------------------------------------------------------ *
 * Output guard
 * ------------------------------------------------------------------ */

/**
 * Booth identifiers only. Session halls are legitimate published data and must
 * survive — scrubbing "Jasmine 3" would break the agenda feature. This catches
 * the one thing that is never true: an exhibitor stand identifier.
 */
const BOOTH_RX =
  /\b(?:booth|stall|kiosk)\s*(?:no\.?|number|#)?\s*[:#-]?\s*[A-Za-z]{0,3}-?\d+[A-Za-z]?\b/gi;

const NO_FLOOR_PLAN =
  "GFF has not published a floor plan for 2026, so I can't tell you where an exhibitor's stand will be — only who is exhibiting and what they do.";

export function guardReply(text: string): { text: string; scrubbed: boolean } {
  BOOTH_RX.lastIndex = 0;
  if (!BOOTH_RX.test(text)) return { text, scrubbed: false };
  BOOTH_RX.lastIndex = 0;
  return {
    text: `${text.replace(BOOTH_RX, "[not published]")}\n\n${NO_FLOOR_PLAN}`,
    scrubbed: true,
  };
}

/* ------------------------------------------------------------------ *
 * The deterministic fallback
 * ------------------------------------------------------------------ */

/**
 * No GEMINI_API_KEY. lib/match.ts still produces real records with real reasons,
 * so the attendee gets a plan — just without conversation. Degrading to the
 * matcher is strictly better than a 503: the plan is the product, the prose is
 * the polish.
 */
function fallback(message: string, plan: Plan | null): AgentOutcome {
  const result = match(message, 4);
  const picks = [
    ...result.sessions.map((r) => ({ id: r.session.agendaCode, why: reason(r.why) })),
    ...result.speakers.map((r) => ({ id: r.speaker.nameKey, why: reason(r.why) })),
    ...result.partners.map((r) => ({ id: r.partner.slug, why: reason(r.why) })),
  ].filter((p) => p.why);

  const known = new Set([
    ...(plan?.sessions ?? []),
    ...(plan?.people ?? []),
    ...(plan?.partners ?? []),
  ]);
  const fresh = picks.filter((p) => !known.has(p.id));
  const valid = validateIds(fresh.map((p) => p.id));
  const validSet = new Set([...valid.sessions, ...valid.people, ...valid.partners]);
  // The matcher can rank two overlapping sessions highly for the same terms, so
  // the fallback needs the same clash guard as the model path.
  const { keep, dropped: clashes } = filterClashes(
    fresh.filter((p) => validSet.has(p.id)).map((p) => p.id),
    plan,
  );
  const keepSet = new Set(keep);
  const add = fresh.filter((p) => keepSet.has(p.id));

  const why: Record<string, string> = {};
  for (const p of add) why[p.id] = p.why;

  const items = resolveItems(add.map((p) => p.id));
  const reply = add.length
    ? `The conversational agent is offline (no model key configured), so I matched your words against the catalog directly and added ${add.length} item${add.length === 1 ? "" : "s"}:\n\n` +
      items.map((i) => `• ${i.label}${i.detail ? ` — ${i.detail}` : ""}\n  ${why[i.id]}`).join("\n") +
      `\n\nEvery one is a real published record and every reason is a term your message and the record actually share. Set GEMINI_API_KEY to get the conversational agent back.`
    : `The conversational agent is offline (no model key configured), and matching your words against the catalog directly turned up nothing above the confidence threshold. I'd rather tell you that than add the nearest unrelated sessions.\n\nTry naming a topic — "cross-border payments", "lending", "regulation" — or set GEMINI_API_KEY to get the conversational agent back.`;

  return {
    reply: reply + clashNote(clashes),
    ops: { add: add.map((p) => p.id), remove: [] },
    why,
    objective: plan?.objective ?? (message.trim() ? message.trim().slice(0, 200) : null),
    degraded: true,
    dropped: valid.dropped,
    clashes,
  };
}

/* ------------------------------------------------------------------ *
 * The agent turn
 * ------------------------------------------------------------------ */

export async function runAgent(input: {
  message: string;
  history: ConversationTurn[];
  plan: Plan | null;
}): Promise<AgentOutcome> {
  const { message, history, plan } = input;

  if (!AGENT_ENABLED) return fallback(message, plan);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const contents = [
    buildCatalog(),
    "---",
    renderPlan(plan),
    "---",
    renderHistory(history),
    "---",
    `ATTENDEE'S NEW MESSAGE: ${message}`,
  ].join("\n\n");

  let raw = "";
  let truncated = false;
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA,
        temperature: 0.4,
        /**
         * Generous on purpose. This model's reasoning tokens are drawn from the
         * same budget as the visible output, so a request like "pack my day with
         * 14 sessions" can spend the allowance thinking and emit JSON that stops
         * mid-object. That surfaced as an unexplained parse failure at 4000.
         */
        maxOutputTokens: 16000,
      },
    });
    raw = (response.text ?? "").trim();
    truncated = response.candidates?.[0]?.finishReason === "MAX_TOKENS";
  } catch (err) {
    console.error("[agent] model call failed:", err);
    throw new Error("MODEL_UNREACHABLE");
  }

  // Distinguished from malformed output because the fix is different: a
  // truncated answer means ask for less, not try again.
  if (truncated && !raw) {
    console.error("[agent] hit MAX_TOKENS with no usable output");
    throw new Error("MODEL_TRUNCATED");
  }

  let parsed: { reply?: unknown; add?: unknown; remove?: unknown; objective?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(
      `[agent] model returned unparseable JSON (truncated=${truncated}, ${raw.length} chars):`,
      raw.slice(0, 400),
    );
    throw new Error(truncated ? "MODEL_TRUNCATED" : "MODEL_BAD_OUTPUT");
  }

  // --- Gate 2: every id checked against the real id set, unknowns dropped. ---
  const rawAdds = Array.isArray(parsed.add) ? parsed.add : [];
  const proposed: { id: string; why: string }[] = rawAdds
    .map((x) => {
      const o = x as { id?: unknown; why?: unknown };
      return { id: String(o?.id ?? "").trim(), why: String(o?.why ?? "").trim() };
    })
    .filter((x) => x.id);

  const addValid = validateIds(proposed.map((p) => p.id));
  const addKeep = new Set([...addValid.sessions, ...addValid.people, ...addValid.partners]);
  const removeValid = validateIds(parsed.remove);
  const removeKeep = [...removeValid.sessions, ...removeValid.people, ...removeValid.partners];

  const why: Record<string, string> = {};
  const validated: string[] = [];
  for (const p of proposed) {
    if (!addKeep.has(p.id) || validated.includes(p.id)) continue;
    validated.push(p.id);
    // A pick with no stated reason keeps the record but not a manufactured
    // rationale — an empty `why` renders as nothing, which is honest.
    if (p.why) why[p.id] = p.why;
  }

  // --- Gate 2b: no double-booking. Order is the model's own ranking. ---
  // Removes from this same turn are passed in so a deliberate swap survives.
  const { keep: add, dropped: clashes } = filterClashes(validated, plan, removeKeep);
  for (const c of clashes) delete why[c.id];
  if (clashes.length) {
    console.warn(
      `[agent] dropped ${clashes.length} clashing session(s): ` +
        clashes.map((c) => `${c.id} vs ${c.clashesWith.id}`).join(", "),
    );
  }

  const dropped = [...addValid.dropped, ...removeValid.dropped];
  if (dropped.length) {
    console.warn(`[agent] dropped ${dropped.length} unknown id(s): ${dropped.join(", ")}`);
  }

  const { text: reply } = guardReply(String(parsed.reply ?? "").trim());
  const objective = String(parsed.objective ?? "").trim();

  return {
    reply: (reply || "I didn't manage to put that into words. Try asking again.") + clashNote(clashes),
    ops: { add, remove: removeKeep },
    why,
    objective: objective || plan?.objective || null,
    degraded: false,
    dropped,
    clashes,
  };
}
