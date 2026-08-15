# GFF 2026 Concierge — User Journeys & Page Specs

**Status: plan only.** Nothing in this document has been built. No routes, components,
or dependencies were added while writing it. Every number below was measured from
`data/2026/*.json` and `rag/sectors/` in this repo at the time of writing, not estimated
and not carried over from a brief.

---

## 0. Ground rules this plan is written against

These come from `README.md` ("Hard product rules") and are enforced in code and tests.
Every page spec below inherits them; where a page comes close to breaking one, the spec
says so explicitly.

1. **No exhibitor booth, stall, floor plan, locator, or wayfinding. Anywhere.**
   GFF published no 2026 floor plan. `booth`/`boothSource` are null on all 319 partner
   rows, and the ban is enforced in four places: the free-text guard in
   `app/lib/content.ts` (`RX_BOOTH_ID`, `RX_HALL_ID`), the output guard in
   `app/app/api/chat/route.ts`, the corpus rejection in `rag/corpus/build_corpus.py`,
   and the omitted column in `exports/export.mjs`.
   *Nothing in this plan adds a map, a "find them here" affordance, or a proximity hint.*
2. **Session halls are published data and are not booths.** All 256 sessions carry a
   `hall`. A hall may be shown on a session, an agenda row, or a hall page. A hall must
   never appear on a partner page, never be joined to a partner, and never be used to
   imply where an exhibitor is.
3. **34 invite-only sessions** may be listed and badged. They are never recommended,
   never described as attendable, never saved to a plan, and never emitted by the
   planning agent. `match()` already filters them; `isBookmarkable()` already blocks the
   save.
4. **2026 only.** `data/archive-2025/` is archive and is never loaded.
5. **Nothing is back-filled.** No "N/A", no "Unknown", no plausible guess. Every page
   spec below states its empty state for every field that is not 100% covered.
6. **Static-first.** Reads come from JSON vendored into `app/data/` at build time
   (`app/lib/content.ts`). Atlas (`app/lib/profiles.ts`) is for user-generated writes
   only and must never be imported by a read path.

---

## 1. Measured data — what these pages can actually stand on

### Partners — 316 (319 rows minus 3 CMS logo artifacts)

| Field | Covered | Share | Consequence for the UI |
|---|---:|---:|---|
| `logoUrl` | 316/316 | 100% | Logo grid is safe; no fallback path needed at scale |
| `website` | 292/316 | 92.4% | 24 cards need a "no website listed" state |
| `whatTheyDo` | 291/316 | 92.1% | 25 partner pages open with no description |
| `useCases` | 208/316 | 65.8% | **108 partner pages have no use-case list at all** |
| `slug` | 316/316, unique | 100% | `/exhibitors/[slug]` is safe to generate statically |
| `booth` | 0/316 | 0% | By design. Never rendered |

Tiers (exact strings in the data):

| Tier | n | | Tier | n |
|---|---:|---|---|---:|
| Exhibitor | 165 | | Associate Partner | 2 |
| Bronze Partner | 36 | | Co-Powered By | 2 |
| Gold Partner | 24 | | Platinum Partner | 2 |
| Silver Partner | 23 | | Payment Processing Partner | 1 |
| Ecosystem | 12 | | Global Enterprise Payments Partner | 1 |
| Supporter | 7 | | Banking Innovation Partner | 1 |
| Brought To You By | 5 | | Data Protection & Consent Partner | 1 |
| Diamond Partner | 3 | | Global Payments Partner | 1 |
| | | | Voice AI Partner | 1 |
| | | | Credit Innovation Partner | 1 |
| | | | System Of Intelligence Partner | 1 |
| | | | **Beer Booth Partner** | 1 |

Ten of those tiers have exactly one member. A tier page per tier therefore produces ten
single-card pages. Handled in §3.

### Speakers — 487

| Field | Covered | Share | Consequence |
|---|---:|---:|---|
| `headshotUrl` | 487/487 | 100% | Speaker grid is visually complete |
| `org` | 487/487 | 100% | Org is always displayable text |
| `bio` | 425/487 | 87.3% | 62 speaker pages have no bio |
| `sessionCodes` | 345/487 | 70.8% | **142 speakers have no session — they dead-end** |
| `linkedin` | 199/487 | **40.9%** | Cannot be a primary CTA; 288 pages would show a dead button |

384 distinct orgs. Countries: India 364, Singapore 23, USA 11, UK 8, UAE 6, 34 null.
All 345 speakers with `sessionCodes` resolve to a real session — zero dangling codes.

### Sessions — 256, across three days

- 2026-09-09: 92 · 2026-09-10: 93 · 2026-09-11: 71
- `day`, `startTime`, `endTime`, `hall`: **100% populated**. A real time grid and a live
  "now" view are computable from the data with no inference.
- `description`: 236/256 — 20 sessions have none.
- Access: 222 public / 34 invite-only.
- Times run 08:00–22:00. All start times land on a 5-minute boundary; 64 distinct start
  times overall (~21 per day). Durations: 40min ×167, 30min ×33, 120min ×10, 60min ×10,
  150min ×7, 15min ×6.
