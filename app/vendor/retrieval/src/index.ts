/**
 * GFF 2026 attendee chatbot — retrieval and ranking module.
 *
 * Typical use from the Next.js app:
 *
 *   import { createRetriever } from '@gff/retrieval';
 *
 *   const retriever = createRetriever({
 *     jsonlPath: process.env.GFF_CORPUS_JSONL,   // preferred when published
 *     rawDir: process.env.GFF_RAW_DIR,           // fallback
 *   });
 *
 *   const { hits } = retriever.retrieve('which payments sessions are on day 2', {
 *     filters: { type: 'session', day: 2 },
 *     limit: 8,
 *   });
 *
 * Build the retriever ONCE per process (module scope or a cached singleton);
 * indexing the corpus is the expensive part, querying is not.
 *
 * Three guarantees the caller can rely on:
 *   - no hit ever carries booth data for a partner (GFF 2026 publishes none);
 *   - every session hit carries `advisory`, and closed-door sessions are
 *     flagged `doNotRecommendAttending: true`;
 *   - every hit's `id` resolves via `retriever.get(id)`.
 */

export { createRetriever, Retriever, DEFAULT_WEIGHTS } from './retriever';
export { assertSafeToRecommend, recommendable, ClosedDoorError } from './retriever';
export type { RetrieverOptions } from './retriever';

export {
  CorpusStore,
  CorpusError,
  assertNoBoothData,
  loadCorpus,
  loadCorpusFromJsonl,
  loadCorpusFromRawDir,
  corpusFromRecords,
} from './corpus';
export type { CorpusLoadReport, LoadCorpusOptions, LoadedCorpus } from './corpus';

export { RandomIndexingDense, ExternalDense, NULL_DENSE, cosine } from './dense';
export { GffIndexDense, loadGffIndexDense } from './adapters/gff-index';
export type { GffIndexDenseOptions, GffIndexLike } from './adapters/gff-index';
export type { ExternalDenseOptions } from './dense';

export { analyseQuery } from './query';
export type { AnalysedQuery } from './query';

export { normaliseDay, looseMatch, contextFromRecords } from './filters';

export {
  tokenize,
  normaliseName,
  normalisePersonName,
  companyAliases,
  stemPlural,
  stripPossessive,
} from './text';

export { LexicalIndex } from './lexical';
export { NameLexicon } from './names';

export type {
  Advisory,
  CorpusRecord,
  DenseProvider,
  FusionWeights,
  Hit,
  PartnerRecord,
  RecordType,
  RetrievalDiagnostics,
  RetrievalFilters,
  RetrievalResult,
  RetrieveOptions,
  ScoreParts,
  Sector,
  SessionRecord,
  SpeakerRecord,
} from './types';
