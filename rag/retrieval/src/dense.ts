/**
 * Dense channel.
 *
 * Two providers implement the same `DenseProvider` interface:
 *
 *   RandomIndexingDense - built in-process from the corpus itself, no model,
 *       no network, no dependencies. Used until the embedding workspace
 *       publishes vectors.
 *   ExternalDense       - wraps precomputed embeddings (id -> vector) plus a
 *       query embedder, for when those vectors land.
 *
 * Swapping providers changes nothing else: `createRetriever({ dense })`.
 *
 * HOW THE BUILT-IN ONE WORKS
 * --------------------------
 * Random Indexing (Kanerva), reflective variant. Each document gets a sparse
 * random ternary "index vector". A term's vector is the tf-idf-weighted sum of
 * the index vectors of the documents it appears in, so terms that occur in
 * similar documents end up with similar vectors — distributional semantics,
 * learned from this corpus, without training a model. Document vectors are then
 * the tf-idf-weighted sum of their term vectors, which is what lets a query for
 * "voice agent" reach a partner described as "conversational AI for calls".
 *
 * Everything is seeded from a hash of the record id, so vectors are
 * deterministic and stable when records are added or reordered.
 */

import type { CorpusRecord, DenseProvider } from './types';
import { textFor } from './fields';
import { tokenize } from './text';

const DIMENSIONS = 256;
/** Non-zero entries per sparse index vector. */
const SPARSITY = 12;

/** FNV-1a, 32-bit. Stable across runs and platforms. */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — deterministic, no Math.random. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sparseIndexVector(id: string, dimensions: number): Map<number, number> {
  const rand = prng(hash32(id));
  const entries = new Map<number, number>();
  let guard = 0;
  while (entries.size < Math.min(SPARSITY, dimensions) && guard < SPARSITY * 20) {
    guard += 1;
    const pos = Math.floor(rand() * dimensions) % dimensions;
    if (entries.has(pos)) continue;
    entries.set(pos, rand() < 0.5 ? -1 : 1);
  }
  return entries;
}

function normalise(v: Float32Array): Float32Array | null {
  let sum = 0;
  for (let i = 0; i < v.length; i += 1) sum += v[i] * v[i];
  if (sum <= 0) return null;
  const inv = 1 / Math.sqrt(sum);
  for (let i = 0; i < v.length; i += 1) v[i] *= inv;
  return v;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) dot += a[i] * b[i];
  return dot;
}

export class RandomIndexingDense implements DenseProvider {
  readonly name = 'random-indexing(corpus)';
  readonly dimensions = DIMENSIONS;
  private readonly termVectors = new Map<string, Float32Array>();
  private readonly docVectors = new Map<string, Float32Array>();
  private readonly idf = new Map<string, number>();

  constructor(records: readonly CorpusRecord[]) {
    const docTokens = records.map((r) => ({ id: r.id, tokens: tokenize(textFor(r)) }));
    const n = docTokens.length || 1;

    const df = new Map<string, number>();
    for (const { tokens } of docTokens) {
      for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
    }
    for (const [term, count] of df) {
      this.idf.set(term, Math.log(1 + n / (count + 0.5)));
    }

    // Pass 1: term vectors from document index vectors.
    const accum = new Map<string, Float32Array>();
    for (const { id, tokens } of docTokens) {
      if (!tokens.length) continue;
      const indexVector = sparseIndexVector(id, DIMENSIONS);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const [term, count] of tf) {
        const weight = (1 + Math.log(count)) * (this.idf.get(term) ?? 0);
        if (weight <= 0) continue;
        let vec = accum.get(term);
        if (!vec) {
          vec = new Float32Array(DIMENSIONS);
          accum.set(term, vec);
        }
        for (const [pos, sign] of indexVector) vec[pos] += sign * weight;
      }
    }
    for (const [term, vec] of accum) {
      const unit = normalise(vec);
      if (unit) this.termVectors.set(term, unit);
    }

    // Pass 2: document vectors as weighted sums of their term vectors.
    for (const { id, tokens } of docTokens) {
      const vec = this.composeVector(tokens);
      if (vec) this.docVectors.set(id, vec);
    }
  }

  private composeVector(tokens: readonly string[], boost?: ReadonlyMap<string, number>): Float32Array | null {
    if (!tokens.length) return null;
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const out = new Float32Array(DIMENSIONS);
    let any = false;
    for (const [term, count] of tf) {
      const termVector = this.termVectors.get(term);
      if (!termVector) continue;
      const weight =
        (1 + Math.log(count)) * (this.idf.get(term) ?? 0) * (boost?.get(term) ?? 1);
      if (weight <= 0) continue;
      any = true;
      for (let i = 0; i < DIMENSIONS; i += 1) out[i] += termVector[i] * weight;
    }
    return any ? normalise(out) : null;
  }

  vectorFor(id: string): Float32Array | null {
    return this.docVectors.get(id) ?? null;
  }

  embedQuery(query: string): Float32Array | null {
    return this.composeVector(tokenize(query));
  }

  /** Query embedding with per-term weights, used to demote generic terms. */
  embedWeighted(terms: readonly { term: string; weight: number }[]): Float32Array | null {
    const boost = new Map(terms.map((t) => [t.term, t.weight]));
    return this.composeVector(terms.map((t) => t.term), boost);
  }

  /** Nearest terms to a term. Exposed for eval and debugging, not for ranking. */
  neighbours(term: string, k = 10): { term: string; similarity: number }[] {
    const target = this.termVectors.get(term);
    if (!target) return [];
    const scored: { term: string; similarity: number }[] = [];
    for (const [other, vec] of this.termVectors) {
      if (other === term) continue;
      scored.push({ term: other, similarity: cosine(target, vec) });
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, k);
  }
}

export interface ExternalDenseOptions {
  readonly name?: string;
  /** Precomputed unit-norm document vectors, keyed by record id. */
  readonly vectors: ReadonlyMap<string, Float32Array>;
  /** Embeds a query with the same model that produced `vectors`. */
  readonly embedQuery: (query: string) => Float32Array | null;
  readonly dimensions: number;
}

/** Adapter for precomputed embeddings from the embedding workspace. */
export class ExternalDense implements DenseProvider {
  readonly name: string;
  readonly dimensions: number;
  private readonly vectors: ReadonlyMap<string, Float32Array>;
  private readonly embed: (query: string) => Float32Array | null;

  constructor(options: ExternalDenseOptions) {
    this.name = options.name ?? 'external';
    this.dimensions = options.dimensions;
    this.vectors = options.vectors;
    this.embed = options.embedQuery;
  }

  vectorFor(id: string): Float32Array | null {
    return this.vectors.get(id) ?? null;
  }

  embedQuery(query: string): Float32Array | null {
    return this.embed(query);
  }
}

/** Dense channel disabled — retrieval degrades to lexical only, explicitly. */
export const NULL_DENSE: DenseProvider = {
  name: 'none',
  dimensions: 0,
  vectorFor: () => null,
  embedQuery: () => null,
};