- Formats (exact strings): Panel Discussion 156, Masterclass 17, Roundtable 14,
  Fireside Chat 13, Keynote Address 12, Closed Room Session 8, Keynote & Fireside Chat 4,
  Product Launch 4, Trialogue 4, Networking Dinner 4, Product Showcase 3, Hackathon 2.
- Halls — 17 distinct: Lotus 1 (26), Hall 204 A&B (24), Hall 205 A&B (24), Jasmine 3 (22),
  Lotus 2 (22), Lotus 3 (22), The Grand Theatre (19), The Studio (17), Cube (16),
  Hall 202 (16), Hall 206 A&B (16), Hall 103 (14), Hall 102 (10), Hall 104 A&B (4),
  Hall 203 (2), **Indian Accent (1)**, **Taftoon (1)**.
- Invite-only concentrates in specific halls: Hall 102 (7), Hall 206 A&B (6),
  Hall 103 (6), Hall 104 A&B (4), Lotus 1 (2) — relevant to hall pages, see §4.

---

## 2. Three things the brief flagged, verified here — and one it did not

### 2.1 `session.track` is unusable as a facet — **confirmed**

86 of 256 sessions have no track. Of the 170 that do, there are **169 distinct values** —
i.e. almost every track is unique to one session. They are comma-jammed multi-topic
strings, e.g.:

```
"Capital Markets, Algorithmic Trading,, Market Integrity"   <- note the double comma
"Autonomous Workflows, Agentic AI, AI Architecture"
"AI Finance, Financial Inclusion, Personal Finance"
```

Only `"Policy"` appears twice. `TRACKS` in `app/lib/content.ts` currently derives 169
filter values from this, and `AgendaList` renders them as chips — that filter row is
already close to useless and should be dropped when the agenda grid lands (§4).
`match.ts` weights `track` at 4, which is harmless (it is scored as free text, not as a
facet) but should be reconsidered alongside topics.

**Use `topics` instead.** With the caveat in 2.3.

### 2.2 `partner.category` is mostly `"other"` — **confirmed**

`other` 195, infra 37, ai 29, payments 23, banking 13, lending 8, regtech 5,
wealthtech 4, crypto 1, insurtech 1. **195/316 = 61.7% is `"other"`.** The Sector chip
row in `ExhibitorDirectory.tsx` is therefore mostly one chip labelled "Other" holding
almost two thirds of the directory.

**Use `rag/sectors/sectors-2026.json`.** Verified against the data:

- 316 keys, keyed by **exact partner `name`** — 316/316 match a partner name exactly.
  No fuzzy join, no normalisation needed. (The joining key is `name`, *not* `slug`.)
- 283/316 (89.6%) classified to a real sector; 33 `Unknown` (13 no-evidence,
  20 no-usable-evidence).
- Shape per entry: `{ sector, subSectors[], confidence: high|medium|low, method, evidence }`.
  Confidence: high 237, medium 28, low 18. Method: `whatTheyDo+useCases` 207,
  `whatTheyDo` 64, `tier` 12.
- 24 sectors, top: Payments 40, Enterprise Software & IT Services 26, AI & Automation 24,
  Lending & Credit 24, Ecosystem/Investors & Advisory 21, Customer Engagement/CRM & CPaaS 18,
  Wealth & Capital Markets 17, Data & Analytics 17.

Wiring it in requires a vendoring step (`app/sync-data.sh` currently copies `data/2026`,
retrieval src, and the embedding index — not `rag/sectors/`). That is a build-step change,
not a runtime one, and preserves static-first.

### 2.3 Something the brief did not flag: **topics are thin in the tail**

The brief lists topics as "clean and usable", which is true of the head. The full
distribution is not:

- **346 distinct topic strings** across 256 sessions.
- **270 of them appear on exactly one session.**
- Only **76 appear on ≥2 sessions**; only **23 appear on ≥3**.
- **86 sessions carry no topics at all** — and it is exactly the same 86 sessions that
  carry no track. Those sessions are unreachable from any topic or track facet.
- Case-folding changes nothing (346 distinct either way), so there is no cheap
  normalisation win.
- 6 of the 34 invite-only sessions carry topics, so topic pages must filter them from
  the recommendation surface while still being allowed to list them.

**Consequence:** a `/topics/[topic]` route generated for all 346 topics produces 270
pages containing a single session and nothing else — pages that will read as broken.
§5 specs a threshold instead.

---

## 3. Journey 1 — Exhibitor depth

> **Goal:** "I saw this company in the directory. Who are they, what do they actually do,
> what sector are they in, and is anyone from them speaking?"

Today `/exhibitors` is a directory with no detail page. Every one of the 316 cards is a
dead end.

### Flow

1. Attendee lands on `/exhibitors`, searches or filters by sector.
2. Taps a card → **`/exhibitors/[slug]`** (new).
3. From there: their sector → `/exhibitors/sector/[sector]` (new); their tier →
   `/exhibitors/tier/[tier]` (new); their speakers → `/speakers/[slug]` (existing) —
   *for the 26.7% of speakers where that link exists, see §6*.

