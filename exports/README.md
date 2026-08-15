# GFF 2026 — CSV exports

Three CSVs exported from the **MongoDB Atlas `gff` database** (the deduped, enriched,
provenance-labelled state). The raw JSON scrape files on disk are pre-dedupe and were
deliberately **not** used.

| File | Rows | Columns | Expected | Match |
|---|---|---|---|---|
| `exhibitors-2026.csv` | **316** | 42 | 316 | ✅ |
| `speakers-2026.csv` | **487** | 15 | 487 | ✅ |
| `sessions-2026.csv` | **256** | 23 | 256 | ✅ |

All three counts match the expected figures exactly. Filter used: `year = 2026`
(30 further partner records carry `year = 2025` and are correctly excluded).

**Format:** UTF-8 **with BOM** (so Excel renders `Johannes Lamsfuß`, `₹`, `’` correctly on
open — no import wizard needed), RFC4180 quoting, CRLF line endings. Fields containing
commas, quotes or newlines are quoted and inner quotes doubled. Verified by parsing the
files back with a strict RFC4180 parser: no ragged rows, no bare line breaks, every value
byte-identical to Atlas.

**Multi-value fields are joined with a semicolon (`;`)** — `aliases`, `useCases`, `topics`,
`speakerNames`, `hostNames`, `sessionCodes`. No underlying value contains a semicolon, so the
split is unambiguous and reversible.

---

## Read this before you use the blanks

**Empty means empty.** No cell contains `N/A`, `Unknown`, `TBD`, `-` or a guess. A blank cell
means *the data does not exist in the source*, not that the export dropped it. The coverage
tables below tell you exactly how many blanks to expect in each column, so you can tell
"missing data" from "missing export" at a glance.

**There is no booth / stall column, by design.** GFF has not published partner booth
locations. The Atlas `booth` and `boothSource` fields exist but are `null` on **all 316**
records — an empty column would only invite someone to start filling it in with guesses.
Session **`hall`** *is* legitimately published by GFF and **is** included in the sessions CSV
(populated 256/256).

---

## `exhibitors-2026.csv` — 316 rows

### Traced vs. unsourced text — the most important thing on this sheet

Some partner descriptions were obtained from a real, citable source (the company's own
homepage `<meta>` tag, a crawl of their site, or curated public facts). Others were written
by an earlier pipeline worker with **no provenance at all** — the GFF partners page they cite
only supplies logos, names and tiers, and cannot be the origin of descriptive prose.

The two are **never mixed in the same column**:

* **`whatTheyDo` / `useCases`** — traced values only. Safe to quote.
* **`whatTheyDo_unsourced` / `useCases_unsourced`** — the unverified variant, kept in its own
  clearly-named column. Treat as a lead, not a fact.

For **5 exhibitors** (Bank of India, Getepay, IppoPay, Safegold, Trackwizz) the *only*
description that exists is an unsourced one. Those rows have an **empty `whatTheyDo`** and the
text sits in `whatTheyDo_unsourced`, with `whatTheyDo_method = unsourced` to explain the gap.
Same rule for use cases, which affects **27 rows**. So:

> When `whatTheyDo_method` reads `unsourced`, the main `whatTheyDo` cell is deliberately
> blank and the prose is in `whatTheyDo_unsourced`. Nothing has been lost.

### Coverage — exhibitors (out of 316)

| Column | Populated | Notes |
|---|---|---|
| `name`, `slug`, `tier`, `sourceGroup`, `category`, `logoUrl`, `confidence`, `sourceUrl`, `extractedAt`, `lastSeenAt`, `status`, `year` | **316 / 316** | complete |
| `website` | **292 / 316** | 24 have no website on record |
| `whatTheyDo` (traced) | **291 / 316** | + 5 unsourced-only = 296 have some description; **20 have none at all** |
| `useCases` (traced) | **208 / 316** | + 27 unsourced-only = 235 have some list; **81 have none at all** |
| `whatTheyDo_unsourced` | **105 / 316** | unverified variants |
| `useCases_unsourced` | **105 / 316** | unverified variants |
| `aliases` | **20 / 316** | only where the CMS name differs from the company's own spelling (e.g. `Redhat` → `Red Hat`) |
| `confidenceScore`, `confidence_*`, `logoUrl_*` | **85 / 316** | numeric score and its provenance were only recorded for 85 records |
| `isDataArtifact` | 231 `false`, **85 blank** | flag predates 85 of the records; no record is `true` |

