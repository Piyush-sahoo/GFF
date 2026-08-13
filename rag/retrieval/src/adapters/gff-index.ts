/**
 * Adapter for the published GFF 2026 embedding index (gemini-embedding-2).
 *
 * The index ships int8 vectors plus a manifest; `loadIndex` dequantises them to
 * unit-length Float32 rows in memory. This adapter wraps it in the
 * `DenseProvider` shape so the hybrid retriever can use it in place of the
 * built-in corpus-derived vectors:
 *
 *   const dense = await loadGffIndexDense({
 *     indexDir: './index',
 *     apiKey: process.env.GEMINI_API_KEY,
 *   });
 *   const retriever = createRetriever({ jsonlPath, dense });
 *   const { hits } = await retriever.retrieveAsync(userQuery);
 *
 * Query embedding is a network call, so it is exposed as `embedQueryAsync` and
 * driven by `Retriever.retrieveAsync`. The synchronous `embedQuery` returns
 * null: if a caller uses plain `retrieve` with this provider, the dense channel
 * simply contributes nothing and lexical + name matching still answer the
 * query. That is the intended degradation, not a bug.
 *
 * Record ids in the index use the same scheme as the corpus, so vectors line up
 * by id with no mapping table. Records the index does not cover just miss the
 * dense channel.
 */

import type { DenseProvider } from '../types';

/** Minimal shape of the loaded index this adapter depends on. */
export interface GffIndexLike {
  readonly dim: number;
  readonly count: number;
  vectorFor(id: string): Float32Array | null;
}

export interface GffIndexDenseOptions {
  /** Directory holding the manifest and vector file. */
  readonly indexDir: string;
  /** Gemini API key. Without it the dense channel stays inert. */
  readonly apiKey?: string;
  /** Override the file stem. Defaults to the published "gff-2026". */
  readonly stem?: string;
  /** Injectable for tests: a preloaded index. */
  readonly index?: GffIndexLike;
  /** Injectable for tests: a query embedder. */
  readonly embed?: (text: string) => Promise<ArrayLike<number> | null>;
  /** Abort embedding after this many ms. Default 4000. */
  readonly timeoutMs?: number;
  /** Path to gff-index.mjs. Defaults to `<indexDir>/../lib/gff-index.mjs`. */
  readonly libPath?: string;
}

export class GffIndexDense implements DenseProvider {
  readonly name = 'gemini-embedding-2(int8)';
  readonly dimensions: number;
  private readonly index: GffIndexLike;
  private readonly embed: ((text: string) => Promise<ArrayLike<number> | null>) | null;

  constructor(
    index: GffIndexLike,
    embed: ((text: string) => Promise<ArrayLike<number> | null>) | null,
  ) {
    this.index = index;
    this.dimensions = index.dim;
    this.embed = embed;
  }

  vectorFor(id: string): Float32Array | null {
    return this.index.vectorFor(id);
  }

  /**
   * Always null: this model cannot be embedded in-process. `retrieveAsync`
   * uses `embedQueryAsync` instead.
   */
  embedQuery(): Float32Array | null {
    return null;
  }

  async embedQueryAsync(query: string): Promise<Float32Array | null> {
    if (!this.embed || !query.trim()) return null;
    const raw = await this.embed(query);
    if (!raw || raw.length < this.dimensions) return null;
    // Truncate (the vectors are Matryoshka-safe) and unit-normalise.
    const out = new Float32Array(this.dimensions);
    let sum = 0;
    for (let i = 0; i < this.dimensions; i += 1) {
      out[i] = raw[i];
      sum += out[i] * out[i];
    }
    if (sum <= 0) return null;
    const inv = 1 / Math.sqrt(sum);
    for (let i = 0; i < this.dimensions; i += 1) out[i] *= inv;
    return out;
  }
}

/**
 * Load the published index and wrap it as a `DenseProvider`.
 * Node-only (it reads files); call it from a server route or at module scope.
 */
export async function loadGffIndexDense(
  options: GffIndexDenseOptions,
): Promise<GffIndexDense> {
  const { indexDir, apiKey, stem, timeoutMs = 4000 } = options;
  const libPath = options.libPath ?? `${indexDir}/../lib/gff-index.mjs`;

  type EmbedFn = (
    text: string,
    key: string,
    opts?: { dim?: number; signal?: AbortSignal },
  ) => Promise<number[]>;

  let index = options.index;
  let embedQuery: EmbedFn | null = null;

  if (!index || !options.embed) {
    // Imported dynamically so bundlers do not pull the loader into a client
    // bundle, and so a missing index fails at call time with a clear error.
    const mod = (await import(/* webpackIgnore: true */ libPath)) as {
      loadIndex: (dir: string, opts?: { stem?: string }) => Promise<GffIndexLike>;
      embedQuery: EmbedFn;
    };
    if (!index) index = await mod.loadIndex(indexDir, stem ? { stem } : {});
    embedQuery = mod.embedQuery;
  }

  const loaded = index;

  const embed = options.embed
    ?? (apiKey && embedQuery
      ? async (text: string) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            return await embedQuery(text, apiKey, {
              dim: loaded.dim,
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timer);
          }
        }
      : null);

  return new GffIndexDense(loaded, embed ?? null);
}