### Routes

| Route | Status | Render | Count |
|---|---|---|---:|
| `/exhibitors` | exists | `force-static` | 1 |
| `/exhibitors/[slug]` | **new** | `force-static`, `generateStaticParams` from `PARTNERS` | 316 |
| `/exhibitors/sector/[sector]` | **new** | `force-static` | 24 |
| `/exhibitors/tier/[tier]` | **new** | `force-static` | see decision D1 |

### `/exhibitors/[slug]` — field bindings and empty states

| Block | Field | Coverage | Empty state |
|---|---|---:|---|
| Logo | `logoUrl` | 316/316 | n/a — plain `<img>`, matching the directory's no-optimiser choice |
| Name | `name` | 316/316 | n/a |
| Tier badge | `tier` | 316/316 | n/a |
| Sector + sub-sectors | `sectors-2026.json[name]` | 283/316 | 33 partners: render **"Sector not classified — no usable public description."** Never "Other", never "Unknown" as a label |
| Confidence note | `.confidence` | 283 classified | Show a quiet "classified from their own description" line only for `low` (18) so the reader knows it is inferred |
| What they do | `whatTheyDo` | 291/316 | 25 partners: **"Description not yet available."** — reuse the directory's existing wording verbatim |
| Withheld notice | `SUPPRESSED` | — | If this partner's description was suppressed by the contamination guard, say *why*: "Their published description carried a booth number / a previous edition's details, so it is withheld rather than edited." |
| Use cases | `useCases[]` | 208/316 | **108 partners: omit the whole block.** Do not render an empty heading |
| Website | `website` | 292/316 | 24 partners: **"No website listed."** as text, not a disabled button |
| Speakers from this org | derived, see §6 | **81/316 partners** | 235 partners: omit the block entirely |
| Booth / location | — | — | **Nothing. No block, no "not published" placeholder that invites the question.** The directory-level notice already states the policy once |

### Cross-links

- **In:** `/exhibitors` cards; `/topics/[topic]` partner rail (§5); the match/planner
  result cards (§7); `/speakers/[slug]` org link where the org resolves (§6).
- **Out:** sector page, tier page, external website (`rel="noopener noreferrer"`),
  speaker pages where resolvable.

### Sponsor-tier page

Group the 20 tier strings by *shape*, not one page per string:

- **Headline tiers** with real cohorts: Diamond (3), Platinum (2), Gold (24), Silver (23),
  Bronze (36), Exhibitor (165), Ecosystem (12), Supporter (7), Brought To You By (5).
- **Named single-sponsor tiers** (11 tiers, 1–2 members each: Co-Powered By, Associate
  Partner, Payment Processing Partner, Global Enterprise Payments Partner, Banking
  Innovation Partner, Data Protection & Consent Partner, Global Payments Partner,
  Voice AI Partner, Credit Innovation Partner, System Of Intelligence Partner,
  Beer Booth Partner). These get **no page of their own** — they are listed on a single
  `/exhibitors/tier` overview as "Named partnerships" with a direct link to the partner.
  A one-card page per tier is worse than a row in a list.

> **Careful:** the tier string **"Beer Booth Partner"** contains the word *Booth*. It is
> a sponsorship name, not a location, and the `RX_BOOTH_ID` guard does not strip it
> (it requires a digit). It renders in the tier chips today. Minting the URL
> `/exhibitors/tier/beer-booth-partner` puts "booth" in a link on a site whose stated
> policy is that booths do not exist here. **Decision D1.**

### Out of scope, deliberately

- Any map, hall, zone, proximity, or "where to find them" affordance.
- Contact details, emails, or "request a meeting" — no such data exists and none is
  inferable.
- Partner ↔ session joins. There is **no partner→session field in the data**. The only
  bridge is org-name matching through speakers, which resolves for 81 partners (§6) and
  must be labelled as "people from this organisation are speaking", never as
  "this partner is running this session".

---

## 4. Journey 2 — At-the-fest navigation

> **Goal:** "It's 14:20 on day two. What is happening right now, what starts next, and
> what is on in the hall I'm standing in?"

This is the journey the data supports best: `day`, `startTime`, `endTime` and `hall` are
100% populated, so nothing here is inferred.

### Flow

1. Attendee opens **`/now`** (new) on their phone. Sees what is live, what starts in the
   next 30 minutes, and their own saved sessions surfaced first.
2. Wants the wider picture → **`/agenda/grid`** (new): a time × hall grid for one day.
3. Standing outside a room → **`/halls/[hall]`** (new): that hall's full three-day run.
4. Any cell → `/agenda/[agendaCode]` (existing).

### Routes

| Route | Status | Render | Notes |
|---|---|---|---|
| `/now` | **new** | `force-static` shell, **all time logic client-side** | see clock note |
| `/agenda/grid` | **new** | `force-static`, one prerender per day, client day switch | 3 days |
| `/halls` | **new** | `force-static` | 17 halls index |
| `/halls/[hall]` | **new** | `force-static`, `generateStaticParams` from distinct halls | 17 |
| `/agenda`, `/agenda/[agendaCode]` | exist | unchanged | |