### How each description was obtained (`whatTheyDo_method`)

| Method | Rows | Meaning |
|---|---|---|
| `direct-meta-description` | 149 | our own fetch of the company's homepage `<meta name="description">` |
| `apify:apify/website-content-crawler` | 107 | Apify website-content-crawler over the company site |
| `curated-public-facts` | 35 | hand-curated from public facts |
| `unsourced` | 5 | no provenance — main column left blank, text in `whatTheyDo_unsourced` |
| *(blank)* | 20 | no description exists in any form |

`useCases_method`: `phrase-match:whatTheyDo` 202 · `curated-public-facts` 6 · `unsourced` 27 ·
blank 81. `useCases_basis` records which traced description the phrase-match was derived from.

### Column dictionary — exhibitors

| Column | Meaning |
|---|---|
| `name` | Partner/exhibitor name as published by the GFF CMS |
| `aliases` | Alternate/corrected spellings (`;`-joined) |
| `slug` | URL-safe identifier |
| `tier` | Sponsorship tier or `Exhibitor` (46 distinct values; 165 are plain `Exhibitor`) |
| `sourceGroup` | Which GFF listing it came from: `Exhibitors` 165, `Partners` 132, `Ecosystem` 12, `Supporters` 7 |
| `category` | Sector classification: `other` 158, `infra` 46, `payments` 35, `ai` 28, `banking` 16, `lending` 15, `regtech` 9, `wealthtech` 5, `insurtech` 3, `crypto` 1 |
| `website` | Company website |
| `logoUrl` | Logo image URL (GFF CMS S3) |
| `whatTheyDo` | **Traced** one-line description |
| `whatTheyDo_method` | How it was obtained — see table above |
| `whatTheyDo_variant` | `meta-description` or `homepage-body-text`, where recorded |
| `whatTheyDo_sourceUrl` | Page the text was actually read from |
| `whatTheyDo_fetchedAt` | When it was fetched (some rows read `earlier-in-this-session`, verbatim from source) |
| `whatTheyDo_writer` | Pipeline worker that wrote it, where recorded |
| `whatTheyDo_note` | Provenance caveat recorded against the description |
| `useCases` | **Traced** use cases (`;`-joined) |
| `useCases_method` / `_basis` / `_fetchedAt` / `_writer` / `_note` | Same provenance pattern for use cases |
| `whatTheyDo_unsourced` | Unverified description variant — **not** interchangeable with `whatTheyDo` |
| `useCases_unsourced` | Unverified use-case variant (`;`-joined) |
| `unsourced_method` / `_confidence` / `_writer` / `_note` | Provenance of the unsourced block (always `unsourced` / `low` / `scratch-2` / caveat text) |
| `confidence` | `medium` 263, `high` 35, `low` 18 — pipeline's own confidence in the record |
| `confidenceScore` | Original float (0–1) where preserved |
| `confidence_method` / `_originalValue` / `_thresholds` / `_note` | How the `high`/`medium`/`low` label was derived from the float |
| `logoUrl_method` / `_sourceUrl` | Provenance of the logo |
| `sourceUrl` | GFF page the record was scraped from |
| `extractedAt` / `lastSeenAt` | First extraction / last confirmed present on the GFF site |
| `status` | `active` for all 316 |
| `isDataArtifact` | CMS-artifact flag — see note below |
| `year` | 2026 |
| `recordId` | Atlas `_id`, for tracing a row back to the database |

---

## `speakers-2026.csv` — 487 rows

### Coverage — speakers (out of 487)

| Column | Populated |
|---|---|
| `name`, `title`, `org`, `headshotUrl`, `sourceUrl`, `status`, `year` | **487 / 487** |
| `country` | **453 / 487** (34 blank) |
| `bio` | **425 / 487** (62 blank) |
| `sessionTitle` | **356 / 487** (131 speakers are not yet mapped to a session) |
| `sessionCodes` | **356 / 487** (same 131) |
| `linkedin` | **199 / 487** (288 blank — the largest gap on this sheet) |

