# GFF 2026 Concierge

A personal attendee agent for **Global Fintech Fest 2026** that cannot make things up.

Global Fintech Fest 2026 runs 9–11 September and publishes 256 sessions, 487 speakers
and 316 exhibitors. This app puts that entire catalogue into a language model's context,
lets you describe what you are there to achieve in plain words, and builds you a personal
three-day plan out of it. Every record it recommends is a real published record — not
because the model was asked nicely, but because anything it returns that isn't in the
published dataset is dropped before you ever see it.

**Live: <https://gff-concierge.vercel.app>**

---

## The problem

A GFF attendee gets three days, 256 sessions across 17 halls, 487 speakers and 316
exhibitors. Perhaps eight of those sessions are worth their time, and which eight depends
entirely on what they came to do — raise a round, find a fraud vendor, meet regulators.

The published agenda is a list. It cannot tell you that "we do fraud detection for banks"
means you want a panel titled *Beyond Transaction Monitoring: Hunting Mule Networks in
Real Time*. Keyword search cannot either — that title shares no word with the question.

---

## The grounding guarantee

This is the part worth reading.

The usual way to build this is retrieval: embed the catalogue, search it per question,
feed the top handful of results to a model. That introduces two failure modes — the
retriever silently drops the right answer, and the model, seeing only fragments, fills
gaps with plausible invention.

The GFF catalogue is small enough to avoid both. Rendered as text it is **93,844
characters — roughly 25,000 tokens**: 222 attendable sessions, 344 speakers linkable to a
session, and 316 exhibitors. That fits in a modern context window with room to spare, so
the whole festival goes to the model at once. There is no retrieval step at request time
and no top-`k` that can quietly lose the record you needed.

Because the model can see everything, it does not need to name anything. It returns
**ids** — `A0343`, an exhibitor slug, a speaker key — and nothing else that is treated as
fact. Those ids then pass three gates on the way back, none of which the model can talk
its way past:

1. **Validation.** Every id is looked up in the real published id set
   (`validateIds()` in `app/lib/catalog.ts`). Unknown ids are **dropped** — not
   fuzzy-matched, not repaired. A near-miss corrected into a real session is still a
   recommendation nobody made.
2. **Clash checking.** A session that overlaps something already in the plan is dropped
   and reported as a clash rather than silently double-booking you
   (`app/lib/agent.ts`). Back-to-back sessions are fine; strict overlap is not.
3. **Re-classification on write.** `classifyId()` in `app/lib/db.ts` checks a third time
   at the database layer, so an id that reached a write path by any other route is
   refused there too.

Titles, halls and times are then resolved from the dataset by id. **Nothing the model
wrote reaches your screen as a fact.** Invention is not discouraged by prompting; it is
structurally impossible, and the gates are ordinary code you can read in an afternoon.

The example above is real: ask about fraud detection for banks and you get `A0343`,
*Beyond Transaction Monitoring: Hunting Mule Networks in Real Time*, The Studio, 9 Sept,
11:00–11:40. The connection is semantic. The record is verbatim.

---

## What it refuses to do

The refusals are the product, not a limitation of it.

**No booth or stand locations.** GFF has published no floor plan for 2026, so none exists
to show. `booth` is null on all 319 partner rows, and because scraped descriptions
sometimes carried a booth number from a previous edition, nulling the field is not enough.
The rule is enforced in five separate places:

| Where | What it does |
|---|---|
| `app/lib/content.ts` | Regex guard strips booth/stall/kiosk/pavilion identifiers out of scraped descriptions before render |
| `app/lib/catalog.ts` + `app/lib/agent.ts` | The agent's catalogue states no floor plan exists and no location is available to look up |
| `app/app/api/chat/route.ts` | Model is told booth data is `NOT PUBLISHED BY GFF`; a post-generation output guard rewrites any identifier that slips through |
| `rag/corpus/build_corpus.py` | Rejects any partner description that is a booth location (1 rejected: `Netwin`); asserts no booth metadata key exists |
| `exports/export.mjs` | No booth column is emitted at all |