### The clock — the one genuine risk on this journey

`/now` must not be server-rendered against server time. The site is `force-static` and
CDN-served; a prerendered "now" is frozen at build time. **All time comparison happens in
the client after mount**, exactly as `AgendaList` already does for its `?day=` deep link
(and for the same stated reason). Specifically:

- Compute against the venue's local zone (**IST, UTC+05:30**) explicitly. Do not use the
  device's local zone — an attendee's phone on a foreign carrier will show an empty page.
- Before mount, render a skeleton, not "nothing is on".
- **Outside the event window** (before 2026-09-09 or after 2026-09-11 IST), `/now` shows
  a countdown plus the first day's opening block, and says plainly that the festival is
  not running. It does not pretend a session is live.

### `/now` — bindings and empty states

| Block | Source | Empty state |
|---|---|---|
| Live now | sessions where `start ≤ now < end` on today's `day` | "Nothing is scheduled right now." + next start time |
| Starting next | next distinct `startTime` after now, all halls | If none left today: "That's the last session of the day." + link to tomorrow |
| Your plan, next up | saved bookmarks (localStorage, `gff.bookmarks.v1`) ∩ upcoming | If empty: link to `/agenda`, matching `MyPlan`'s existing empty copy |
| Per row | `title`, `hall`, `startTime`–`endTime`, `format`, speakers via `speakersForSession` | `format` is 100% covered; a session with no linked speakers omits the speaker line |
| Invite-only rows | badge only | Listed, badged **"Invite only"**, **no save button** (`isBookmarkable()` already returns false). Never in "starting next" as a suggestion — show it as information, styled distinctly |

### `/agenda/grid` — bindings and empty states

- **Axes:** rows = 15-minute slots from 08:00 to 22:00 (56 rows); columns = halls active
  on that day (15 on day 1, 16 on day 2, 14 on day 3 — column set is per-day, not global).
- All 64 distinct start times land on 5-minute boundaries; 15-minute rows with a
  `rowSpan` computed from duration renders every session without rounding. The dominant
  40-minute duration spans ~3 rows unevenly — **spec: position by absolute minutes offset
  in a CSS grid, not by row snapping**, so a 40-minute block is exactly 40 minutes tall.
- Densest single day+hall is 10 sessions (Lotus 1, day 1), so no column overflows.
- **Empty cells stay empty and unlabelled.** No "no session" filler.
- Mobile: the grid does not survive a phone. Below the breakpoint, fall back to the
  existing `/agenda` list — do not ship a horizontally scrolling 16-column grid as the
  phone experience. `/now` is the phone surface.
- **Drop the 169-value track filter** here (§2.1). Facets on this page: day, format
  (12 values, 100% covered), hall, and "hide invite-only".

### `/halls/[hall]` — bindings and empty states

| Block | Source | Note |
|---|---|---|
| Title | hall name | Verbatim from the data. It is **"The Grand Theatre"**, not "Grand Theatre" |
| Three-day run | sessions in that hall, grouped by day | Halls do not run all three days; a hall with no session on a day shows that day as "No sessions in this hall on {day}" |
| Thin halls | — | **Indian Accent (1 session) and Taftoon (1)** are restaurant venues with a single Networking Dinner each. Their pages are honest but nearly empty — acceptable, but they must not appear in a "browse by hall" grid as equals. List them under "Other venues" |
| Invite-only density | — | Hall 102 (7 of 10), Hall 206 A&B (6 of 16), Hall 103 (6 of 14), Hall 104 A&B (4 of 4) are heavily invite-only. **Hall 104 A&B is 100% invite-only** — its page must lead with that fact rather than reading as four attendable sessions |

### Cross-links

- **In:** global nav, `/agenda`, `/my-plan`, session pages, the planner's day view (§7).
- **Out:** session detail, speaker pages, `/my-plan`.

### Hard boundary on this journey

A hall page is a **session** surface. It carries no partner list, no "exhibitors near
this hall", no map. `/halls/[hall]` must never link to `/exhibitors/[slug]` and vice
versa. This is the single most likely accidental violation of rule 2 in the whole plan —
the two page types should not share a component that renders a location line.

---

## 5. Journey 3 — Topic & discovery hubs

> **Goal:** "I care about cross-border payments. Show me everything at GFF about it."

### The honest constraint first

Per §2.3: 346 distinct topics, 270 of which touch exactly one session; 86 sessions carry
no topic at all. A hub per topic is not viable at full breadth.

**Spec: generate `/topics/[topic]` only for topics on ≥2 sessions — 76 pages.** The other
270 remain visible as plain, unlinked text on a session page. Do not link to a page that
does not exist, and do not generate a page whose body is one row.

- A `/topics` index lists all 76 with counts, ordered by count: Financial Inclusion 13,
  Digital Public Infrastructure 11, Agentic AI 7, Digital Identity 7, Cross-Border
  Payments 7, Enterprise AI 6, AI Governance 5, Financial Innovation 5, Capital Markets 4,
  Cyber Resilience 4, AI Security 4, Tokenisation 4, then 64 more with 2–3 each.
