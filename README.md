# GFF 2026 — Partner Concierge

An attendee-facing concierge for **Global Fintech Fest 2026**: a public directory of
exhibitors, speakers and sessions, plus a grounded chatbot that answers questions
about them without inventing anything.

This repository consolidates the whole project — the data pipeline that scrapes and
enriches the source records, the RAG stack built on top of them (corpus → sector
classification → embeddings → hybrid retrieval → evaluation), the Next.js app that
serves it, and the CSV exports.

---

## Record counts

Every figure below is measured from the committed data, not estimated.

| Entity | Count | Notes |
|---|---:|---|
| Partners / exhibitors (2026) | **316** | `data/2026/partners-2026.json` holds **319** rows; 3 are CMS logo-upload artifacts (`FCC logo`, `NPCI logo`, `PCI logo`) flagged `isDataArtifact: true` and excluded everywhere downstream. |
| Speakers (2026) | **487** | |
| Sessions (2026) | **256** | 222 public, **34 invite-only / closed-door**. |
| Corpus chunks | 1,059 | 316 partner + 487 speaker + 256 session, one chunk each. |

Independently corroborated three ways: a live re-scrape
(`pipeline/refresh-example/diff.txt` → `live=316 / 487 / 254`, zero added, zero
disappeared), the corpus build report (`rag/corpus/corpus-report.json`), and the
Atlas CSV export audit (`exports/export-audit.json` → rows match expected).

## Coverage — the honest numbers

Fields are populated from source only. Nothing is back-filled with `N/A`,
`Unknown`, or a plausible guess, so the gaps below are real gaps.

| Field | Covered | Share |
|---|---|---:|
| Partner `whatTheyDo` | **291 / 316** | 92.1% |
| Partner `useCases` | **208 / 316** | 65.8% |
| Speaker `bio` | **425 / 487** | 87.3% |
| Session `hall` | 256 / 256 | 100% |
| Partner sector classified | 283 / 316 | 89.6% — 33 `Unknown` (13 no evidence, 20 no usable evidence), see `rag/sectors/coverage.json` |

Quality caveats the corpus build recorded rather than hid: 25 partner, 188 speaker
and 25 session chunks are *text-poor* (short or thin source text); 124 speaker bios
were dropped as unresolved CMS placeholder tokens; one partner description
(`Netwin`) was rejected because it was a booth location rather than a description.