`sessionTitle` names one session even for the 5 speakers who appear in two; `sessionCodes`
carries the full list (`;`-joined) and is the reliable join key to
`sessions-2026.csv → agendaCode`. `nameKey` is the normalised dedupe key (lower-cased, honorifics
stripped) — all 487 are unique, so there are no duplicate people. `recordId` is the Atlas `_id`.

---

## `sessions-2026.csv` — 256 rows

### Coverage — sessions (out of 256)

| Column | Populated |
|---|---|
| `agendaCode`, `title`, `day`, `startTime`, `endTime`, `hall`, `format`, `accessType`, `isClosedDoor`, `sourceUrl`, `documentId`, `status`, `year` | **256 / 256** |
| `description` | **236 / 256** (20 blank) |
| `track`, `topics` | **170 / 256** (86 blank — always blank together) |
| `speakerNames` / `speakersWithTitles` | **143 / 256** (113 sessions have no speakers published yet) |
| `hostNames` / `hostsWithTitles` | **44 / 256** |
| `lastSeenAt` | **254 / 256** |
| `withdrawnDetectedAt` | **2 / 256** |

### Column dictionary — sessions

| Column | Meaning |
|---|---|
| `agendaCode` | GFF agenda code, e.g. `A0900` — join key for speaker `sessionCodes` |
| `title` | Session title |
| `day` | Date: `2026-09-09` (92), `2026-09-10` (93), `2026-09-11` (71) |
| `startTime` / `endTime` | 24-hour local time |
| `hall` | Published venue hall — 17 distinct (`Hall 103`, `Jasmine 3`, `The Grand Theatre`, …) |
| `format` | `Panel Discussion` 156, `Masterclass` 17, `Roundtable` 14, `Fireside Chat` 13, `Keynote Address` 12, + 21 more |
| `topics` | Topic tags (`;`-joined) |
| `track` | The same topics as one comma-joined string, exactly as GFF publishes it. Redundant with `topics` but kept verbatim — **use `topics` for filtering**, since one source value contains a stray trailing comma (`Algorithmic Trading,`) that `topics` preserves faithfully |
| `accessType` | `public` 222 / `invite-only` 34 |
| `isClosedDoor` | `true` for the same 34 invite-only sessions, `false` for 222 |
| `description` | Session abstract |
| `speakerNames` | Panellist names, `;`-joined — **excludes** hosts/moderators |
| `speakersWithTitles` | Same people with title and org, e.g. `Rohit Arora, Chief Executive Officer, Biz2X` |
| `hostNames` / `hostsWithTitles` | Moderators/hosts, kept separate from panellists |
| `status` | `active` 254, `withdrawn` **2** |
| `withdrawnDetectedAt` | When the session was detected as pulled from the agenda |
| `documentId` | GFF CMS document UUID |
| `recordId` | Atlas `_id` |

**Two sessions have been withdrawn** and are still included so the withdrawal is visible
rather than silently absent — filter `status = active` to plan around them:

* `A0762` — *The Rise of Intelligent Payment Ecosystems: Beyond Transactions to Growth Engines*
* `A0704` — *New Money Moments: Designing Payment Use Cases Beyond Checkout*

---

## Two things you should know about the source data

**1. The three CMS logo artifacts were already gone.** The brief asked to exclude the PCI, NPCI
and FCC logo artifacts by filtering on `isDataArtifact = true`. That filter was applied — and it
matched **zero records**, because a previous dedupe pass had already removed them from Atlas.
The count is therefore 316, not 313, and 316 is the correct expected figure. Two real
exhibitor records do carry similar *names* — `NPCI` and `PCI / FCC` — but both are flagged
`isDataArtifact = false`, i.e. previously assessed as genuine exhibitors. They are included.
Filtering by name instead of by the flag would have wrongly deleted two real exhibitors.

**2. One truncated source description.** `QistonPe`'s `whatTheyDo` is stored with wrapping
quotes and cut off mid-sentence (`…It is a product by "`). That is exactly what the source
`<meta>` tag contains; it is exported verbatim rather than silently trimmed or repaired.

## Reproducing

`export.mjs` regenerates all three CSVs from Atlas; `verify.mjs` re-parses them and
cross-checks every cell against the database. Credentials live in `.env` (mode 0600,
gitignored). `export-audit.json` holds the machine-readable counts behind every figure above.
