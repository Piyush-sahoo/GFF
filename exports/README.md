# GFF — CSV exports

**2026** (`export.mjs`, from MongoDB Atlas) and **2024 / 2025 archive**
(`export-archive.mjs`, from JSON on disk). Every year now has the same three
sheets — **speakers, exhibitors, sessions** — plus
[`orgs-by-year.csv`](#orgs-by-yearcsv--713-rows), the cross-year roll-up.
Jump to [the archive years](#2024--2025-archive-exports).

> **These sheets are speakers, partners and exhibitors — not attendees.**
> GFF publishes no attendee or delegate list for any edition, and none has been
> inferred. See [What "attendee" does and does not mean](#what-attendee-does-and-does-not-mean).

---

## 2026 exports

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

The 2024/2025 archive files have their own scripts and need no credentials — see
[Reproducing the archive exports](#reproducing-the-archive-exports).

---

# 2024 / 2025 archive exports

Seven CSVs built from JSON on disk by `export-archive.mjs` — the same three
sheets 2026 has, for both archive years, plus the cross-year roll-up. **No
database is involved**; the archive years are never loaded into MongoDB, and must
not be.

| File | Rows | Columns | Source |
|---|---:|---:|---|
| `speakers-2025.csv` | **993** | 14 | `data/archive-2025/speakers-2025.json` |
| `exhibitors-2025.csv` | **399** | 16 | `data/archive-2025/partners-2025.json` |
| `sessions-2025.csv` | **391** | 20 | `data/archive-2025/sessions-2025.json` |
| `speakers-2024.csv` | **841** | 15 | `data/archive-2024/speakers-2024.json` |
| `exhibitors-2024.csv` | **371** | 14 | `data/archive-2024/partners-2024.json` |
| `sessions-2024.csv` | **338** | 21 | `data/archive-2024/sessions-2024.json` |
| `orgs-by-year.csv` | **713** | 16 | all three years, folded by canonical org |

Side by side with 2026: **speakers** 841 / 993 / 487 · **exhibitors** 371 / 399 /
316 · **sessions** 338 / 391 / 256, for 2024 / 2025 / 2026.

Same format guarantees as the 2026 files: UTF-8 with BOM, RFC4180 quoting, CRLF,
`;`-joined multi-values, and **empty stays empty**. `verify-archive.mjs` re-parses
every file with a strict RFC4180 reader and compares each cell back to the source
JSON — 0 mismatches, 0 orphans, 0 missing rows, 0 placeholder cells.

Every archive row carries `year`, `sourceUrl` and `extractedAt`, populated on
100% of rows in all four per-year files.

## What "attendee" does and does not mean

The ask was for "a list of attendees for the 2025 and 2024 events".

**GFF publishes no attendee or delegate list — for any edition.** There is no
public roster of who bought a ticket and walked the floor, and none has been
reconstructed, inferred, or assembled from press coverage. What GFF does publish,
and what these files contain, is:

* **speakers** — everyone on the published speaker directory, with role, org,
  country, LinkedIn and bio where the CMS carries them;
* **partners, exhibitors, supporters and ecosystem organisations** — every
  organisation with a paid or listed presence at the event.

For an outreach cadence that targets *organisations*, this is the useful set and
in practice the one the 2026 pipeline produces too. It is not a headcount of
who attended.

## Provenance — where each year came from

| Year | Source | Fetched | Structure |
|---|---|---|---|
| 2026 | `https://www.globalfintechfest.com/{speakers,partners,agenda}` | see `export-audit.json` | Next.js RSC flight payload |
| 2025 | `https://2025.globalfintechfest.com/{speakers,partners,agenda}` | **2026-08-25** | Next.js RSC flight payload |
| 2024 | `https://archive.globalfintechfest.com/2024/api/{speakers-category-a,speakers-category-b,partners}` | **2026-08-25** | Drupal REST-export JSON |

All three are parsed from the site's **own structured data**, never from rendered
text. `extractedAt` on every row records the fetch above.

### Was 2024 retrievable? Yes.

`2024.globalfintechfest.com` has no DNS record, so the 2024 edition looks gone.
It is not: it was folded into `archive.globalfintechfest.com` under a `/2024/`
path prefix, running the pre-2026 Drupal stack. That stack publishes the views
behind the speaker and partner pages as REST-export endpoints returning the same
records the pages render from:

```
/2024/api/speakers-category-a     58 rows   dignitaries / headline speakers
/2024/api/speakers-category-b    787 rows   the main speaker directory
/2024/api/partners                         partners 90 · exhibitors 319 ·
                                           supporters 33 · organizers 3
                                           (gff_friends and fintech_friends: empty)
/2024/api/agenda                 338 rows   the full session listing
```

Checked before relying on them:

* **Not truncated.** `?page=1` returns byte-identical output to page 0, so the
  endpoints carry no pager. The *rendered* `/2024/speakers` page **is** paged
  (78 cards on page one of ~845), which is exactly why it is not the source.
* **Genuinely 2024, not the archive root.** The archive root is the Drupal build
  of the **2025** edition (superseded by the Next.js `2025.globalfintechfest.com`
  site). The `/2024/` payload is a distinct dataset — different records,
  logo filenames stamped `-2024xxxx`.
* **JSON:API is not usable.** `/2024/jsonapi` is mounted but returns
  "insufficient authorization" for anonymous callers, so it could not serve as an
  independent cross-check.

The Wayback Machine was therefore never needed.

`/2024/agenda` has its own endpoint on the same stack and supplies
`sessions-2024.csv` and the session linkage on 2024 speakers (769 of 841 map to at
least one session).

## Row counts, and what changed on re-scrape

The 2025 JSON on disk was extracted **2026-08-12** and had drifted from what the
live site exposes. `gff_archive_2025.py` re-fetched it. Nothing regressed —
every previously committed row is still present — and a lot was recovered:

| | committed 2026-08-12 | after re-scrape | change |
|---|---:|---:|---|
| speakers | 993 | **993** | same people; **+618 bios, +626 LinkedIn, +634 country, +993 headshots, +856 session links** — all of these columns were previously absent entirely |
| partners/exhibitors | 399 | **399** | same orgs; `sourceGroup` recovered (was dropped), `alsoListedIn` added |
| sessions | 0 | **391** | see below |

**`sessions-2025.json` was recorded as 0 rows** with the note "GFF did not publish
a 2025 agenda in retrievable form". **That is no longer true** —
`2025.globalfintechfest.com/agenda` now carries a full `rawAgendaData` payload of
391 sessions. They are exported as `sessions-2025.csv` and also give 2025 speakers
their `sessionTitle` / `sessionCodes`.

## Column deltas vs. the 2026 exports

Columns are as close to `speakers-2026.csv` / `exhibitors-2026.csv` as each
year's source allows. Nothing is padded with empty filler.

**Dropped from both archive years** (Atlas bookkeeping with no archive
equivalent): `lastSeenAt`, `status`, `recordId`.

**Speakers**

| Column | 2026 | 2025 | 2024 | Why |
|---|:-:|:-:|:-:|---|
| `name` `title` `org` `country` `bio` `linkedin` `headshotUrl` `nameKey` | ✅ | ✅ | ✅ | |
| `sessionTitle` `sessionCodes` | ✅ | ✅ | ✅ | 856/993 for 2025, 769/841 for 2024 |
| `speakerCategory` | — | ✅ | ✅ | GFF's own speaker tiering; not carried in the 2026 export |
| `sourceApi` | — | — | ✅ | 2024 only, where `sourceUrl` is the human page and the data came from a separate endpoint |

**Exhibitors**

| Column | 2026 | 2025 | 2024 | Why |
|---|:-:|:-:|:-:|---|
| `name` `slug` `tier` `sourceGroup` `category` `website` `logoUrl` `isDataArtifact` | ✅ | ✅ | ✅ | |
| `canonicalName` | — | ✅ | ✅ | the `gff_identity.canonical_name()` spelling, so the fold used by `orgs-by-year.csv` is visible per row |
| `alsoListedIn` | — | ✅ | ✅ | other listings the same org appears under (115 rows in 2025, 73 in 2024) |
| `whatTheyDo` `useCases` + all `_method` / `_sourceUrl` / `_fetchedAt` / `_writer` / `_note` provenance columns | ✅ | — | — | **omitted, not blank.** GFF's partner payload carries no description field in either archive year, so every traced column would be 100% empty |
| `whatTheyDo_unsourced` `useCases_unsourced` `unsourced_confidence` | ✅ | ✅ | — | 2025 only — see next section |
| `aliases` `confidence` `confidenceScore` `confidence_*` `logoUrl_*` | ✅ | — | — | produced by the 2026 enrichment pass, which never ran on the archive years |

### The 2025 unsourced columns

The 2025 snapshot on disk carried a `whatTheyDo` and `useCases` on 64 and 50 rows.
**These were model-written with no provenance recorded** — the GFF partners page
they cite supplies only logos, names, tiers and links, and cannot be the origin of
descriptive prose. Under the repo's rule that traced and unsourced text never
share a column, they are exported as `whatTheyDo_unsourced` /
`useCases_unsourced`, with the record's `confidence` alongside as
`unsourced_confidence` on those 64 rows only. **There is no traced `whatTheyDo`
column for 2025**, because there is no traced description. Treat these as leads,
not facts.

## Coverage

**`speakers-2025.csv` — 993 rows**

| Column | Populated |
|---|---|
| `name` `title` `headshotUrl` `speakerCategory` `nameKey` `year` `sourceUrl` `extractedAt` | **993 / 993** |
| `org` | 986 / 993 |
| `sessionTitle` `sessionCodes` | 856 / 993 (137 speakers map to no published session) |
| `country` | 634 / 993 |
| `linkedin` | 626 / 993 |
| `bio` | 618 / 993 |

**`speakers-2024.csv` — 841 rows** (845 source rows; 4 are the same person listed
in both categories, folded on `nameKey`, keeping the richer row)

| Column | Populated |
|---|---|
| `name` `title` `speakerCategory` `nameKey` `year` `sourceUrl` `sourceApi` `extractedAt` | **841 / 841** |
| `org` | 839 / 841 |
| `headshotUrl` | 839 / 841 |
| `country` | 815 / 841 |
| `linkedin` | 739 / 841 |
| `bio` | 695 / 841 |

2024 has *better* bio and LinkedIn coverage than 2025 (83% / 88% vs 62% / 63%) —
the older Drupal CMS asked speakers for more.

**`exhibitors-2025.csv` — 399 rows** (514 listings; 115 are an org appearing under
more than one heading, folded on name with the extra headings in `alsoListedIn`)

| Column | Populated |
|---|---|
| `name` `canonicalName` `slug` `tier` `sourceGroup` `category` `logoUrl` `isDataArtifact` `year` `sourceUrl` `extractedAt` | **399 / 399** |
| `website` | 360 / 399 |
| `alsoListedIn` | 115 / 399 |
| `whatTheyDo_unsourced` `unsourced_confidence` | 64 / 399 |
| `useCases_unsourced` | 50 / 399 |

`sourceGroup`: `Exhibitors` 225 · `Partners` 138 · `Ecosystem` 23 · `Supporters` 13.

**`exhibitors-2024.csv` — 371 rows** (445 listings → 371 orgs: 73 are an org
cross-listed under a second heading, and one — `ET Now` — is listed twice under
`supporters` by the CMS itself)

| Column | Populated |
|---|---|
| `name` `canonicalName` `slug` `tier` `sourceGroup` `category` `logoUrl` `isDataArtifact` `year` `sourceUrl` `sourceApi` `extractedAt` | **371 / 371** |
| `website` | 253 / 371 |
| `alsoListedIn` | 73 / 371 |

`sourceGroup`: `exhibitors` 247 · `partners` 90 · `supporters` 32 · `organizers` 2.
Group names are verbatim from each CMS, which is why 2024 is lower-case and 2025
is capitalised. The 247 exhibitors carry no tier in the 2024 CMS, so `tier` falls
back to `Exhibitor` — derived from the listing, the same way the 2026 extractor
does it, not published by GFF.

**No booth or stall column in any archive file**, for the same reason as 2026:
GFF publishes no floor plan, for any year. `booth` and `boothSource` are `null`
on all 371 and 399 archive partner records and are not exported.

**No `isDataArtifact = true` rows exist in either archive year** — the CMS logo
placeholders that affect 2026 (`PCI logo`, `NPCI logo`, `FCC logo`) are not present
in the 2024 or 2025 payloads. The filter is applied regardless, so it stays correct
if a re-scrape ever picks one up. Both counts are therefore unfiltered totals.

### Sessions

**`sessions-2025.csv` — 391 rows**

| Column | Populated |
|---|---|
| `agendaCode` `title` `day` `startTime` `endTime` `hall` `level` `format` `documentId` `year` `sourceUrl` `extractedAt` | **391 / 391** |
| `description` | 326 / 391 |
| `speakerNames` `speakersWithTitles` | 354 / 391 |
| `track` `topics` | 247 / 391 |
| `hostNames` `hostsWithTitles` | 193 / 391 |
| `subHall` | 76 / 391 |

Days: `2025-10-07` 159 · `2025-10-08` 179 · `2025-10-09` 53.

**`sessions-2024.csv` — 338 rows**

| Column | Populated |
|---|---|
| `agendaCode` `title` `day` `startTime` `endTime` `hall` `format` `accessType` `isClosedDoor` `year` `sourceUrl` `sourceApi` `extractedAt` | **338 / 338** |
| `hostNames` `hostsWithTitles` | 228 / 338 |
| `speakerNames` `speakersWithTitles` | 270 / 338 |
| `track` `topics` | 215 / 338 |
| `description` | 66 / 338 |
| `subHall` | 64 / 338 |

Days: `2024-08-28` 120 · `2024-08-29` 149 · `2024-08-30` 69.
Access: `public` 322 · `invite-only` 16.

#### Session column deltas

| Column | 2026 | 2025 | 2024 | Why |
|---|:-:|:-:|:-:|---|
| `agendaCode` `title` `day` `startTime` `endTime` `hall` `format` `track` `topics` `description` `speakerNames` `speakersWithTitles` `hostNames` `hostsWithTitles` | ✅ | ✅ | ✅ | |
| `accessType` `isClosedDoor` | ✅ | — | ✅ | **2025 publishes no session access type at all.** Emitting `isClosedDoor = false` would assert all 391 sessions were open to everyone, which GFF never said — so both columns are omitted for 2025 rather than defaulted |
| `subHall` | — | ✅ | ✅ | published for both archive years; 2026 has no equivalent field |
| `level` | — | ✅ | — | venue floor (`Ground Level`, `Level 1–3`); only the 2025 CMS publishes it |
| `documentId` | ✅ | ✅ | — | 2024 has only its numeric node id, already used as `agendaCode` |
| `status` `withdrawnDetectedAt` `lastSeenAt` `recordId` | ✅ | — | — | withdrawal tracking and Atlas bookkeeping; both are products of the live 2026 refresh loop, which never ran on a past edition |

Two things to know when reading the session sheets:

**`agendaCode` is not the same kind of value each year.** 2026 publishes a real
agenda code (`A0900`). 2025 publishes a numeric code (`20250411`). 2024 publishes
none, so its CMS node id (`29884`) is used — unique across all 338 rows and
therefore a valid join key for `sessionCodes`, but not a code GFF ever showed
anyone.

**`startTime` / `endTime` are verbatim per edition.** 2024 is 24-hour (`10:00`),
2025 and 2026 are 12-hour (`10:00 AM`). Neither is reformatted.

## `orgs-by-year.csv` — 713 rows

**The most useful file here for the cadence.** One row per canonical organisation
across all three editions, so an org that keeps coming back is visible at a glance.
Sorted by `yearCount` descending, so the strongest targets are at the top of the sheet.

| | Orgs |
|---|---:|
| present in **all three** years (2024 + 2025 + 2026) | **105** |
| present in **two** years | **157** |
| present in one year only | 451 |
| **total canonical orgs** | **713** |
| — of which listed in 2024 | 368 |
| — of which listed in 2025 | 396 |
| — of which listed in 2026 | 316 |

(368 + 396 + 316 = 1,080 listings folding into 713 orgs. The per-year figures are
lower than the per-year CSV row counts — 371 and 399 — because a few orgs inside a
single year fold together under two spellings.)

### How organisations are folded

Identity comes from `pipeline/gff_identity.py`, the same module the 2026 dedupe
uses: `canonical_name()` applies the agreed spellings and `company_keys()`
supplies the match keys, union-found so a chain of spellings ends in one cluster.
That is what makes `ElevenLabs` / `Eleven Labs` and `HDFC` / `HDFC Bank ` one row.
Rows flagged `isDataArtifact` are dropped.

**The fold is auditable from the sheet.** Every raw spelling that went into a row
is listed in `aliases` (121 rows have one). `orgs-by-year.json` additionally records
the exact per-year spelling as `name2024` / `name2025` / `name2026`; those are kept
out of the CSV to stop it sprawling, and `exhibitors-<year>.csv` shows the same thing
against the full per-year record. The widest folds in the
current data are all legitimate legal-suffix or short-form pairs
(`Juspay` ← `Juspay Technologies Pvt Ltd`, `Citi` ← `Citi Bank`,
`Pine Labs` ← `Pinelabs`); all 17 folds below 55% string similarity were checked
by hand and none is a false merge.

### Column dictionary — orgs-by-year

| Column | Meaning |
|---|---|
| `org` | Canonical name — the most recent edition's spelling, so it matches the 2026 corpus |
| `aliases` | Every other spelling folded into this row (`;`-joined) |
| `yearCount` | 1, 2 or 3 — how many editions this org appeared in |
| `years` | Which ones, e.g. `2024;2026` |
| `returning` | `true` when `yearCount > 1` — the quick filter for the cadence |
| `in2024` / `in2025` / `in2026` | `true` / `false` presence per edition |
| `tier2024` / `tier2025` / `tier2026` | Sponsorship tier that year (`;`-joined if the org held more than one) |
| `group2024` / `group2025` | Which listing it came from that year |
| `category` | Sector classification |
| `website` | First website on record across the years |
| `otherWebsites` | Any different URLs the other years carried (104 rows) — a changed domain is worth knowing before a cold call |

There is **no `group2026` column**: `sourceGroup` is added to a partner record by
a later pipeline step and lives only in Atlas, not in
`data/2026/partners-2026.json`, which is what this roll-up reads. An always-empty
column would read as "2026 had no listings" rather than "the field is not in this
file". `tier2026` is populated 316/316.

## Reproducing the archive exports

```bash
python3 pipeline/gff_archive_2024.py   # -> data/archive-2024/*.json   (network)
python3 pipeline/gff_archive_2025.py   # -> data/archive-2025/*.json   (network)
python3 pipeline/orgs_by_year.py       # -> exports/orgs-by-year.json
node    exports/export-archive.mjs     # -> the five CSVs + export-archive-audit.json
node    exports/verify-archive.mjs     # independent read-back, exits non-zero on failure
```

No credentials, no database. Both scrapers are re-runnable and idempotent: the
2025 merge is top-up-only and will not regress a committed row, and the 2024
fetches are cached under `pipeline/.cache/` (gitignored) so a re-run does not
re-hit the site — delete that directory to force a fresh fetch.

`export-archive-audit.json` holds the machine-readable counts behind every figure
in this section.

## Known gaps

1. **No attendee list, for any year.** Restating it because it was the literal ask:
   GFF does not publish one. Speakers + orgs is the complete public set.
2. **2024 agenda speaker strings are free text, and 17 of 993 entries are not
   people.** The 2024 CMS stores each agenda speaker as up to three consecutive
   chunks of one string (`note` + `name` + `info`); those are rejoined in the order
   and with the spacing GFF's own page renders, verified against the live page. The
   original almost certainly had a hyphen at the seam (`Global Co-Head` reads as
   `Global Co Head`), but that character is not in the payload and GFF's page loses
   it too, so it is not guessed back. `speakerNames` takes the first comma segment,
   the same rule the 2026 pipeline uses; on 17 entries that yields a label rather
   than a person (`Report Launch Building Bridges for the Next Decade of Finance`,
   and four rows where the CMS used `.` instead of `,` after the name). They are
   left in rather than filtered on a guess — `speakersWithTitles` always holds the
   full string. **88% of distinct agenda names match the 2024 speaker directory**;
   the other 12% are real people the directory simply does not list, which is why
   the agenda is not filtered against it.
3. **No 2023 / 2022 / 2021.** `archive.globalfintechfest.com` also carries `/2023/`,
   `/2022/` and `/2021/` paths. They were not investigated — the ask was 2024 and 2025.
4. **`speakerCategory` is not normalised across years.** 2024 says `Category A`,
   2025 says `Two - Category A`. Both are verbatim from their own CMS and are left
   that way rather than mapped onto an invented shared scale.
5. **No enrichment on the archive years.** No websites were resolved, no
   descriptions fetched, no confidence scored. `website` is whatever the GFF CMS
   published: 360/399 for 2025 and 253/371 for 2024.
6. **2024 `tier` for plain exhibitors is derived**, not published — see above.
7. **Unrelated 2026 defect, found while building this and deliberately not fixed
   here:** `data/2026/speakers-2026.json` stores a raw RSC row reference
   (`$32`, `$80`, …) instead of the bio text on **124 of 487** rows, and
   `sessions-2026.json` does the same on **5 of 256** descriptions. Those markers
   are in `speakers-2026.csv` and in the RAG corpus today. The cause is that
   `extract_speakers` / `extract_sessions` read the field without resolving the
   reference. `gff_extract.deref()` (added here, used by the 2025 path, which is
   why `speakers-2025.csv` has none) is the fix, but wiring it into the 2026 path
   means re-running the 2026 refresh and rebuilding the corpus — out of scope for
   an archive-export change, and worth its own PR.
