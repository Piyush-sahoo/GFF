# data/ — canonical records

This is the source of truth for the project. Everything downstream (the app's
vendored copy, the RAG corpus, the sector classification, the CSV exports) derives
from `2026/`.

## `2026/` — live data

| File | Rows | Notes |
|---|---:|---|
| `partners-2026.json` | 319 | **316 real partners** + 3 CMS logo artifacts flagged `isDataArtifact: true` (`FCC logo`, `NPCI logo`, `PCI logo`). Every consumer filters them out. |
| `speakers-2026.json` | 487 | 425 have a bio. |
| `sessions-2026.json` | 256 | 222 public, 34 invite-only. All 256 carry a `hall`. |
| `join-report-2026.json` | — | Speaker↔agenda join audit: 345/345 distinct agenda speaker names matched (a naive equality join matches 0). |

`booth` and `boothSource` are `null` on all 319 partner rows and must stay that
way — GFF publishes no floor plan for 2026. See the root README, "Hard product
rules".

## `archive-2025/` and `archive-2024/` — ARCHIVE, DO NOT USE

⚠️ **Historical only. Not loaded by the app, never enters the corpus, never
reaches the chatbot, and never loaded into MongoDB.** The concierge is a 2026-only
product; `verify_corpus.py` asserts every corpus chunk is `year: 2026` and that no
2025 file was copied into the build.

| File | Rows | Source | Fetched |
|---|---:|---|---|
| `archive-2025/speakers-2025.json` | 993 | `2025.globalfintechfest.com/speakers` | 2026-08-25 |
| `archive-2025/partners-2025.json` | 399 | `2025.globalfintechfest.com/partners` | 2026-08-25 |
| `archive-2025/sessions-2025.json` | 391 | `2025.globalfintechfest.com/agenda` | 2026-08-25 |
| `archive-2024/speakers-2024.json` | 841 | `archive.globalfintechfest.com/2024/api/speakers-category-{a,b}` | 2026-08-25 |
| `archive-2024/partners-2024.json` | 371 | `archive.globalfintechfest.com/2024/api/partners` | 2026-08-25 |

Kept for year-over-year comparison of the exhibitor and speaker sets, and as the
input to the outreach CSVs in `exports/` (`speakers-2024.csv`,
`exhibitors-2024.csv`, `speakers-2025.csv`, `exhibitors-2025.csv`, and the
cross-year `orgs-by-year.csv`).

**Two corrections to what this table used to say.**

`sessions-2025.json` was recorded as **0 rows**, with the note "GFF did not publish
a 2025 agenda in retrievable form". That is no longer true — the 2025 agenda page
now carries a full `rawAgendaData` payload, and 391 sessions extract cleanly.

The 2025 speaker and partner files were extracted 2026-08-12 and had **dropped
fields the live site does carry**: speakers had no bio, LinkedIn, country or
headshot at all, and partners had no `sourceGroup`. The re-scrape recovers them
without changing which people or orgs are listed (993 and 399 either way).

`archive-2024/` is new. 2024 looked unretrievable — `2024.globalfintechfest.com`
has no DNS record — but the edition was folded into
`archive.globalfintechfest.com/2024/`, whose Drupal stack publishes the speaker
and partner views as unpaginated REST-export endpoints. See
`exports/README.md` → "Was 2024 retrievable?" for what was checked.

Regenerate with `pipeline/gff_archive_2024.py` and `pipeline/gff_archive_2025.py`.
Both are idempotent; the 2025 merge is top-up-only and will not regress a
committed row.

## Symlinks

`pipeline/*.json` are symlinks into these directories. The pipeline scripts resolve
inputs as `Path(__file__).parent / "<name>.json"`, so the symlinks keep the
canonical data here without editing any script. Reads and writes both follow the
link — running a pipeline script updates the file in this directory.