- The index must state, in its own footer: **"86 of 256 sessions carry no topic tag and
  are not reachable from this page. Browse the full agenda for those."** Otherwise the
  index silently misrepresents itself as complete coverage.

### `/topics/[topic]` — three rails

| Rail | Source | Coverage reality | Empty state |
|---|---|---|---|
| Sessions | `SESSIONS` where `topics` contains the topic | 2–13 per page | Cannot be empty by construction (≥2 threshold) |
| Speakers | `speakersForSession()` unioned over those sessions | Strong — the session join is verified 345/345 | If the sessions have no linked speakers, omit the rail |
| Partners | **derived, not stored** — see below | Weak. Often empty | **Omit the rail entirely** when it yields nothing. Never render "No partners in this topic", which reads as a claim about GFF rather than about our data |

**There is no topic field on partners.** Any partner rail on a topic page is *derived*.
The only defensible derivation is the existing grounded matcher: run `contentTerms(topic)`
through the same `scoreFields` path `match.ts` uses over `name`/`whatTheyDo`/`useCases`,
and show only partners clearing `MIN_SCORE`, each with its literal matched terms
displayed. That keeps rule 5 intact — the rail says *"matched 'payments', 'cross-border'
in their use cases"*, never *"works in this topic"*.

Because 108 partners have no `useCases` and 25 have no description, those 108/25 are
structurally under-represented in every topic rail. **The rail footer must say so:**
"Matched from partner descriptions and use cases. 108 of 316 partners publish no use
cases and cannot be matched this way."

Invite-only sessions **may be listed** on a topic page (6 of the 34 carry topics) with the
badge and no save button. They must not appear in a "recommended" or "suggested" framing.

### Cross-links

- **In:** session detail topic chips (only for the 76); `/topics` index; planner results.
- **Out:** session detail, speaker pages, partner pages, `/agenda/grid?day=…` filtered.

### Out of scope

- Topic pages for the 270 singletons.
- Any attempt to cluster, merge, or normalise the 346 strings into a tidier taxonomy —
  that is a data-pipeline change (`rag/`), not an app change, and inventing a mapping in
  the app would be exactly the kind of plausible guess rule 5 forbids.
- Re-using `track` as a topic source (§2.1).

---

## 6. Journey 4 — Networking cross-links

> **Goal:** "This speaker was good. Who are they, where do they work, what else are they
> on, and can I save it?"

### The honest constraint first

The chain **speaker → org → partner page** only closes when the speaker's `org` matches a
partner. Measured:

- 487 speakers, **all 487 have an `org`**, across 384 distinct orgs.
- **104 speakers** (21.4%) have an org that matches a partner `name` **exactly**.
- **130 speakers** (26.7%) match after light normalisation (case, punctuation, and
  dropping `Pvt/Ltd/Limited/Inc/LLP/Technologies/India`), covering **81 of 384 orgs** and
  **81 of 316 partners**.
- So **357 of 487 speakers (73.3%) have an org that is not an exhibitor** — RBI, NPCI,
  academics, foreign regulators, and companies that simply are not partners this year.

**Spec:** the org line on a speaker page is a link **only when the org resolves to a
partner**; otherwise it is plain text. No "search for this org" fallback that lands on an
empty result. Use exact match plus the normalisation above, computed at build time into a
lookup — and **treat a normalised match as a match, not a guess**, but exclude any
one-directional substring matching (that produces false joins like "Bank of X" → "X").

### Flow

1. `/speakers/[slug]` (exists) → org, bio, headshot, sessions.
2. Org → `/exhibitors/[slug]` where resolvable (130 speakers), otherwise nothing.
3. Sessions → `/agenda/[agendaCode]` → **Save to plan**.
4. Partner page → "People from this organisation speaking at GFF" → back to speakers.

### `/speakers/[slug]` — bindings and empty states

| Block | Field | Coverage | Empty state |
|---|---|---:|---|
| Headshot | `headshotUrl` | 487/487 | n/a |
| Name / role | `name`, `title` | 487 / high | If `title` is null, show name and org only |
| Org | `org` | 487/487 | Always shown; linked for 130, plain text for 357 |
| Bio | `bio` | 425/487 | **62 speakers: omit the block.** No "no bio available" line — the page still has name, role, org, sessions |
| Sessions | `sessionsForSpeaker()` | 345/487 have any | **142 speakers show: "No session listed for this speaker in the published 2026 agenda."** This is the biggest dead-end in the app and must be stated, not hidden |
| LinkedIn | `linkedin` | **199/487 (40.9%)** | **Never a primary CTA.** A small secondary link where present; nothing at all for the other 288. A prominent button that is absent 59% of the time makes the page look broken |
| Country | `country` | 453/487 | 34 nulls: omit |

### Partner page — "People from this organisation"

Only for the 81 partners with a resolvable speaker. Wording must be precise: **"People
from {org} speaking at GFF 2026"** — an attribution about individuals, not a claim that
the partner is programming the session. 58 orgs have ≥2 speakers, so most of these blocks
have real content.