**The 34 invite-only sessions are never planned.** They are filtered out before the
catalogue text is built, so the model never sees them and cannot recommend what it was
never shown. Independently, `classifyId()` returns null for them at the write layer, so
even an id supplied by hand is refused. They remain listed and badged in the public
directory — they are simply never planned.

**No cold calling.** There are zero phone numbers in the GFF dataset. The voice endpoint
reads your number from your own account server-side; it is never taken from the request,
so the only number the system can dial is the one you registered yourself.

**No back-filled fields.** Nothing is padded with `N/A`, `Unknown`, or a plausible guess.
Where a bio is missing, the app shows a missing bio. The coverage table below is on this
page for the same reason.

**2026 only.** The 2025 archive under `data/archive-2025/` is never loaded by the app,
never enters the corpus, and never reaches the agent.

---

## What you can do with it

- **Browse** the full agenda, speaker list and exhibitor directory. Every read is static,
  so this works with no account and no database.
- **Register** with an email, a password and a phone number in international format.
- **Talk to the AI Agent** at `/ask` — one persistent conversation, not a search box.
  Describe your objective and it builds the plan; change your mind and it edits the same
  plan rather than starting over.
- **Keep one plan** per account, edited by explicit add/remove operations, so a session
  you saved by hand survives whatever the agent does next. Double-booking is blocked in
  code and reported back to you.
- **Share your plan**, strictly opt-in and double-gated: your profile must be marked
  `consentPublic` **and** the plan's visibility set to `shared`. Plans default to
  `private`, and plans written before sharing existed are treated as private.
- **Find a meeting point** at `/meet` — pick 2–4 attendees who have shared plans and see
  the sessions you are all already attending, or a window when everyone is free. It never
  invents a slot: a shared session is one everybody already had.
- **Get a phone call** that reads one day of your plan aloud, placed outbound through
  Bolna to your registered number.

The `/people` directory and `/meet` are populated with **50 seeded demo attendees**
(`app/scripts/seed-demo-attendees.mjs`, deterministic and deletable with `--delete`).
They are demo data so the feature can be shown, not real users.

---

## Architecture

**Static-first reads. Atlas is used only for user-generated writes.**

```
GFF CMS ──scrape──> pipeline/ ──> data/2026/*.json ──vendored──> app/data/
                                              │
                               app/ (Next.js 15 App Router) ──> Vercel
                                              │
                     Atlas `gff`: accounts, profiles, plans, conversations, calls
```

Every read path — directory, agenda, speaker pages, and the agent's catalogue — is served
from JSON vendored into the app at build time, so pages prerender and serve from the CDN.
Venue wifi or an Atlas outage cannot take the directory or agenda down; the worst case is
that you cannot save. `app/lib/content.ts` is the static layer. `app/lib/db.ts` and
`app/lib/profiles.ts` hold the only database access, and the latter is documented
"USER-GENERATED WRITES ONLY — nothing in the read path should ever import this file."

The agent runs on `gemini-3.6-flash` (override with `GEMINI_MODEL`). Voice is Bolna,
outbound only: a single `POST https://api.bolna.ai/call` with `agent_id`,
`recipient_phone_number` and `user_data`. No inbound number, no SIP, no webhook and no
public URL — there is nothing to expose at the venue.

Refresh the vendored copies with `app/sync-data.sh`.

---

## Running it locally

Prerequisites: Node 20+, and Python 3.11+ with `pip install pymongo` if you want to run
the pipeline.

```bash
cd app
cp .env.example .env     # then fill it in
npm install
npm run dev              # http://localhost:3000
```

No `.env` file is committed and none should be. The app degrades honestly rather than
guessing when keys are absent:

| Missing | Effect |
|---|---|
| `GEMINI_API_KEY` | The agent falls back to a deterministic matcher (`app/lib/match.ts`), flags itself `degraded`, and says so in the reply — it still returns real records with real reasons, and returns nothing rather than padding when it finds nothing above threshold. `/api/chat` returns HTTP 503 |
| `MONGODB_URI` | Accounts, plans, sharing and `/meet` are disabled; the whole read-only site is unaffected |
| `SESSION_SECRET` | Sessions are signed with a random per-process key, so every restart signs everyone out |
| `BOLNA_API_KEY` / `BOLNA_AGENT_ID` | `POST /api/call` returns HTTP 503 |

