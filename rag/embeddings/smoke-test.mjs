/**
 * Smoke test: proves the index does real semantic retrieval, not keyword matching.
 *
 *   node smoke-test.mjs
 *
 * Requires GEMINI_API_KEY (read from ./.env) because queries must be embedded
 * with the same model. Exits non-zero on any failed assertion.
 */

import { readFile } from 'node:fs/promises'
import { loadIndex, embedQuery } from './lib/gff-index.mjs'

const DIR = new URL('.', import.meta.url).pathname

// ---------------------------------------------------------------- helpers
let failures = 0
function check(name, cond, detail = '') {
  const ok = Boolean(cond)
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  return ok
}

async function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  const env = await readFile(`${DIR}.env`, 'utf8')
  const m = env.match(/^GEMINI_API_KEY=(.+)$/m)
  if (!m) throw new Error('GEMINI_API_KEY not found in .env')
  return m[1].trim()
}

// ---------------------------------------------------------------- setup
const key = await apiKey()
const index = await loadIndex(`${DIR}index`)

// Full record text, for judging whether a hit is topically plausible.
const corpus = new Map(
  (await readFile(`${DIR}corpus.snapshot.jsonl`, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .map((r) => [r.id, r]),
)

console.log(
  `index: ${index.count} records, ${index.dim}-d int8, model ${index.manifest.model}\n`,
)

// ---------------------------------------------------------------- 1. integrity
console.log('1. index integrity')
check('manifest count matches records', index.count === index.records.length)
check('corpus and index cover the same ids', index.records.every((r) => corpus.has(r.id)))
{
  let worst = 0
  for (const r of index.records) {
    const v = index.vectorFor(r.id)
    let sq = 0
    for (let i = 0; i < v.length; i++) sq += v[i] * v[i]
    worst = Math.max(worst, Math.abs(Math.sqrt(sq) - 1))
  }
  check('all vectors unit-length', worst < 1e-5, `max deviation ${worst.toExponential(2)}`)
}

// ---------------------------------------------------------------- 2. semantic retrieval
console.log('\n2. semantic retrieval')

/** Queries whose wording deliberately differs from the corpus vocabulary. */
const QUERIES = [
  {
    q: 'sending money across borders and international remittances',
    expect: /cross-border|remittance|forex|foreign exchange|payment|swift|correspondent|global payout|money transfer/i,
    min: 3,
  },
  {
    q: 'who is speaking about artificial intelligence and machine learning?',
    expect: /\bAI\b|artificial intelligence|machine learning|agentic|GenAI|LLM|deep learning/i,
    min: 3,
  },
  {
    q: 'lending to small businesses that lack credit history',
    expect: /lending|credit|loan|underwrit|MSME|SME|NBFC|financ/i,
    min: 3,
  },
  {
    q: 'protecting customers from digital payment fraud and scams',
    expect: /fraud|scam|risk|security|AML|KYC|cyber|authenticat/i,
    min: 3,
  },
  {
    q: 'regulation and compliance for digital banks',
    expect: /regulat|complian|policy|RBI|SEBI|supervis|licens|governance/i,
    min: 3,
  },
]

for (const { q, expect, min } of QUERIES) {
  const qv = await embedQuery(q, key)
  const hits = index.search(qv, { k: 5 })
  const good = hits.filter((h) => expect.test(corpus.get(h.id).text)).length
  console.log(`\n  query: "${q}"`)
  for (const h of hits) {
    const mark = expect.test(corpus.get(h.id).text) ? '*' : ' '
    console.log(
      `   ${mark} ${h.score.toFixed(3)}  [${h.type}] ${h.title.slice(0, 68)}`,
    )
  }
  check(`>=${min}/5 topically related`, good >= min, `${good}/5 matched`)
  check('scores are ordered descending', hits.every((h, i) => i === 0 || hits[i - 1].score >= h.score))
  check('scores in valid cosine range', hits.every((h) => h.score >= -1 && h.score <= 1))
}

// ---------------------------------------------------------------- 3. filtering
console.log('\n3. type filtering')
{
  const qv = await embedQuery('digital payments company', key)
  for (const type of ['partner', 'speaker', 'session']) {
    const hits = index.search(qv, { k: 5, type })
    check(`type=${type} returns only ${type}`, hits.length === 5 && hits.every((h) => h.type === type))
  }
  const custom = index.search(qv, { k: 5, filter: (r) => r.type !== 'partner' })
  check('custom filter excludes partners', custom.every((h) => h.type !== 'partner'))
}

// ---------------------------------------------------------------- 4. known-item retrieval
console.log('\n4. known-item retrieval (round-trip)')
{
  // Query with a record's own title; it should rank itself at or near the top.
  const samples = ['partner:google-pay', ...pickIds(3)]
  let top1 = 0
  for (const id of samples) {
    const rec = corpus.get(id)
    if (!rec) continue
    const qv = await embedQuery(rec.title, key)
    const hits = index.search(qv, { k: 5 })
    const pos = hits.findIndex((h) => h.id === id)
    if (pos === 0) top1++
    console.log(`   ${pos === 0 ? '*' : ' '} "${rec.title.slice(0, 50)}" -> rank ${pos < 0 ? '>5' : pos + 1}`)
  }
  check('most titles retrieve their own record at rank 1', top1 >= samples.length - 1, `${top1}/${samples.length}`)
}

function pickIds(n) {
  const ids = index.records.map((r) => r.id)
  const out = []
  for (let i = 0; i < n; i++) out.push(ids[Math.floor((i + 1) * ids.length / (n + 1))])
  return out
}

// ---------------------------------------------------------------- 5. more-like-this
console.log('\n5. more-like-this (vector-only, no API call)')
{
  const hits = index.similarTo('partner:google-pay', { k: 5 })
  console.log(`   neighbours of Google Pay:`)
  for (const h of hits) console.log(`     ${h.score.toFixed(3)}  [${h.type}] ${h.title.slice(0, 60)}`)
  check('excludes the seed record', !hits.some((h) => h.id === 'partner:google-pay'))
  check('returns neighbours', hits.length > 0)
  check('neighbours are payment-adjacent', hits.filter((h) => /payment|fintech|bank|UPI|wallet|financ|card|merchant/i.test(corpus.get(h.id).text)).length >= 3)
}

// ---------------------------------------------------------------- 6. quantisation fidelity
console.log('\n6. quantisation fidelity vs full-precision float32')
{
  const rawBuf = await readFile(`${DIR}index/gff-2026.f32.raw`).catch(() => null)
  if (!rawBuf) {
    console.log('   (skipped: no f32 cache present)')
  } else {
    const NATIVE = index.manifest.nativeDim
    const f32 = new Float32Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.length / 4)
    const ids = index.records.map((r) => r.id)
    const qv = await embedQuery('cross-border payments and remittances', key)

    // full-precision ranking at native dim
    const scores = ids.map((id, i) => {
      let s = 0
      for (let j = 0; j < NATIVE; j++) s += qv[j] * f32[i * NATIVE + j]
      return { id, s }
    })
    scores.sort((a, b) => b.s - a.s)
    const goldTop10 = new Set(scores.slice(0, 10).map((x) => x.id))
    const idxTop10 = index.search(qv, { k: 10 }).map((h) => h.id)
    const overlap = idxTop10.filter((id) => goldTop10.has(id)).length
    check('int8 index recovers >=7/10 of full-precision top-10', overlap >= 7, `${overlap}/10 overlap`)
  }
}

// ---------------------------------------------------------------- 7. error handling
console.log('\n7. error handling')
{
  let threw = false
  try { index.search(new Float32Array(8)) } catch { threw = true }
  check('rejects under-sized query vector', threw)
  let threw2 = false
  try { index.similarTo('speaker:does-not-exist') } catch { threw2 = true }
  check('rejects unknown id', threw2)
}

// ---------------------------------------------------------------- result
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
