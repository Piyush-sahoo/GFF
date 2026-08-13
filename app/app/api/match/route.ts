import { NextResponse } from "next/server";
import { retrieve, DENSE_MODE } from "../../../lib/retrieval";
import { PARTNERS, SESSIONS, SPEAKERS, speakerSlug } from "../../../lib/content";
import { match as lexicalMatch } from "../../../lib/match";

// node:fs is used by the retrieval module — this route cannot run on edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reasons are still never generated. We report which of the user's terms the
 * retriever actually matched, plus the fact that it was semantically similar —
 * never a written justification.
 */
function why(hit: any, terms: string[]): string {
  const matched: string[] = Array.isArray(hit?.parts?.matchedTerms)
    ? hit.parts.matchedTerms
    : terms.filter((t) => JSON.stringify(hit?.record ?? {}).toLowerCase().includes(t));
  const names: string[] = hit?.matchedNames ?? [];
  const bits: string[] = [];
  if (names.length) bits.push(`names ${names.map((n) => `“${n}”`).join(", ")}`);
  if (matched.length) bits.push(`${matched.map((t) => `“${t}”`).join(", ")}`);
  if (!bits.length) return "Semantically similar to what you described; none of your exact words appear.";
  return `Matched ${bits.join(" and ")}.`;
}

export async function POST(req: Request) {
  let objective = "";
  try {
    const body = await req.json();
    objective = String(body?.objective ?? "").slice(0, 500).trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!objective) {
    return NextResponse.json({ error: "Describe what you're looking for." }, { status: 400 });
  }

  // Coverage figures stay derived from the static records.
  const coverage = lexicalMatch(objective, 0).coverage;
  const terms = lexicalMatch(objective, 0).terms;

  // Type words are only soft hints in the ranker, so each surface asks
  // explicitly for its own type rather than hoping the blend cooperates.
  const [people, sessions, exhibitors] = await Promise.all([
    retrieve(objective, { limit: 6, filters: { type: "speaker" } }),
    retrieve(objective, { limit: 6, filters: { type: "session", excludeClosedDoor: true } }),
    retrieve(objective, { limit: 6, filters: { type: "partner" } }),
  ]);

  const degraded = people.degraded || sessions.degraded || exhibitors.degraded;

  const bySlug = new Map(PARTNERS.map((p) => [p.slug, p]));
  const byName = new Map(SPEAKERS.map((s) => [s.nameKey, s]));
  const byCode = new Map(SESSIONS.map((s) => [s.agendaCode, s]));

  return NextResponse.json({
    objective,
    terms,
    coverage,
    retrieval: {
      channel: people.channel,
      configured: DENSE_MODE,
      degraded,
      degradedReason: degraded
        ? people.degradedReason || sessions.degradedReason || exhibitors.degradedReason
        : null,
    },
    speakers: people.hits
      .map((h: any) => {
        const sp = byName.get(h.record?.nameKey) ?? SPEAKERS.find((s) => s.name === h.record?.name);
        return sp ? { slug: speakerSlug(sp), name: sp.name, title: sp.title, org: sp.org, headshotUrl: sp.headshotUrl, why: why(h, terms) } : null;
      })
      .filter(Boolean),
    sessions: sessions.hits
      .map((h: any) => {
        const s = byCode.get(h.record?.agendaCode);
        if (!s || s.isClosedDoor || s.accessType === "invite-only") return null;
        return { agendaCode: s.agendaCode, title: s.title, day: s.day, startTime: s.startTime, endTime: s.endTime, hall: s.hall, format: s.format, track: s.track, why: why(h, terms) };
      })
      .filter(Boolean),
    partners: exhibitors.hits
      .map((h: any) => {
        const p = bySlug.get(h.record?.slug) ?? PARTNERS.find((x) => x.name === h.record?.name);
        return p ? { slug: p.slug, name: p.name, tier: p.tier, category: p.category, website: p.website, logoUrl: p.logoUrl, hasDescription: Boolean(p.whatTheyDo?.trim()), why: why(h, terms) } : null;
      })
      .filter(Boolean),
  });
}