Optional, once `MONGODB_URI` is set:

```bash
node --env-file=.env scripts/seed-demo-attendees.mjs           # 50 demo attendees
node --env-file=.env scripts/seed-demo-attendees.mjs --delete  # remove them
```

---

## The honest numbers

Every figure here is measured from the committed data, not estimated. Recount them
yourself with the snippet in [Verifying the counts](#verifying-the-counts).

| Entity | Count | Notes |
|---|---:|---|
| Exhibitors / partners (2026) | **316** | `data/2026/partners-2026.json` holds **319** rows; 3 are CMS logo-upload artifacts (`FCC logo`, `NPCI logo`, `PCI logo`) flagged `isDataArtifact: true` and excluded everywhere downstream |
| Speakers (2026) | **487** | 344 are linkable to a session and reachable by the agent |
| Sessions (2026) | **256** | 222 public, **34 invite-only / closed-door**, across 17 halls |
| Corpus chunks | 1,059 | 316 partner + 487 speaker + 256 session, one chunk each |

Independently corroborated three ways: a live re-scrape
(`pipeline/refresh-example/diff.txt` → `live=316 / 487 / 254`, zero added, zero
disappeared), the corpus build report (`rag/corpus/corpus-report.json`), and the Atlas CSV
export audit (`exports/export-audit.json`).

### Coverage

Fields are populated from source only. Nothing is back-filled, so the gaps below are real
gaps.

| Field | Covered | Share |
|---|---|---:|
| Partner `whatTheyDo` | **291 / 316** | 92.1% |
| Partner `useCases` | **208 / 316** | 65.8% |
| Speaker `bio` | **425 / 487** | 87.3% |
| Speaker `linkedin` | 199 / 487 | 40.9% |
| Speaker `sessionCodes` | 345 / 487 | 70.8% |
| Session `description` | 236 / 256 | 92.2% |
| Session `hall` / `startTime` / `endTime` | 256 / 256 | 100% |
| Partner sector classified | 283 / 316 | 89.6% — 33 `Unknown` (13 no evidence, 20 no usable evidence), see `rag/sectors/coverage.json` |

Quality caveats the corpus build recorded rather than hid: 25 partner, 188 speaker and 25
session chunks are *text-poor* (short or thin source text); 124 speaker bios were dropped
as unresolved CMS placeholder tokens; one partner description (`Netwin`) was rejected
because it was a booth location rather than a description.

> **Note on the brief.** This work was specified with `whatTheyDo 296/316` and
> `useCases 235/316`. The committed data measures **291** and **208**. The numbers above
> are what the JSON actually contains.

### Known gaps

- **`rag/eval/` is engine-only.** The harness (`gffeval/` — detectors, runner, targets,
  report; ~1,600 lines) is complete, but its `data/` case suites, `bots/` fixture bots and
  `tests/` were never written, so `run_eval.py` currently loads zero cases and cannot
  score a target. The safety rules it is designed to enforce are independently covered by
  `rag/corpus/verify_corpus.py` and the 29 tests in `rag/retrieval`.
- **`docs/JOURNEYS.md` is a design document, not a description of the built app.** It
  specifies routes (`/now`, `/halls/[hall]`, `/topics/[topic]`) that were not built.
- **`data/archive-2025/sessions-2025.json` is empty** (`[]`). GFF did not publish a 2025
  agenda in a retrievable form. 2025 partners (399) and speakers (993) are present.
  Archive only — not used anywhere.
- **`pipeline/build_corpus_2026.py`** reads raw scraped HTML from a machine-local
  scratchpad that no longer exists. It is retained as a record of the original extraction;
  `gff_extract.py` and `refresh.py` are the maintained entry points.
- `app/vendor/retrieval/src` has drifted from `rag/retrieval/src` (5 files differ,
  including a `@ts-nocheck` header `sync-data.sh` adds for an upstream type error in
  `adapters/gff-index.ts`). Re-run `app/sync-data.sh` to re-vendor.
- The hybrid retrieval stack under `rag/` predates the full-context agent and is no longer
  on the agent's path. It still backs `/api/chat` and is kept because it is tested and
  because it is what makes the corpus verifiable.

---

## Repository layout

```
app/          Next.js 15 concierge — App Router, deploys to Vercel
deck/         Project presentation (self-contained index.html + PDF)
docs/         Journey and page-spec design documents
pipeline/     Scrape → identity-resolve → enrich (Apify) → finalise → load to Atlas
rag/corpus/   Chunk builder + verifier → corpus.jsonl (1,059 chunks)
rag/sectors/  Sector taxonomy + per-partner classification decisions
rag/embeddings/  Gemini embedding index builder → int8 quantised vectors
rag/retrieval/   @gff/retrieval — hybrid lexical + dense retrieval, 29 tests
rag/eval/     Eval + adversarial safety harness (engine only — see Known gaps)
exports/      Atlas → CSV exports (exhibitors, speakers, sessions) + audit
data/2026/           Canonical 2026 JSON — the source of truth
data/archive-2025/   2025 archive. NOT used by the app, corpus, or agent.
```

### Why the data appears more than once

Three copies exist deliberately, each with a different job:

- `data/2026/` — **canonical**. The pipeline's output; edit and regenerate here.
- `app/data/` — **vendored build input**. Physically copied because a Vercel build only
  uploads the project directory. Refreshed by `app/sync-data.sh`.
- `rag/corpus/snapshot/` — **frozen provenance**. The exact bytes the corpus was built
  from, pinned with `CHECKSUMS.txt`. Deliberately not tracking `data/2026/`: partner
  enrichment was running concurrently during the build (`whatTheyDo` moved 173 → 291
  mid-run), which would have made the corpus unreproducible.

`pipeline/*.json` are **symlinks** into `data/2026/` and `data/archive-2025/`. The pipeline
scripts resolve inputs as `Path(__file__).parent / "<name>.json"`, so the symlinks let the
canonical data live under `data/` without editing a single script.

---

## Data pipeline and RAG stack

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

`refresh.py` writes timestamped snapshots to `pipeline/snapshots/` (gitignored — it holds
re-scraped HTML). One worked diff is committed at `pipeline/refresh-example/` as a
reference. See `pipeline/REFRESH.md`.

```bash
python3 rag/corpus/build_corpus.py     # → rag/corpus/corpus.jsonl
python3 rag/corpus/verify_corpus.py    # asserts the product rules

python3 rag/sectors/build_sectors.py   # → rag/sectors/sectors-2026.json
python3 rag/sectors/pending.py         # partners still needing a hand decision

python3 rag/embeddings/build_index.py  # needs GEMINI_API_KEY
node rag/embeddings/smoke-test.mjs

cd rag/retrieval && npm install && npm test    # 29 tests
```

Scripts resolve inputs from the repo by default and accept overrides via `GFF_DATA_DIR`,
`GFF_PARTNERS`, `GFF_CORPUS` and `GFF_PIPELINE`.

`python3 rag/corpus/verify_corpus.py` → `ALL CHECKS PASSED`, including "34 closed-door
sessions", "closed-door => attendable false", and "no booth/stall location on partner
chunks".

### Exports

```bash
cd exports
npm install
node export.mjs        # reads Atlas, writes the three CSVs + export-audit.json
node verify.mjs
```

CSVs are UTF-8 with BOM and RFC4180-quoted, with CSV-injection screening
(`formulaRiskCells: 0` across all three). See `exports/README.md`.

### Large files

`rag/embeddings/index/gff-2026.vectors.i8` (1.6 MB, 1,059 × 1,536 int8) **is committed** —
it is what the app queries, vendored to `app/vendor/gff-index/index/`. Two large artifacts
are deliberately excluded and regenerable with `rag/embeddings/build_index.py`:
`gff-2026.f32.raw` (~12 MB, a requantisation intermediate the app never reads) and
`.embed-cache.jsonl` (~43 MB of cached Gemini responses).

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

The catalogue size the agent actually sends is measurable too — `catalogStats()` in
`app/lib/catalog.ts` reports `chars` and an approximate token count.
