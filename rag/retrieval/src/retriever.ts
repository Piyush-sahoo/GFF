/**
 * Hybrid retriever: lexical + dense + exact-name, with metadata pre-filtering.
 *
 * ENFORCEMENT (not documentation)
 * -------------------------------
 *   Rule 1  Booth data cannot be returned: partner records have no booth field
 *           (stripped at load), and `retrieve` asserts on the way out.
 *   Rule 2  Every session hit carries a required `advisory`; closed-door
 *           sessions are returned for information with
 *           `doNotRecommendAttending: true`. `assertSafeToRecommend` throws.
 *   Rule 3  Every hit is resolved through `CorpusStore.get`. Anything that does
 *           not resolve is dropped and counted in `diagnostics.droppedUnresolved`
 *           rather than passed through.
 */

import type {
  AsyncQueryEmbedder,
  CorpusRecord,
  DenseProvider,
  FusionWeights,
  Hit,
  RecordType,
  RetrievalResult,
  RetrieveOptions,
  SessionRecord,
} from './types';
import { CorpusStore, assertNoBoothData, loadCorpus } from './corpus';
import type { LoadCorpusOptions, LoadedCorpus } from './corpus';
import { LexicalIndex } from './lexical';
import { NameLexicon, totalBoost } from './names';
import { RandomIndexingDense, cosine } from './dense';
import { analyseQuery } from './query';
import { contextFromRecords, evaluate } from './filters';
import type { FilterContext } from './filters';

export const DEFAULT_WEIGHTS: FusionWeights = {
  lexical: 0.55,
  dense: 0.3,
  /**
   * Deliberately larger than the other two combined. An exact company or person
   * name is the strongest signal an attendee can give, and losing it to
   * semantic drift is the failure this module exists to prevent.
   */
  name: 1.6,
};

/** How much of the lexical signal comes from raw BM25 vs coverage vs proximity. */
const LEXICAL_MIX = { bm25: 0.55, coverage: 0.3, proximity: 0.15 } as const;
/** Additive nudge when the query's phrasing hints at this record type. */
const TYPE_HINT_BONUS = 0.08;
/** Name boost saturates here, so one strong name match is enough. */
const NAME_SATURATION = 2;

const CLOSED_DOOR_REASON =
  'Closed-door session: access is restricted (invite-only). Returned for ' +
  'information only — do not tell an attendee to attend it.';

function advisoryFor(session: SessionRecord) {
  return session.isClosedDoor
    ? { closedDoor: true, doNotRecommendAttending: true, reason: CLOSED_DOOR_REASON }
    : { closedDoor: false, doNotRecommendAttending: false, reason: null };
}

export interface RetrieverOptions extends LoadCorpusOptions {
  /** Preloaded corpus; skips loading from disk. */
  readonly corpus?: LoadedCorpus;
  /** Dense provider. Defaults to corpus-derived random indexing. */
  readonly dense?: DenseProvider;
  /** Overrides the default fusion weights for every query. */
  readonly weights?: Partial<FusionWeights>;
}

export class Retriever {
  readonly store: CorpusStore;
  private readonly lexical: LexicalIndex;
  private readonly names: NameLexicon;
  private readonly dense: DenseProvider;
  private readonly context: FilterContext;
  private readonly defaultWeights: FusionWeights;

  constructor(options: RetrieverOptions = {}) {
    const loaded = options.corpus ?? loadCorpus(options);
    this.store = new CorpusStore(loaded);
    const records = this.store.records;

    this.lexical = new LexicalIndex(records);
    this.names = new NameLexicon(records, this.lexical);
    this.dense = options.dense ?? new RandomIndexingDense(records);
    this.context = contextFromRecords(records);
    this.defaultWeights = { ...DEFAULT_WEIGHTS, ...options.weights };
  }

  get size(): number {
    return this.store.size;
  }

  /** Days present in the corpus, ascending. Useful for UI day pickers. */
  get days(): readonly string[] {
    return this.context.days;
  }