### Save to plan

Unchanged behaviour, and it is worth restating what it is today: `AgendaList` writes
`gff.bookmarks.v1` to `localStorage`; `MyPlan` reads it, groups by day, and flags
overlaps. Invite-only sessions cannot be saved. **§7 changes where this lives** — that is
the only reason it appears here.

### Out of scope

- Attendee-to-attendee messaging, meeting requests, or calendars. `/people` exists and is
  consent-gated (`consentPublic`); it stays a directory.
- Fuzzy org matching beyond the normalisation above.
- Any claim that a partner "hosts" or "sponsors" a session — the data does not say so.

---

## 7. Journey 5 — The login-gated AI planning agent

> **Goal:** "I'm a Series-A lending startup founder looking for a bank partner and a
> credit-risk vendor. Given three days and 256 sessions, tell me who to meet and what to
> attend — and let me keep that plan."

This is the journey the user called essential. It is also the one with the highest risk of
quietly breaking rules 1, 3 and 5, so the spec is deliberately conservative about what the
model is allowed to do.

### 7.1 What already exists, and why it is the foundation

`app/lib/match.ts` is a **deterministic grounded matcher**. It calls no model. It
tokenises the objective, strips self-description noise (`QUERY_NOISE`: "company",
"looking", "partner", "founder"…), scores weighted fields, and returns each hit with a
`why` containing **only terms that literally occur in both the objective and the record**,
plus the field they were found in. Its own header states the point: *"there is no path by
which a rationale can be invented — the honesty rule is enforced by construction rather
than by instruction."* It already excludes closed-door sessions and already drops weak
matches instead of padding them.

`/api/match` layers the hybrid retriever (`lib/retrieval.ts`, BM25 + dense) on top for
recall, and is careful to report *which terms matched* rather than writing a
justification. It also reports `degraded` when the dense channel is unavailable.

**An LLM that re-ranks or re-explains these results throws that guarantee away.** So:

### 7.2 The layering rule

```
objective (profile.lookingFor + interests)
        │
        ├─► match()            deterministic, grounded, closed-door-free
        ├─► retrieve() ×3      recall boost (speaker / session / partner)
        │
        ▼
   CANDIDATE SET  — every item carries {id, record, why.terms[], why.fields[]}
        │
        ▼
   SCHEDULER      — deterministic code, no model:
                    · drop invite-only (already gone, asserted again)
                    · resolve time overlaps via overlaps() in content.ts
                    · cap ~3–4 sessions/day, spread across days
                    · prefer higher score, then earlier start
        │
        ▼
   NARRATOR (LLM) — optional, constrained:
                    · INPUT: only the scheduled items + their why.terms
                    · OUTPUT: ordering prose + one outreach note per person
                    · may NOT introduce an entity, a fact, or a reason
        │
        ▼
   VALIDATOR      — deterministic, mandatory:
                    · every entity id must exist in the candidate set → else drop
                    · every quoted term must be in that item's why.terms → else drop
                    · run the RX_BOOTH_ID / RX_HALL_ID guard over all prose
                    · if the narrator fails or GEMINI_API_KEY is absent → ship the
                      deterministic plan with reason() strings, unchanged
```

**The plan is valid without the model.** The narrator is a presentation layer over a plan
that is already correct. That is what makes this safe to ship: the degraded path is the
grounded path. This mirrors how `/api/chat` already returns 503 rather than guessing when
`GEMINI_API_KEY` is missing.

The narrator's only genuinely additive output is the **outreach note** — "you both work on
X" phrasing built from the intersection terms. Even that is constrained to terms already
in `why.terms`.

### 7.3 Login and profile tie-in

- Login is `app/lib/session.ts`: a `gff_email` cookie, unverified, **explicitly not a
  security boundary** ("identifies a browser, not a person"). Do not gate anything
  sensitive on it and never label a plan "verified".
- The objective already exists on the profile: `Profile.lookingFor` (free text) plus
  `interests[]`. `/api/profile` GET *already* concatenates them and runs `match(objective, 5)`
  — the planner is an extension of a code path that is live today, not a new one.
- **`/plan` requires login** because it writes. The unauthenticated equivalent is the
  existing `/ask` + `Matcher` flow, which needs no account and stores nothing. That
  distinction should be visible in the UI: "sign in to keep this plan".
- If `MONGODB_URI` is unset, `PROFILES_ENABLED` is false and `/api/profile` returns 503.
  `/plan` must degrade the same way: run the plan, render it, and say **"Sign-in is
  unavailable on this deployment, so this plan can't be saved."** — not fail.

### 7.4 Persistence — reconciling Atlas vs localStorage

This is the real architectural decision in this journey, and today the two halves
contradict each other:

| | Where | Who | Survives |
|---|---|---|---|
| My Plan (saved sessions) | `localStorage["gff.bookmarks.v1"]` | anonymous | this browser only |
| Profile | Atlas `profiles` collection | logged-in email | anywhere |

`MyPlan` tells the user, correctly, that "saved sessions live in this browser only — no
account, no server, nothing shared." A logged-in agent-generated plan cannot live there
and still be a plan the attendee keeps.

