/**
 * Shared types for the GFF 2026 retrieval module.
 *
 * Three hard rules are encoded in these types, not merely documented:
 *
 *  1. `PartnerRecord` has no booth field. GFF publishes no booth/stall
 *     allocation for 2026 (verified: booth === null on all 319 partner
 *     records). A type that cannot carry booth data cannot leak it, and the
 *     loader strips the key defensively on the way in.
 *  2. `SessionRecord.isClosedDoor` is required, and every session hit carries a
 *     non-optional `advisory` telling the caller it must not be recommended
 *     for attendance.
 *  3. Every hit carries the `id` of a record that resolves in the corpus store;
 *     the ranker drops anything that does not resolve.
 */

export type RecordType = 'partner' | 'speaker' | 'session';

/** Sector taxonomy applied to partners upstream (scratch-4 `category`). */
export type Sector =
  | 'payments'
  | 'lending'
  | 'banking'
  | 'wealthtech'
  | 'insurtech'
  | 'regtech'
  | 'crypto'
  | 'infra'
  | 'ai'
  | 'other';

export interface PartnerRecord {
  readonly type: 'partner';
  /** Stable id, `partner:<slug>`. */
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  /** Sponsorship tier as published, e.g. "Gold Partner", "Exhibitor". */
  readonly tier: string | null;
  readonly sector: Sector;
  readonly whatTheyDo: string | null;
  readonly useCases: readonly string[];
  readonly website: string | null;
  readonly logoUrl: string | null;
  readonly year: number;
  readonly sourceUrl: string;
  // NO booth field. See rule 1 above and `assertNoBoothData`.
}

export interface SpeakerRecord {
  readonly type: 'speaker';
  /** Stable id, `speaker:<normalised-name-slug>`. */
  readonly id: string;
  /** Display name including salutation, e.g. "Smt. Nirmala Sitharaman". */
  readonly name: string;
  /** Salutation-stripped join key, e.g. "nirmala sitharaman". */
  readonly nameKey: string;
  readonly jobTitle: string | null;
  readonly org: string | null;
  readonly bio: string | null;
  readonly country: string | null;
  readonly linkedin: string | null;
  readonly headshotUrl: string | null;
  /** Agenda codes of sessions this person appears on. */
  readonly sessionCodes: readonly string[];
  readonly year: number;
  readonly sourceUrl: string;
}

export interface SessionRecord {
  readonly type: 'session';
  /** Stable id, `session:<agendaCode>`. */
  readonly id: string;
  readonly agendaCode: string;
  readonly title: string;
  readonly description: string | null;
  /** Comma-joined topics as published; may be null. */
  readonly track: string | null;
  readonly topics: readonly string[];
  readonly format: string | null;
  /** ISO date, e.g. "2026-09-10". */
  readonly day: string | null;
  /** 1-based festival day derived from `day`; null if the date is unknown. */
  readonly dayNumber: number | null;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly hall: string | null;
  readonly accessType: string | null;
  /** True when access is anything other than public (invite-only, etc.). */
  readonly isClosedDoor: boolean;
  readonly speakerNames: readonly string[];
  readonly hostNames: readonly string[];
  readonly year: number;
  readonly sourceUrl: string;
}

export type CorpusRecord = PartnerRecord | SpeakerRecord | SessionRecord;

/**
 * Attached to every session hit. `doNotRecommendAttending` is a required
 * boolean so a caller that destructures the hit cannot silently miss it.
 */
export interface Advisory {
  readonly closedDoor: boolean;
  readonly doNotRecommendAttending: boolean;
  /** Human-readable reason, safe to surface to an attendee. */
  readonly reason: string | null;
}

/** Per-channel score breakdown, kept for debugging and for the eval harness. */
export interface ScoreParts {
  /** BM25F over weighted fields, raw. */
  readonly lexical: number;
  /** Dense cosine similarity in [-1, 1], raw. */
  readonly dense: number;
  /** Exact/near-exact name match bonus (0 when no name matched). */
  readonly nameBoost: number;
  /** Normalised lexical contribution actually used in the fused score. */
  readonly lexicalNorm: number;
  /** Normalised dense contribution actually used in the fused score. */
  readonly denseNorm: number;
  /**
   * IDF-weighted share of the query's content terms present in this record,
   * in [0, 1]. Unlike `score`, this is ABSOLUTE — comparable across queries —
   * which is what makes it usable as a no-good-match signal.
   */
  readonly coverage: number;
  /** Clustering of the matched terms, in [0, 1]. Also absolute. */
  readonly proximity: number;
}