  retrieve(query: string, options: RetrieveOptions = {}): RetrievalResult {
    const limit = options.limit ?? 10;
    const minScore = options.minScore ?? 0;
    const weights = { ...this.defaultWeights, ...options.weights };
    const filters = options.filters ?? {};

    const analysed = analyseQuery(query);
    const records = this.store.records;

    // --- filter BEFORE ranking -------------------------------------------
    const allowed: number[] = [];
    let droppedClosedDoor = 0;
    records.forEach((record, i) => {
      const outcome = evaluate(record, filters, this.context);
      if (outcome.kept) allowed.push(i);
      else if (outcome.droppedClosedDoor) droppedClosedDoor += 1;
    });
    const allowedSet = new Set(allowed);

    // --- channel scores ----------------------------------------------------
    const lexicalScores = this.lexical.score(analysed.terms);
    const { boosts: nameBoosts, recognised } = this.names.match(query);

    const queryVector =
      options.queryVector !== undefined ? options.queryVector : this.embedQuery(analysed);
    const denseScores = new Map<number, number>();
    if (queryVector) {
      for (const i of allowed) {
        const vec = this.dense.vectorFor(records[i].id);
        if (vec) denseScores.set(i, cosine(queryVector, vec));
      }
    }

    // Normalisation is computed over the FILTERED candidate set, so a filtered
    // query is scored on its own scale rather than the whole corpus's.
    let maxBm25 = 0;
    let maxDense = 0;
    for (const i of allowed) {
      maxBm25 = Math.max(maxBm25, lexicalScores.get(i)?.bm25 ?? 0);
      maxDense = Math.max(maxDense, denseScores.get(i) ?? 0);
    }

    const typeHints = new Set<RecordType>(analysed.typeHints);
    const scored: { index: number; hit: Hit }[] = [];

    for (const i of allowed) {
      const record = records[i];
      const lex = lexicalScores.get(i);
      const denseRaw = denseScores.get(i) ?? 0;
      const nameHits = nameBoosts.get(record.id) ?? [];
      const nameRaw = nameHits.length ? totalBoost(nameHits) : 0;

      const lexicalNorm = maxBm25 > 0 && lex
        ? (lex.bm25 / maxBm25) * LEXICAL_MIX.bm25 +
          lex.coverage * LEXICAL_MIX.coverage +
          lex.proximity * LEXICAL_MIX.proximity
        : 0;
      const denseNorm = maxDense > 0 ? Math.max(0, denseRaw) / maxDense : 0;
      const nameNorm = Math.min(1, nameRaw / NAME_SATURATION);

      let score =
        weights.lexical * lexicalNorm +
        weights.dense * denseNorm +
        weights.name * nameNorm;
      if (typeHints.has(record.type)) score += TYPE_HINT_BONUS;

      if (score <= 0) continue;

      scored.push({
        index: i,
        hit: {
          id: record.id,
          type: record.type,
          score,
          record,
          parts: {
            lexical: lex?.bm25 ?? 0,
            dense: denseRaw,
            nameBoost: nameRaw,
            lexicalNorm,
            denseNorm,
            coverage: lex?.coverage ?? 0,
            proximity: lex?.proximity ?? 0,
          },
          matchedNames: nameHits.map((h) => h.form),
          ...(record.type === 'session' ? { advisory: advisoryFor(record) } : {}),
        },
      });
    }

    scored.sort((a, b) => b.hit.score - a.hit.score || a.hit.id.localeCompare(b.hit.id));

    // --- rule 3: nothing leaves without resolving --------------------------
    let droppedUnresolved = 0;
    const hits: Hit[] = [];
    for (const { hit } of scored) {
      if (hit.score < minScore) continue;
      const resolved = this.store.get(hit.id);
      if (!resolved || resolved !== hit.record) {
        droppedUnresolved += 1;
        continue;
      }
      hits.push(hit);
      if (hits.length >= limit) break;
    }

    // --- rule 1: nothing leaves carrying booth data ------------------------
    assertNoBoothData(hits);

    return {
      hits,
      diagnostics: {
        query,
        queryTokens: analysed.terms.map((t) => t.term),
        recognisedNames: recognised,
        candidatesBeforeFilter: records.length,
        candidatesAfterFilter: allowedSet.size,
        droppedUnresolved,
        droppedClosedDoor,
        denseProvider: this.dense.name,
        denseUsed: queryVector !== null && maxDense > 0,
        denseDegraded: this.dense.dimensions > 0 && queryVector === null,
      },
    };
  }

  /**
   * Same as `retrieve`, but awaits the dense provider's query embedding first
   * when that provider needs I/O (a hosted embedding model). Falls straight
   * through to `retrieve` for in-process providers.
   *
   * If embedding fails — no API key, rate limit, timeout — retrieval degrades
   * to the lexical and name channels rather than throwing. A slightly worse
   * answer beats a 500 on the /ask route.
   */
  async retrieveAsync(query: string, options: RetrieveOptions = {}): Promise<RetrievalResult> {
    const provider = this.dense as Partial<AsyncQueryEmbedder>;
    if (options.queryVector !== undefined || typeof provider.embedQueryAsync !== 'function') {
      return this.retrieve(query, options);
    }
    // The RAW query goes to the embedding model, deliberately.
    // Filler-stripping is a lexical-channel concern: BM25 needs discriminating
    // terms, but a sentence embedder needs a sentence. Handing it "raise series"
    // instead of "help me raise a Series A" throws away the grammatical context
    // that is the entire reason for calling a hosted model.
    let queryVector: Float32Array | null = null;
    try {
      queryVector = await provider.embedQueryAsync(query);
    } catch {
      queryVector = null;
    }
    return this.retrieve(query, { ...options, queryVector });
  }

  private embedQuery(analysed: ReturnType<typeof analyseQuery>): Float32Array | null {
    if (this.dense instanceof RandomIndexingDense) {
      return this.dense.embedWeighted(analysed.terms);
    }
    // External providers get the raw sentence, for the reason in retrieveAsync.
    return this.dense.embedQuery(analysed.raw);
  }

  /** Resolve a record by id. Returns undefined rather than fabricating. */
  get(id: string): CorpusRecord | undefined {
    return this.store.get(id);
  }
}

/** Convenience factory. */
export function createRetriever(options: RetrieverOptions = {}): Retriever {
  return new Retriever(options);
}

export class ClosedDoorError extends Error {}

/**
 * Rule 2, assertable. Call before phrasing any "you should attend ..."
 * recommendation. Throws for closed-door sessions; safe for everything else.
 */
export function assertSafeToRecommend(hit: Hit): void {
  if (hit.advisory?.doNotRecommendAttending) {
    throw new ClosedDoorError(
      `${hit.id} ("${'title' in hit.record ? hit.record.title : hit.id}") is closed-door ` +
        'and must not be recommended for attendance.',
    );
  }
}

/** Hits an attendee can be told to attend. Closed-door sessions are removed. */
export function recommendable(hits: readonly Hit[]): Hit[] {
  return hits.filter((h) => !h.advisory?.doNotRecommendAttending);
}