**Recommended resolution — additive, not a migration:**

1. localStorage stays the **anonymous** store and keeps working exactly as it does. It is
   the offline-safe path at a venue with bad wifi, and that is a feature.
2. Add a **`plans` collection in Atlas**, alongside `profiles`, in `app/lib/profiles.ts`
   (the only file allowed to touch Mongo). One document per email:
   ```
   { email, slug, objective, generatedAt,
     sessions: [agendaCode],          // codes only — never a copy of the session
     people:   [speakerNameKey],
     partners: [partnerSlug],
     source: "agent" | "manual",
     why: { [id]: { terms[], fields[] } }   // the grounded rationale, stored as data
   }
   ```
   **Store identifiers, never denormalised content.** A rebuilt static dataset must not
   leave stale session titles or, worse, a stale description, sitting in Atlas. Every
   render resolves ids through `content.ts`. An id that no longer resolves is dropped with
   a visible note, not rendered from a cached copy.
3. On login, if localStorage holds bookmarks and the account has no plan, offer a **merge**
   ("You have 6 sessions saved in this browser — add them to your account?"). Explicit,
   never silent.
4. When logged in, `/my-plan` reads Atlas and mirrors to localStorage for offline read.
   Atlas is the source of truth for a logged-in user; localStorage is a cache plus the
   anonymous store.
5. Deleting the profile (`remove()`, one-click, already implemented) must delete the plan
   too. Add it to that path — a plan is user-generated data and belongs to the same
   consent lifecycle.

Conflict policy across two browsers is **Decision D2**.

### 7.5 Routes

| Route | Status | Render | Notes |
|---|---|---|---|
| `/plan` | **new** | dynamic, login-gated | objective input → generated plan |
| `/api/plan` | **new** | `runtime = "nodejs"`, `force-dynamic` | matcher + scheduler + optional narrator + validator |
| `/my-plan` | exists | becomes login-aware | Atlas when signed in, localStorage otherwise |
| `/api/match` | exists | unchanged | stays the anonymous, ungated path |
| `/profile` | exists | gains "used to build your plan" framing on `lookingFor` | |

### 7.6 `/plan` — bindings and empty states

| Block | Source | Empty state |
|---|---|---|
| Objective | `profile.lookingFor` + `interests[]`, editable inline | If both empty: prompt for the objective before generating. Do not generate from nothing |
| No matches | `match()` returns nothing above `MIN_SCORE` | **"Nothing at GFF 2026 matched what you described closely enough to recommend."** Plus the terms we searched for, so the user can rephrase. **Never** fall back to "here are some popular sessions" — an ungrounded recommendation is exactly what the matcher was built to prevent |
| Who to meet | speaker recs | Each with `reason(why)`. LinkedIn only where present (199/487). For the 142 with no session: **"No session listed — you won't find them on the agenda."** That is useful information, not a defect to hide |
| Orgs to visit | partner recs | Sector from `sectors-2026.json`; "no use cases published" for the 108. **No booth, no hall, no location, no "find them at".** The CTA is their website (292/316) or nothing |
| What to attend | scheduled sessions | Grouped by day with times and hall. Overlaps already resolved by the scheduler; any residual clash flagged as `MyPlan` does today |
| Invite-only | — | **Never present.** Asserted twice: `match()` filters, the scheduler re-asserts. If the agent's plan ever contains one, that is a bug, and the validator drops it |
| Retrieval degraded | `/api/match`'s `degraded` flag | Surface it: "Semantic search is unavailable right now; these results are keyword-matched only." Do not silently serve a weaker plan as if it were the full one |
| Coverage footer | `MatchResult.coverage` | Already computed. State what the plan could not see: 108 partners without use cases, 25 without descriptions, 62 speakers without bios, 20 sessions without descriptions, 34 invite-only excluded |

### 7.7 Out of scope

- Contacting anyone. No email, no meeting request, no calendar invite. We have no verified
  contact data and the login is not a verified identity.
- Attendee-to-attendee matching beyond the existing consent-gated `/people`. A plan that
  recommends *other attendees* is a different consent question and should not be smuggled
  in through this journey.
- The model choosing *which* records exist. It ranks and narrates a fixed candidate set;
  it never retrieves.
- Any plan item without a grounded `why`.

---

## 8. What this plan does not attempt, and why

| Wanted | Why not |
|---|---|
| Exhibitor floor map / booth finder / "near you" | GFF published no 2026 floor plan. The data is null and the ban is enforced in four places. Not a build task — a data impossibility |
| Partner → session programme | No such field exists. The only bridge is org-name matching through speakers (81/316 partners), which supports "people from this org are speaking" and nothing stronger |
| Track-based browsing | 86 nulls, 169 distinct values across 170 sessions. §2.1 |
| A page per topic (all 346) | 270 topics have exactly one session. §2.3 |
| Category chips from `partner.category` | 61.7% is `"other"`. Replaced by `rag/sectors`. §2.2 |
| LinkedIn-first networking | 40.9% coverage. Would be a dead button on 288 of 487 pages |
| Attendee↔attendee introductions | Consent model supports a directory, not brokering |