> **Note on the brief.** This work was specified with `whatTheyDo 296/316` and
> `useCases 235/316`. The committed data measures **291** and **208**. The numbers
> above are what the JSON actually contains — recount with the snippet in
> [Verifying the counts](#verifying-the-counts).

---

## Architecture

**Static-first reads. Atlas is used only for user-generated writes.**

```
GFF CMS ──scrape──> pipeline/ ──> data/2026/*.json ──vendored──> app/data/
                                       │
                                       ├──> rag/corpus/      corpus.jsonl (1,059 chunks)
                                       ├──> rag/sectors/     sectors-2026.json
                                       ├──> rag/embeddings/  int8 vector index
                                       └──> rag/retrieval/   @gff/retrieval (hybrid BM25 + dense)
                                                  │
                                    app/ (Next.js 15, App Router) ──> Vercel
                                                  │
                                     Atlas: profiles + saved plans ONLY
```

Every read path — directory, agenda, speaker pages, and the chatbot's retrieval
corpus — is served from JSON vendored into the app at build time. Pages prerender
and serve from the CDN, so venue wifi or an Atlas outage cannot take the directory
or agenda down. `app/lib/content.ts` is the static layer; `app/lib/profiles.ts`
holds the only database access and is documented "USER-GENERATED WRITES ONLY —
nothing in the read path should ever import this file."

Refresh the vendored copies with `app/sync-data.sh`.

### Why the data appears more than once

Three copies exist deliberately, each with a different job:

- `data/2026/` — **canonical**. The pipeline's output; edit/regenerate here.
- `app/data/` — **vendored build input**. Physically copied because a Vercel build
  only uploads the project directory. Refreshed by `app/sync-data.sh`.
- `rag/corpus/snapshot/` — **frozen provenance**. The exact bytes the corpus was
  built from, pinned with `CHECKSUMS.txt`. Deliberately not tracking `data/2026/`:
  partner enrichment was running concurrently during the build (`whatTheyDo` moved
  173 → 291 mid-run), which would have made the corpus unreproducible.

`pipeline/*.json` are **symlinks** into `data/2026/` and `data/archive-2025/`. The
pipeline scripts resolve their inputs as `Path(__file__).parent / "<name>.json"`,
so the symlinks let the canonical data live under `data/` without editing a single
script. Reads and writes both follow the link.

---

## Hard product rules

These are not style preferences. They are enforced in code and covered by tests.

### 1. No partner booth locations — ever

**GFF has not published a floor plan for 2026.** There are no exhibitor booth or
stall numbers in the source, and none are shown, inferred, or guessed anywhere.
The `booth` field is null on all 319 partner rows (`boothSource` is null on all of
them too).

Nulling the field is not sufficient, because descriptions are scraped free text
and some carried a booth number from a previous edition. So the rule is enforced in
depth:

- `app/lib/content.ts` — regex guard strips booth/stall/kiosk/pavilion identifiers
  out of scraped partner descriptions before render.
- `app/api/chat/route.ts` — the model is told booth data is `NOT PUBLISHED BY GFF`,
  is instructed never to emit one, and a post-generation output guard rewrites any
  booth identifier that slips through to `[booth location not published]` and
  appends an explicit refusal.
- `rag/corpus/build_corpus.py` — rejects any partner description that is a booth
  location (1 rejected: `Netwin`) and asserts no booth metadata key exists.
- `exports/export.mjs` — no booth column is emitted at all.

### 2. Session halls *are* published — and are not booths

Session halls (e.g. "Jasmine 3") are real published agenda data and are shown on all
256 sessions. The chatbot may give a session's hall when asked about that session.
It must never present a session hall as an exhibitor's location, and never infer an
exhibitor's location from one. The corpus verifier asserts halls appear on session
chunks only.

### 3. 2026 data only

The concierge answers about GFF 2026. 2025 is retained under
`data/archive-2025/` **as an archive** — it is never loaded by the app, never
enters the corpus, and never reaches the chatbot. The corpus verifier checks every
chunk carries `year: 2026` and that no 2025 file was copied into the build.

### 4. 34 closed-door sessions are never recommended

34 of 256 sessions are invite-only. They are listed for completeness and badged
clearly, but they are never recommended, never suggested as attendable, and the
matcher excludes them from every plan (`app/lib/match.ts`, `app/api/match/route.ts`).
They cannot be saved to a plan. The chatbot may state that such a session exists
and that it is invite-only; it must not suggest how to get in.

Verified end to end: `python3 rag/corpus/verify_corpus.py` → `ALL CHECKS PASSED`,
including "34 closed-door sessions", "closed-door => attendable false", and
"no booth/stall location on partner chunks".

---

## Layout

```
app/          Next.js 15 concierge (gff-concierge) — App Router, deploys to Vercel
pipeline/     Scrape → identity-resolve → enrich (Apify) → finalise → load to Atlas
rag/corpus/   Chunk builder + verifier → corpus.jsonl (1,059 chunks)
rag/sectors/  Sector taxonomy + per-partner classification decisions
rag/embeddings/  Gemini embedding index builder → int8 quantised vectors
rag/retrieval/   @gff/retrieval — hybrid lexical + dense retrieval, 29 tests
rag/eval/     Eval + adversarial safety harness (engine only — see caveat)
exports/      Atlas → CSV exports (exhibitors, speakers, sessions) + audit
data/2026/       Canonical 2026 JSON — the source of truth
data/archive-2025/  2025 archive. NOT used by the app, corpus, or chatbot.
```

---

## Running each part

Prerequisites: Node 20+, Python 3.11+, and `pip install pymongo` (the only
third-party Python dependency).

Copy `.env.example` → `.env` in `app/` and `pipeline/` and fill in values. **No
`.env` file is committed and none should be.**

### App

```bash
cd app
npm install
npm run dev            # http://localhost:3000
```

Without `GEMINI_API_KEY` the app still runs; `/api/chat` returns HTTP 503 with a
clear message rather than guessing. Without `MONGODB_URI`, profiles are disabled
and the rest of the site is unaffected (reads are static).

```bash
./sync-data.sh         # re-vendor data/2026 + retrieval src + embedding index
./deploy.sh            # push env vars and deploy to Vercel production
```

### Pipeline

```bash
cd pipeline
python3 gff_extract.py            # scrape the GFF CMS
python3 finalise_partners.py      # artifact flagging, curated institutions
python3 apify_enrich.py run       # enrich partner descriptions via Apify
python3 apify_enrich.py merge ID  # merge an enrichment run back in
python3 load_gff.py --year 2026   # idempotent upsert into Atlas
python3 refresh.py                # re-scrape, diff vs Atlas, write a snapshot
python3 -m pytest test_gff_names.py   # pins the 345/345 speaker join rate
```

`refresh.py` writes timestamped snapshots to `pipeline/snapshots/` — that directory
is gitignored (it holds re-scraped HTML). One worked diff is committed at
`pipeline/refresh-example/` as a reference. See `pipeline/REFRESH.md`.

### RAG stack

```bash
python3 rag/corpus/build_corpus.py     # → rag/corpus/corpus.jsonl
python3 rag/corpus/verify_corpus.py    # asserts all four product rules

python3 rag/sectors/build_sectors.py   # → rag/sectors/sectors-2026.json
python3 rag/sectors/pending.py         # partners still needing a hand decision

python3 rag/embeddings/build_index.py  # needs GEMINI_API_KEY
node rag/embeddings/smoke-test.mjs

cd rag/retrieval && npm install && npm test    # 29 tests
```

Scripts resolve their inputs from the repo by default and accept overrides via
`GFF_DATA_DIR`, `GFF_PARTNERS`, `GFF_CORPUS`, and `GFF_PIPELINE`.

### Exports

```bash
cd exports
npm install
node export.mjs        # reads Atlas, writes the three CSVs + export-audit.json
node verify.mjs
```

CSVs are UTF-8 with BOM and RFC4180-quoted, with CSV-injection screening
(`formulaRiskCells: 0` across all three). See `exports/README.md`.

---

## Large files

`rag/embeddings/index/gff-2026.vectors.i8` (1.6 MB, 1,059 × 1,536 int8) **is
committed** — it is what the app actually queries, vendored to
`app/vendor/gff-index/index/`.

Two large artifacts are deliberately **excluded** and are regenerable with
`rag/embeddings/build_index.py`:

- `gff-2026.f32.raw` (~12 MB) — the float32 embedding matrix. The app does not
  read it; it exists only as an intermediate for requantisation.
- `.embed-cache.jsonl` (~43 MB) — cached Gemini embedding responses.

---

## Verifying the counts

```bash
python3 - <<'PY'
import json
P=[p for p in json.load(open('data/2026/partners-2026.json')) if not p.get('isDataArtifact')]
S=json.load(open('data/2026/speakers-2026.json'))
E=json.load(open('data/2026/sessions-2026.json'))
nz=lambda v: v not in (None,'',[],{}) and (not isinstance(v,str) or v.strip())
print('partners        ', len(P))
print('  whatTheyDo    ', sum(1 for p in P if nz(p.get('whatTheyDo'))))
print('  useCases      ', sum(1 for p in P if nz(p.get('useCases'))))
print('  booth non-null', sum(1 for p in P if nz(p.get('booth'))))
print('speakers        ', len(S), 'bios', sum(1 for s in S if nz(s.get('bio'))))
print('sessions        ', len(E), 'closed-door', sum(1 for s in E if s.get('isClosedDoor')))
PY
```

---

## Known gaps

- **`rag/eval/` is engine-only.** The harness (`gffeval/` — detectors, runner,
  targets, report; ~1,600 lines) is complete, but its `data/` case suites,
  `bots/` fixture bots and `tests/` were never written, so `run_eval.py` currently
  loads zero cases and cannot score a target. The safety rules it is designed to
  enforce are, however, independently covered by `rag/corpus/verify_corpus.py` and
  the 29 tests in `rag/retrieval`.
- **`data/archive-2025/sessions-2025.json` is empty** (`[]`). GFF did not publish a
  2025 agenda in a retrievable form. 2025 partners (399) and speakers (993) are
  present. Archive only — not used anywhere.
- **`pipeline/build_corpus_2026.py`** reads raw scraped HTML from a machine-local
  scratchpad that no longer exists. It is retained as a record of the original
  extraction; `gff_extract.py` and `refresh.py` are the maintained entry points.
- `app/vendor/retrieval/src` has drifted from `rag/retrieval/src` (5 files differ,
  including a `@ts-nocheck` header `sync-data.sh` adds for an upstream type error in
  `adapters/gff-index.ts`). Re-run `app/sync-data.sh` to re-vendor.
