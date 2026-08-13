/**
 * Portable in-process semantic index for the GFF 2026 attendee chatbot.
 *
 * Zero dependencies, zero runtime services. Load the index once at build time
 * (or at module scope in a server component) and query it in memory.
 *
 *   import { loadIndex, embedQuery } from './lib/gff-index.mjs'
 *
 *   const index = await loadIndex('./index')
 *   const qv    = await embedQuery('cross-border payments', process.env.GEMINI_API_KEY)
 *   const hits  = index.search(qv, { k: 5, type: 'partner' })
 *
 * The index stores unit-length int8 vectors, so cosine similarity is just a
 * dot product. Scores are in [-1, 1]; higher is more similar.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

const EMBED_MODEL = 'gemini-embedding-2'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}`

/**
 * Load the index into memory.
 *
 * @param {string} dir Directory holding the manifest + vectors (e.g. './index')
 * @param {{stem?: string}} [opts]
 * @returns {Promise<GffIndex>}
 */
export async function loadIndex(dir, opts = {}) {
  const stem = opts.stem ?? 'gff-2026'
  const manifest = JSON.parse(
    await readFile(path.join(dir, `${stem}.manifest.json`), 'utf8'),
  )
  const raw = await readFile(path.join(dir, manifest.vectorsFile))

  const { dim, count, scale, records } = manifest
  if (raw.length !== dim * count) {
    throw new Error(
      `vector file size ${raw.length} != dim*count ${dim * count} — index is corrupt`,
    )
  }

  // Dequantise once into a contiguous Float32Array and re-normalise each row,
  // so every query is a plain dot product with no per-query division.
  const ints = new Int8Array(raw.buffer, raw.byteOffset, raw.length)
  const mat = new Float32Array(dim * count)
  for (let i = 0; i < count; i++) {
    const off = i * dim
    let sq = 0
    for (let j = 0; j < dim; j++) {
      const v = ints[off + j] * scale
      mat[off + j] = v
      sq += v * v
    }
    const inv = sq > 0 ? 1 / Math.sqrt(sq) : 0
    for (let j = 0; j < dim; j++) mat[off + j] *= inv
  }

  return new GffIndex(manifest, mat, records)
}

class GffIndex {
  /** @param {any} manifest @param {Float32Array} mat @param {any[]} records */
  constructor(manifest, mat, records) {
    this.manifest = manifest
    this.dim = manifest.dim
    this.count = manifest.count
    this.records = records
    this._mat = mat
    this._byId = new Map(records.map((r, i) => [r.id, i]))
  }

  /**
   * Cosine-similarity search over the whole corpus.
   *
   * @param {ArrayLike<number>} query Query vector; length must be >= index dim.
   *   Longer vectors are truncated (Matryoshka-safe) and re-normalised.
   * @param {{k?: number, type?: string|string[], minScore?: number,
   *          filter?: (rec: any) => boolean}} [opts]
   * @returns {Array<{id: string, type: string, title: string, score: number, rank: number}>}
   */
  search(query, opts = {}) {
    const { k = 10, minScore = -Infinity, filter } = opts
    const q = normaliseQuery(query, this.dim)

    const types = opts.type
      ? new Set(Array.isArray(opts.type) ? opts.type : [opts.type])
      : null

    const { dim, count, records, _mat: mat } = this
    // Small, bounded top-k: linear scan with insertion into a k-sized list is
    // cheaper than sorting 1k+ scores, and stays exact.
    const best = []
    for (let i = 0; i < count; i++) {
      const rec = records[i]
      if (types && !types.has(rec.type)) continue
      if (filter && !filter(rec)) continue

      const off = i * dim
      let s = 0
      for (let j = 0; j < dim; j++) s += q[j] * mat[off + j]
      if (s < minScore) continue

      if (best.length < k) {
        best.push({ i, s })
        if (best.length === k) best.sort((a, b) => b.s - a.s)
      } else if (s > best[k - 1].s) {
        let p = k - 1
        while (p > 0 && best[p - 1].s < s) {
          best[p] = best[p - 1]
          p--
        }
        best[p] = { i, s }
      }
    }
    if (best.length < k) best.sort((a, b) => b.s - a.s)

    return best.map((b, rank) => ({
      id: records[b.i].id,
      type: records[b.i].type,
      title: records[b.i].title,
      score: b.s,
      rank,
    }))
  }

  /** Vector for a known record id, as a unit-length Float32Array. */
  vectorFor(id) {
    const i = this._byId.get(id)
    if (i === undefined) return null
    return this._mat.subarray(i * this.dim, (i + 1) * this.dim)
  }

  /** Records most similar to an existing record ("more like this"). */
  similarTo(id, opts = {}) {
    const v = this.vectorFor(id)
    if (!v) throw new Error(`unknown id: ${id}`)
    return this.search(v, { ...opts, k: (opts.k ?? 10) + 1 }).filter(
      (h) => h.id !== id,
    )
  }
}

/** Truncate to `dim` (Matryoshka) and re-normalise to unit length. */
function normaliseQuery(query, dim) {
  if (query.length < dim) {
    throw new Error(`query has ${query.length} dims, index needs ${dim}`)
  }
  const q = new Float32Array(dim)
  let sq = 0
  for (let j = 0; j < dim; j++) {
    q[j] = query[j]
    sq += q[j] * q[j]
  }
  const inv = sq > 0 ? 1 / Math.sqrt(sq) : 0
  for (let j = 0; j < dim; j++) q[j] *= inv
  return q
}

/**
 * Embed a user query with the same model the index was built with.
 *
 * Uses taskType RETRIEVAL_QUERY — the asymmetric counterpart to the
 * RETRIEVAL_DOCUMENT vectors in the index. Using the wrong task type silently
 * degrades ranking, so prefer this helper over hand-rolling the call.
 *
 * @param {string} text
 * @param {string} apiKey
 * @param {{dim?: number, signal?: AbortSignal}} [opts]
 * @returns {Promise<number[]>}
 */
export async function embedQuery(text, apiKey, opts = {}) {
  if (!apiKey) throw new Error('embedQuery: missing API key')
  const body = {
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_QUERY',
  }
  if (opts.dim) body.outputDimensionality = opts.dim

  const res = await fetch(`${ENDPOINT}:embedContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) {
    throw new Error(`embedQuery: HTTP ${res.status} ${await res.text()}`)
  }
  const json = await res.json()
  return json.embedding.values
}

export { EMBED_MODEL }
