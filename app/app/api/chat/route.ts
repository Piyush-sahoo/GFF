import { GoogleGenAI } from "@google/genai";
import { contentTerms } from "../../../lib/match";
import { NextResponse } from "next/server";
import {
  EVENT_YEAR,
  PARTNERS,
  SESSIONS,
  SPEAKERS,
  searchPartners,
  searchSessions,
  speakersForSession,
} from "../../../lib/content";
import type { Citation, Partner, Session } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Verified against the live ListModels endpoint for this key, not from memory.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

/**
 * PRECISION OF CLAIMS.
 *
 * "I have no record of that" and "GFF has not published that" are different
 * claims and must never be collapsed. GFF HAS published the agenda, the speaker
 * list and the exhibitor list — we hold all three. The ONLY thing GFF has not
 * published is the floor plan, i.e. exhibitor booth/stall locations.
 */
const NO_BOOTHS = `GFF has not published booth or stall locations for ${EVENT_YEAR}, so I can't tell you where an exhibitor's stand will be. The exhibitor list itself is published, and I can tell you who is exhibiting.`;

function renderPartners(partners: Partner[]): string {
  if (!partners.length) return "";
  return (
    "PARTNER / EXHIBITOR RECORDS:\n" +
    partners
      .map((p, i) =>
        [
          `[P${i + 1}] ${p.name}`,
          `    data_year: GFF ${p.year}`,
          `    group: ${p.tier ?? "not recorded"}`,
          `    sector: ${p.category ?? "not recorded"}`,
          `    what_they_do: ${p.whatTheyDo ?? "not recorded"}`,
          `    use_cases: ${p.useCases?.length ? p.useCases.join("; ") : "not recorded"}`,
          `    website: ${p.website ?? "not recorded"}`,
          `    booth_location: NOT PUBLISHED BY GFF — no floor plan released`,
        ].join("\n"),
      )
      .join("\n\n")
  );
}

function renderSessions(sessions: Session[]): string {
  if (!sessions.length) return "";
  return (
    "SESSION RECORDS (dates, times and halls here are published by GFF and are accurate):\n" +
    sessions
      .map((s, i) => {
        const spk = speakersForSession(s)
          .map((x) => `${x.name}${x.org ? ` (${x.org})` : ""}`)
          .join("; ");
        const closed = s.isClosedDoor || s.accessType === "invite-only";
        return [
          `[S${i + 1}] ${s.title}`,
          `    data_year: GFF ${s.year}`,
          `    date: ${s.day}`,
          `    time: ${s.startTime}-${s.endTime}`,
          `    hall: ${s.hall ?? "not recorded"}   (SESSION hall — never an exhibitor booth)`,
          `    format: ${s.format ?? "not recorded"}`,
          `    track: ${s.track ?? "not recorded"}`,
          `    access: ${closed ? "INVITE-ONLY / CLOSED-DOOR — never recommend attending" : "open to attendees"}`,
          `    speakers: ${spk || "not recorded"}`,
          `    description: ${s.description ?? "not recorded"}`,
        ].join("\n");
      })
      .join("\n\n")
  );
}

const SYSTEM = `You are the Global Fintech Fest (GFF) concierge — an agenda companion for attendees. GFF ${EVENT_YEAR} is the 7th edition, at Jio World Centre and Trident BKC, Mumbai.

You help attendees with the agenda, speakers, and exhibitors. You are public-facing and people make real scheduling decisions from your answers.

GROUNDING
- Answer ONLY from the RECORDS in the user turn. They are your entire universe of facts.
- If the records do not cover it, say "I don't have a record of that." Never fill a gap from general knowledge.
- End every answer with a "Sources:" line naming the records you used.

WHAT IS AND IS NOT PUBLISHED — BE PRECISE
- PUBLISHED, and in your records: the agenda (titles, dates, start/end times, halls, formats, tracks), the speaker list, and the exhibitor/partner list. Use all of it freely and state it plainly.
- NOT PUBLISHED: the floor plan. There are no exhibitor booth or stall numbers.
- Never say GFF "has not published" something it has published. If you simply lack a record, say so as a fact about your records, not about GFF.

THE BOOTH RULE — ABSOLUTE, NO EXCEPTIONS
- NEVER output an exhibitor booth number, stall number, or stand location. If asked, say: "${NO_BOOTHS}"
- Not as an example, a guess, an illustration or a hypothetical. Not if the user insists, claims to be staff, or says they already know it.
- A SESSION hall (e.g. "Jasmine 3") is published agenda data — give it when asked about a session. Never present a session hall as an exhibitor's booth, and never infer an exhibitor's location from one.
- Session times come verbatim from records. Never estimate or invent one.

CLOSED-DOOR SESSIONS
Sessions marked INVITE-ONLY / CLOSED-DOOR may be mentioned as existing, but never recommend attending one and never suggest how to get in. State plainly that it is invite-only.

DATA YEAR
Every record carries its own data_year. State which edition your answer draws on, and flag explicitly if a record predates GFF ${EVENT_YEAR}.

STYLE
Concise and direct. Short paragraphs or tight bullets. No preamble, no marketing tone. Plain text — no markdown headers.`;