export interface Hit<R extends CorpusRecord = CorpusRecord> {
  /** Always resolves in the store this hit came from. */
  readonly id: string;
  readonly type: RecordType;
  readonly score: number;
  readonly record: R;
  readonly parts: ScoreParts;
  /**
   * Names from the query that matched this record exactly, e.g. ["razorpay"].
   * Empty when the record was retrieved semantically only.
   */
  readonly matchedNames: readonly string[];
  /** Present on every session hit; absent for partners and speakers. */
  readonly advisory?: Advisory;
}

/** Metadata filters. All are AND-ed; array values are OR-ed within a field. */
export interface RetrievalFilters {
  readonly type?: RecordType | readonly RecordType[];
  /** "2026-09-10", "day 2", 2, or a mix. Normalised by `normaliseDay`. */
  readonly day?: string | number | readonly (string | number)[];
  readonly hall?: string | readonly string[];
  readonly format?: string | readonly string[];
  /** Matches against `track` and `topics`, case- and punctuation-insensitive. */
  readonly track?: string | readonly string[];
  readonly sector?: Sector | readonly Sector[];
  readonly tier?: string | readonly string[];
  /** Drop closed-door sessions entirely instead of flagging them. */
  readonly excludeClosedDoor?: boolean;
  /** Restrict to sessions featuring this person (normalised name match). */
  readonly speaker?: string | readonly string[];
}

export interface RetrieveOptions {
  readonly filters?: RetrievalFilters;
  /** Max hits to return. Default 10. */
  readonly limit?: number;
  /** Fusion weights; defaults favour lexical, see `DEFAULT_WEIGHTS`. */
  readonly weights?: Partial<FusionWeights>;
  /** Drop hits scoring below this fused score. Default 0 (keep all). */
  readonly minScore?: number;
  /**
   * Precomputed query vector, bypassing the provider's own embedder. Needed
   * when embedding is an async network call (a hosted embedding model) but
   * `retrieve` must stay synchronous. `retrieveAsync` fills this in for you.
   */
  readonly queryVector?: Float32Array | null;
}

/** A dense provider whose query embedding requires I/O. */
export interface AsyncQueryEmbedder {
  embedQueryAsync(query: string): Promise<Float32Array | null>;
}

export interface FusionWeights {
  readonly lexical: number;
  readonly dense: number;
  /** Multiplier on the exact-name bonus. Deliberately large. */
  readonly name: number;
}

export interface RetrievalDiagnostics {
  readonly query: string;
  readonly queryTokens: readonly string[];
  /** Names recognised in the query and the ids they pinned. */
  readonly recognisedNames: readonly string[];
  readonly candidatesBeforeFilter: number;
  readonly candidatesAfterFilter: number;
  /** Hits discarded because their id did not resolve in the store. */
  readonly droppedUnresolved: number;
  /** Closed-door sessions dropped because `excludeClosedDoor` was set. */
  readonly droppedClosedDoor: number;
  /** Which dense provider served this query. */
  readonly denseProvider: string;
  /** True when the dense channel actually contributed to these scores. */
  readonly denseUsed: boolean;
  /**
   * True when a dense provider was configured but produced no query vector —
   * a missing API key, a network failure, or a timeout. The results are still
   * valid (lexical + name answered them) but are weaker on paraphrase queries,
   * so a UI may want to surface this rather than silently serving less.
   */
  readonly denseDegraded: boolean;
}

export interface RetrievalResult {
  readonly hits: readonly Hit[];
  readonly diagnostics: RetrievalDiagnostics;
}

/** Vector source for the dense channel. */
export interface DenseProvider {
  readonly name: string;
  /** Unit-norm document vector, or null if the record has no vector. */
  vectorFor(id: string): Float32Array | null;
  /** Unit-norm query vector, or null when the query has no known terms. */
  embedQuery(query: string): Float32Array | null;
  readonly dimensions: number;
}
