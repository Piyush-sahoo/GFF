# GFF 2026 attendee chatbot — embedding index

A **portable, in-process semantic index** over the Global Fintech Fest 2026 corpus:
1,059 records (487 speakers, 316 partners, 256 sessions).

No vector database. At ~1k records the whole index is a 1.6 MB byte array that a
Next.js build loads in ~7 ms and searches in ~1 ms — a hosted vector DB would add
a network hop, an auth surface, and an operational dependency to buy nothing.

## Contents

| Path | What it is |
| --- | --- |
| `index/gff-2026.vectors.i8` | **1,626,624 B (1.55 MB)** — int8 matrix, row-major `[1059 × 1536]` |
| `index/gff-2026.manifest.json` | **90,632 B (88 KB)** — ids, types, titles, dequant scale, provenance |
| `index/gff-2026.f32.raw` | 13 MB float32 cache at native 3072-d. **Local only — do not ship.** Lets you re-derive any smaller index for free |
| `lib/gff-index.mjs` | Loader + cosine search. Zero dependencies |
| `lib/gff-index.d.ts` | TypeScript declarations |
| `build_index.py` | Corpus → embeddings → index. Resumable, content-addressed cache |
| `smoke-test.mjs` | Proves semantic retrieval works |
| `corpus.snapshot.jsonl` | Exact corpus the index was built from (`md5 24fc88f7…`) |

**Shipped index = 1.64 MB** (vectors + manifest).

## Usage

```js
import { loadIndex, embedQuery } from './lib/gff-index.mjs'

const index = await loadIndex('./index')          // once, at build/module scope
const qv    = await embedQuery('cross-border payments', process.env.GEMINI_API_KEY)

index.search(qv, { k: 5 })
// [{ id: 'partner:borderless', type: 'partner', title: 'Borderless', score: 0.738, rank: 0 }, …]

index.search(qv, { k: 5, type: 'session' })        // filter by type
index.search(qv, { k: 5, filter: r => r.type !== 'partner' })
index.similarTo('partner:google-pay', { k: 5 })    // no API call — pure vector maths
```

`search` returns ids only. Join full metadata from `corpus.snapshot.jsonl` (or
whatever the app already loads) — keeping bodies out of the index is what holds
it to 1.6 MB.

### In Next.js

```ts
// app/lib/search.ts
import { loadIndex, embedQuery } from '@/lib/gff-index.mjs'

const indexPromise = loadIndex(process.cwd() + '/index')   // cached per process

export async function semanticSearch(q: string, k = 8) {
  const [index, qv] = await Promise.all([
    indexPromise,
    embedQuery(q, process.env.GEMINI_API_KEY!),
  ])
  return index.search(qv, { k })
}
```

Fully static alternative: precompute embeddings for a fixed question set at build
time and ship them, and the app makes no runtime API calls at all.

> **Use `embedQuery`, don't hand-roll the call.** Documents were embedded with
> `taskType: RETRIEVAL_DOCUMENT` and queries must use `RETRIEVAL_QUERY`. These are
> asymmetric; mismatching them degrades ranking silently, with no error.

## Model

`gemini-embedding-2` — verified present on the key via `ListModels` before the run,
not assumed. Two properties drove the choice over `gemini-embedding-001`:

- **8192 input-token limit** (vs 2048). The longest record is ~353 tokens, so
  nothing truncates. With `-001`, long speaker bios would have been silently cut.
- **Vectors arrive L2-normalised at every output dimensionality.** `gemini-embedding-001`
  returns *unnormalised* truncated vectors (measured L2 = 0.694 at 1536-d, 0.596 at
  768-d). Consumers that assume unit vectors and skip renormalising get wrong
  cosine scores. Confirmed by measurement, not docs.

## Why 1536-d int8

Embedded once at native 3072-d, then derived smaller dimensions locally by
Matryoshka truncate-and-renormalise. This is **exact, not approximate** — local
truncation reproduces the API's native 768-d output at **cos = 1.000000**. So
dimension choice costs zero extra tokens and can be revisited any time from the
f32 cache.

Recall@10 measured against the full-precision 3072-d float32 index, all 1,059 records:

| Config | recall@10 | Index size |
| --- | --- | --- |
| 3072-d float32 | 1.0000 | 12.4 MB |
| 3072-d int8 | 0.9837 | 3.1 MB |
| **1536-d int8 (shipped)** | **0.9312** | **1.55 MB** |
| 768-d int8 | 0.8793 | 794 KB |
| 512-d int8 | 0.7816 | 530 KB |
| 256-d int8 | 0.6464 | 265 KB |