---

## 9. Dependency-ordered build sequence

**Stage 0 — data wiring (blocks almost everything)**
1. Extend `app/sync-data.sh` to vendor `rag/sectors/sectors-2026.json` (and
   `coverage.json`) into `app/data/`. Build-time copy only; static-first is preserved.
2. Add `SECTORS` to `app/lib/content.ts`: a name-keyed lookup plus `sectorFor(partner)`.
   The join is exact on `name`, verified 316/316. Add `partnersBySector()` and a
   `TOPICS_WITH_COUNTS` export filtered at ≥2.
3. Add the build-time org→partner index (§6) — exact plus the defined normalisation, no
   substring matching.

**Stage 1 — exhibitor depth** (needs 0.1, 0.2)
4. `/exhibitors/[slug]` × 316.
5. Swap the directory's Sector chips from `category` to the real sector taxonomy.
6. `/exhibitors/sector/[sector]` × 24, and the single `/exhibitors/tier` overview
   (**blocked on D1** only for the named-tier URLs; the overview page is not blocked).

**Stage 2 — at-the-fest navigation** (independent of stages 0–1; can run in parallel)
7. `/halls` + `/halls/[hall]` × 17.
8. `/agenda/grid` — and drop the 169-value track filter from `AgendaList`.
9. `/now` — client-side clock, IST-pinned, out-of-window state. Ship last in this stage;
   it is the most testable-by-hand and the easiest to get subtly wrong.

**Stage 3 — topics** (needs 0.2)
10. `/topics` index with the "86 sessions unreachable" disclosure.
11. `/topics/[topic]` × 76, sessions + speakers rails.
12. The derived partner rail via `contentTerms` + `scoreFields`, with its coverage footer.

**Stage 4 — networking cross-links** (needs 0.3, and 1.4 for the outbound link to land)
13. Org link on `/speakers/[slug]` for the 130; explicit no-session state for the 142;
    LinkedIn demoted to secondary.
14. "People from this organisation" on the 81 eligible partner pages.

**Stage 5 — the planning agent** (needs 0.2 for sectors on plan cards; 4 for the
person→org links inside the plan; benefits from 2 for the day view)
15. `plans` collection + read/write/delete in `app/lib/profiles.ts`; wire delete into the
    existing `remove()` path.
16. `/api/plan`: `match()` + `retrieve()` → candidate set → deterministic scheduler →
    grounded plan. **Ship this without the LLM first and verify it end to end.**
17. `/plan` UI, login-gated, with the no-match and degraded states.
18. `/my-plan` becomes login-aware; localStorage→Atlas merge prompt on login.
19. **Only then** the narrator + validator. It is additive and removable; if the validator
    ever trips in testing, the deterministic plan is already the shipped product.

**Cross-cutting, do throughout**
20. A test asserting no partner-facing component renders `hall`, and no partner route
    imports a hall helper (rule 2's most likely accidental breach — §4).
21. A test asserting no invite-only session reaches `/api/plan`'s response.
22. Extend `rag/corpus/verify_corpus.py`'s spirit to the new routes: the four product
    rules should fail the build, not a review.

---

## 10. Decisions needed from the user

**D1 — the "Beer Booth Partner" tier URL.**
One of the 20 tier strings contains the word *Booth*. It is a sponsorship name, not a
location, and it already renders as a filter chip in the directory today. Minting
`/exhibitors/tier/beer-booth-partner` puts "booth" into a URL on a site whose policy is
that booth data does not exist here.
*Recommendation:* do not mint a URL for it. It falls into the "named partnerships"
list-row treatment anyway (§3), so no page is lost. Confirm.

**D2 — plan conflict policy across devices.**
If a logged-in attendee saves sessions on a laptop and then on a phone, what wins?
*Recommendation:* last-write-wins on the whole document, with the merge prompt only at
first login. Set-union is friendlier but makes a removal on device A silently reappear
from device B, which is worse. Confirm, or ask for per-item timestamps (more storage, more
code).

**D3 — should the narrator ship at all?**
The deterministic plan is complete and honest on its own. The LLM adds ordering prose and
an outreach note, and adds the only fabrication risk in the system.
*Recommendation:* build stages 15–18 first, look at the real output, then decide. This
document assumes the narrator is optional and gated behind the validator either way.

**D4 — topic threshold.**
This plan draws the line at ≥2 sessions (76 pages). ≥3 would give 23 much denser pages;
≥1 would give 346, of which 270 are single-row.
*Recommendation:* ≥2. Confirm, or set a different line.

**D5 — the `/now` clock zone.**
Pinned to IST (UTC+05:30) rather than device-local, so an international attendee's phone
does not show an empty festival. Confirm that is the intent.

---

*Every count in this document was measured from `data/2026/partners-2026.json`,
`speakers-2026.json`, `sessions-2026.json`, and `rag/sectors/sectors-2026.json` in this
repository. Where a figure differs from the original brief, the measured value is used and
the difference is called out inline.*
