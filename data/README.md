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

## `archive-2025/` — ARCHIVE, DO NOT USE

⚠️ **Historical only. Not loaded by the app, never enters the corpus, and never
reaches the chatbot.** The concierge is a 2026-only product; `verify_corpus.py`
asserts every corpus chunk is `year: 2026` and that no 2025 file was copied into
the build.

| File | Rows |
|---|---:|
| `partners-2025.json` | 399 |
| `speakers-2025.json` | 993 |
| `sessions-2025.json` | 0 — GFF did not publish a 2025 agenda in retrievable form |

Kept for year-over-year comparison of the exhibitor and speaker sets only.

## Symlinks

`pipeline/*.json` are symlinks into these directories. The pipeline scripts resolve
inputs as `Path(__file__).parent / "<name>.json"`, so the symlinks keep the
canonical data here without editing any script. Reads and writes both follow the
link — running a pipeline script updates the file in this directory.