**The trade, precisely:** int8 quantisation is nearly free — it costs 0.5–1% recall
at any dimension (0.9837 vs 1.0000 at 3072-d) while cutting size 4×. Essentially all
real loss comes from *dimension reduction*, not quantisation. So the right move is
keep dimensions high and quantise hard, which is what 1536-d int8 does: **8× smaller
than full float32 for ~7% top-10 reordering**.

That 7% is mostly reshuffling within the tail of the top-10 — see the smoke test,
where the shipped index recovers **10/10** of the full-precision top-10 for a real
query. For a chatbot feeding ~8 records to an LLM, this is not user-visible.

Want more fidelity? `python3 build_index.py --dim 3072` re-derives a 3.1 MB /
0.9837 index from the cache in seconds, with **no new API calls**. 1536-d is the
default because 1.55 MB is comfortable to load at build time; 3072-d is the choice
if retrieval quality ever proves the bottleneck.

## Rebuilding

```bash
python3 build_index.py --dim 1536 --keep-raw --eval
node smoke-test.mjs
```

The embed cache (`.embed-cache.jsonl`) is keyed by `(id, sha256(text))`, not id
alone. The upstream corpus is produced by another worker and regenerates in place,
so a record can keep its id while its text changes — id-only caching silently
serves stale vectors. Content addressing means edited records re-embed and
untouched ones stay free. The manifest records a `corpusSha` so a built index can
always be traced to its exact input.

Requires `GEMINI_API_KEY` in `.env` (mode 0600, gitignored). numpy is needed only
for `--eval`; the index writer itself is dependency-free.

## Verification

`node smoke-test.mjs` — 29 assertions, all passing:

- **Integrity** — manifest/vector sizes agree, all 1,059 vectors unit-length (max deviation 2.5e-8)
- **Semantic retrieval** — 5 queries worded to *avoid* corpus vocabulary
- **Filtering**, **known-item round-trip** (4/4 titles retrieve their own record at rank 1), **more-like-this**
- **Quantisation fidelity** — int8 index recovers 10/10 of the full-precision top-10
- **Error handling** — rejects undersized query vectors and unknown ids

Retrieval is genuinely semantic. "*sending money across borders and international
remittances*" — no shared keywords with several of its hits — returns:

```
0.738  [partner] Borderless
0.691  [partner] Wise
0.689  [partner] Wizzmoni FInancial Services
0.679  [session] Cross-Border Payments Reimagined: Speed, Cost, and Transparency
0.678  [session] Outward Remittances: Serving India's Global Citizens with Smarter Cross-Border Payments
```

And nearest neighbours of Google Pay are PhonePe (0.925), Paytm (0.885),
Amazon Pay (0.878), Razorpay (0.872), Getepay (0.869) — a coherent payments cluster
learned from descriptions, never from a category label.

## Cost

| | |
| --- | --- |
| Corpus tokens | **141,061** (API-reported; independently confirmed via `countTokens`) |
| Total tokens spent | **~282,700** — includes one superseded run, see below |
| Rate | $0.20 / 1M input tokens (`gemini-embedding-2`, paid tier) |
| **Cost** | **~$0.057 paid tier — $0.00 on the free tier**, which covers embeddings |
| Wall clock | ~110 s for 1,059 records (22 batches of 50) |

The corpus was embedded twice. The first run completed before the upstream worker
rewrote `corpus.jsonl`; rather than ship an index that silently mixed stale and
current text, it was rebuilt against the verified snapshot. That is the ~141k
extra tokens — about 2.8 cents at paid rates, and the reason the cache is now
content-addressed so it cannot recur.

Query-time cost is one embedding call per user question (~10 tokens, ~$0.000002).

## Notes / limits

- **Index and corpus must be rebuilt together.** Vector row *i* corresponds to
  `manifest.records[i]`. Check `corpusSha` if in doubt.
- **Search is exhaustive**, O(n·d) ≈ 1.6M multiply-adds per query — measured 1.05 ms, and exact.
  No ANN approximation. This stops being the right call somewhere north of ~50k records.
- **The API key in `.env` is exposed and slated for rotation.** It is 0600 and
  gitignored, and neither `build_index.py` nor the loader ever logs it. Swap it via
  the environment; no code change needed.
