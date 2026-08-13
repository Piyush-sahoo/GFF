/** Type declarations for gff-index.mjs — consumable directly from a TS Next.js app. */

export type RecordType = 'partner' | 'speaker' | 'session'

export interface IndexRecord {
  id: string
  type: RecordType
  title: string
}

export interface SearchHit extends IndexRecord {
  /** Cosine similarity in [-1, 1]; higher is more similar. */
  score: number
  /** 0-based position in this result set. */
  rank: number
}

export interface SearchOptions {
  /** Number of results to return. Default 10. */
  k?: number
  /** Restrict to one or more record types. */
  type?: RecordType | RecordType[]
  /** Drop hits scoring below this threshold. */
  minScore?: number
  /** Arbitrary predicate over the record; applied before scoring. */
  filter?: (rec: IndexRecord) => boolean
}

export interface IndexManifest {
  name: string
  model: string
  nativeDim: number
  dim: number
  count: number
  dtype: 'int8'
  scale: number
  normalised: boolean
  corpusSha: string
  taskTypes: { document: string; query: string }
  vectorsFile: string
  records: IndexRecord[]
}

export declare class GffIndex {
  readonly manifest: IndexManifest
  readonly dim: number
  readonly count: number
  readonly records: IndexRecord[]
  search(query: ArrayLike<number>, opts?: SearchOptions): SearchHit[]
  vectorFor(id: string): Float32Array | null
  similarTo(id: string, opts?: SearchOptions): SearchHit[]
}

export declare function loadIndex(
  dir: string,
  opts?: { stem?: string },
): Promise<GffIndex>

export declare function embedQuery(
  text: string,
  apiKey: string,
  opts?: { dim?: number; signal?: AbortSignal },
): Promise<number[]>

export declare const EMBED_MODEL: string