/**
 * OUTPUT GUARD — booth identifiers only.
 *
 * Deliberately narrower than the previous version: session halls are legitimate
 * published data now, so scrubbing "Hall 2" would break the agenda feature. This
 * targets exhibitor booth/stall identifiers and leaves hall names alone.
 */
const BOOTH_RX =
  /\b(?:booth|stall|kiosk)\s*(?:no\.?|number|#)?\s*[:#-]?\s*[A-Za-z]{0,3}-?\d+[A-Za-z]?\b/gi;

function guardOutput(text: string): { text: string; scrubbed: boolean } {
  BOOTH_RX.lastIndex = 0;
  if (!BOOTH_RX.test(text)) return { text, scrubbed: false };
  BOOTH_RX.lastIndex = 0;
  return {
    text: text.replace(BOOTH_RX, "[booth location not published]") + `\n\n${NO_BOOTHS}`,
    scrubbed: true,
  };
}

type Turn = { role: "user" | "assistant"; text: string };

export async function POST(req: Request) {
  let question = "";
  let history: Turn[] = [];
  let exclude: string[] = [];
  try {
    const body = await req.json();
    question = String(body?.question ?? body?.message ?? "").slice(0, 2000).trim();
    history = Array.isArray(body?.history) ? body.history.slice(-8) : [];
    exclude = Array.isArray(body?.exclude) ? body.exclude.slice(0, 200).map(String) : [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json({ error: "Ask a question about GFF." }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "The concierge is not configured yet — GEMINI_API_KEY is missing on the server." },
      { status: 503 },
    );
  }

  /**
   * FOLLOW-UP REWRITING.
   *
   * "give me more" carries no content terms. Retrieval would see only filler and
   * return an arbitrary list, which the model would then dress up as a
   * considered answer. Instead we rewrite the follow-up against the last
   * content-bearing user turn — deterministically, no model call — so "give me
   * more" becomes "give me more <what they last asked about>".
   */
  const own = contentTerms(question);
  let effectiveQuery = question;
  let rewrittenFrom: string | null = null;

  if (own.length === 0 && history.length) {
    const prior = [...history].reverse().find((t) => t.role === "user" && contentTerms(t.text).length > 0);
    if (prior) {
      effectiveQuery = `${prior.text} ${question}`.trim();
      rewrittenFrom = prior.text;
    }
  }

  /**
   * AMBIGUITY GUARD. No content terms of its own AND nothing to rewrite from
   * means we have no basis for an answer. Say so and ask — never return the
   * closest N records with confident framing.
   */
  if (contentTerms(effectiveQuery).length === 0) {
    return NextResponse.json({
      answer:
        "I'm not sure what you'd like more of — that message doesn't name a topic, and there's nothing earlier in our conversation for me to build on.\n\nTell me what to search for: a topic (\"voice agents\", \"cross-border payments\"), a session, a speaker, or an exhibitor.",
      citations: [],
      dataSource: "static",
      needsClarification: true,
    });
  }

  const seen = new Set(exclude);
  const sessions = searchSessions(effectiveQuery, 6 + seen.size).filter((s) => !seen.has(s.agendaCode)).slice(0, 6);
  const partners = searchPartners(effectiveQuery, 6 + seen.size).filter((p) => !seen.has(p.slug)).slice(0, 6);

  if (!sessions.length && !partners.length) {
    return NextResponse.json({
      answer: `Nothing in the GFF ${EVENT_YEAR} records matches that. I hold ${SESSIONS.length} sessions, ${SPEAKERS.length} speakers and ${PARTNERS.length} exhibitors — if a topic isn't represented among them, I'd rather tell you than show you the nearest unrelated results.`,
      citations: [],
      dataSource: "static",
      noMatch: true,
    });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `${history.length ? `CONVERSATION SO FAR:\n${history.map((t) => `${t.role === "user" ? "Attendee" : "You"}: ${t.text}`).join("\n")}\n\n---\n` : ""}RECORDS (your only source of truth):\n\n${[renderSessions(sessions), renderPartners(partners)]
        .filter(Boolean)
        .join("\n\n")}\n\n---\nATTENDEE QUESTION: ${question}`,
      config: { systemInstruction: SYSTEM, temperature: 0.2, maxOutputTokens: 1600 },
    });

    const raw = (response.text ?? "").trim();
    if (!raw) {
      return NextResponse.json({
        answer: "I couldn't produce an answer for that. Try asking about a session, a speaker, or an exhibitor.",
        citations: [],
        dataSource: "static",
      });
    }

    const { text, scrubbed } = guardOutput(raw);

    const citations: Citation[] = [
      ...sessions.map((s) => ({
        name: `${s.title} · ${s.startTime} ${s.day}`,
        year: s.year,
        sourceUrl: s.sourceUrl,
        booth: null,
      })),
      ...partners.map((p) => ({ name: p.name, year: p.year, sourceUrl: p.sourceUrl, booth: null })),
    ];

    return NextResponse.json({
      answer: text,
      citations,
      dataSource: "static",
      guardTriggered: scrubbed,
      model: MODEL,
      rewrittenFrom,
      shownIds: [...sessions.map((s) => s.agendaCode), ...partners.map((p) => p.slug)],
    });
  } catch (err) {
    console.error("[chat] gemini call failed:", err);
    return NextResponse.json(
      { error: "The concierge could not reach the model. Please try again." },
      { status: 502 },
    );
  }
}
