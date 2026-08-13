/**
 * Lexical channel: BM25F + term coverage + proximity.
 *
 * WHY MORE THAN BM25
 * ------------------
 * A bag-of-words matcher cannot tell these apart:
 *
 *   "A prominent voice on digital innovation"          (metaphor, useless)
 *   "beyond voice automation into an agentic AI platform" (literal, correct)
 *
 * Both contain "voice". Two signals separate them without any hand-written
 * sense list:
 *
 *   coverage  - how many of the query's distinct content terms the document
 *               contains at all. The metaphor bios contain "voice" but never
 *               "agent"; the real voice-AI records contain both.
 *   proximity - how tightly the matched terms cluster. "AI voice agent" is
 *               three adjacent tokens; a bio that mentions voice in paragraph
 *               one and agents nowhere scores zero here.
 *
 * Matching is strictly token-level, never substring, so "invoice" can never
 * match "voice" — see the regression test.
 */

import type { CorpusRecord } from './types';
import { fieldsFor } from './fields';
import { tokenize } from './text';

const K1 = 1.2;
const B = 0.75;
/** Token gap inserted between fields so cross-field pairs are never "near". */
const FIELD_GAP = 1000;
/** Two matched terms within this many tokens count as co-located. */
const PROXIMITY_WINDOW = 10;
/**
 * Morphological backoff: a query term of at least this length also matches
 * index terms it is a PREFIX of, at a discount. This is what lets "agent" reach
 * "agentic" without a stemmer aggressive enough to damage other words.
 *
 * Anchoring at the start of the token is the whole safety story: "voice" is not
 * a prefix of "invoice", so the substring bug cannot come back this way.
 */
const MIN_PREFIX_LENGTH = 5;
const PREFIX_DISCOUNT = 0.45;

interface Posting {
  readonly doc: number;
  /** Field-weighted, length-normalised term frequency (BM25F tf-tilde). */
  readonly tfn: number;
  /** Positions in the document's flattened token stream. */
  readonly positions: readonly number[];
}

export interface LexicalScore {
  readonly bm25: number;
  /** IDF-weighted share of query terms present, in [0, 1]. */
  readonly coverage: number;
  /** Clustering of matched terms, in [0, 1]. */
  readonly proximity: number;
  readonly matchedTerms: readonly string[];
}

export interface QueryTerm {
  readonly term: string;
  /** Caller-supplied multiplier, e.g. to demote generic words. */
  readonly weight: number;
}

export class LexicalIndex {
  private readonly inverted = new Map<string, Posting[]>();
  private readonly docCount: number;
  private readonly idfCache = new Map<string, number>();
  readonly docIds: readonly string[];

  constructor(records: readonly CorpusRecord[]) {
    this.docIds = records.map((r) => r.id);
    this.docCount = records.length;

    // Field length statistics, needed before tf can be normalised.
    const perDoc: { tf: Map<string, number>; positions: Map<string, number[]> }[] = [];
    const fieldLengthTotals = new Map<string, { sum: number; n: number }>();
    const rawDocs: { fieldName: string; weight: number; tokens: string[] }[][] = [];

    for (const record of records) {
      const doc = fieldsFor(record).map((f) => {
        const tokens = tokenize(f.text);
        const stat = fieldLengthTotals.get(f.name) ?? { sum: 0, n: 0 };
        stat.sum += tokens.length;
        stat.n += 1;
        fieldLengthTotals.set(f.name, stat);
        return { fieldName: f.name, weight: f.weight, tokens };
      });
      rawDocs.push(doc);
    }

    const avgFieldLength = new Map<string, number>();
    for (const [name, { sum, n }] of fieldLengthTotals) {
      avgFieldLength.set(name, n > 0 ? sum / n : 1);
    }

    for (const doc of rawDocs) {
      const tf = new Map<string, number>();
      const positions = new Map<string, number[]>();
      let cursor = 0;
      for (const f of doc) {
        const avg = avgFieldLength.get(f.fieldName) || 1;
        const norm = 1 - B + (B * f.tokens.length) / (avg || 1);
        f.tokens.forEach((token, i) => {
          tf.set(token, (tf.get(token) ?? 0) + f.weight / (norm || 1));
          const list = positions.get(token);
          if (list) list.push(cursor + i);
          else positions.set(token, [cursor + i]);
        });
        cursor += f.tokens.length + FIELD_GAP;
      }
      perDoc.push({ tf, positions });
    }

    perDoc.forEach(({ tf, positions }, docIdx) => {
      for (const [term, tfn] of tf) {
        const postings = this.inverted.get(term);
        const posting: Posting = { doc: docIdx, tfn, positions: positions.get(term) ?? [] };
        if (postings) postings.push(posting);
        else this.inverted.set(term, [posting]);
      }
    });
  }

  /** Number of documents containing `term`. */
  documentFrequency(term: string): number {
    return this.inverted.get(term)?.length ?? 0;
  }

  /** Robertson/Sparck-Jones IDF, floored at 0 so ubiquitous terms cannot subtract. */
  idf(term: string): number {
    const cached = this.idfCache.get(term);
    if (cached !== undefined) return cached;
    const df = this.documentFrequency(term);
    const value = Math.max(0, Math.log(1 + (this.docCount - df + 0.5) / (df + 0.5)));
    this.idfCache.set(term, value);
    return value;
  }

  /**
   * Score every document that contains at least one query term.
   * Returns a map from document index to its component scores.
   */
  score(queryTerms: readonly QueryTerm[]): Map<number, LexicalScore> {
    const unique = new Map<string, number>();
    for (const { term, weight } of queryTerms) {
      unique.set(term, Math.max(unique.get(term) ?? 0, weight));
    }

    const totalIdf = [...unique].reduce((sum, [t, w]) => sum + this.idf(t) * w, 0);
    const bm25 = new Map<number, number>();
    const matched = new Map<number, string[]>();
    /** Per document, the best idf-weight credited for each query term. */
    const credited = new Map<number, Map<string, number>>();
    const positionsByDoc = new Map<number, Map<string, number[]>>();

    for (const [term, weight] of unique) {
      const idf = this.idf(term);
      for (const { indexTerm, discount } of this.expand(term)) {
        const postings = this.inverted.get(indexTerm);
        if (!postings) continue;
        const effective = weight * discount;
        for (const posting of postings) {
          const contribution = (idf * effective * posting.tfn) / (K1 + posting.tfn);
          bm25.set(posting.doc, (bm25.get(posting.doc) ?? 0) + contribution);

          const terms = matched.get(posting.doc);
          if (terms) terms.push(indexTerm);
          else matched.set(posting.doc, [indexTerm]);

          // Coverage credits each QUERY term once, at its best discount, so a
          // document cannot fake coverage by containing many inflections.
          let perTerm = credited.get(posting.doc);
          if (!perTerm) {
            perTerm = new Map();
            credited.set(posting.doc, perTerm);
          }
          perTerm.set(term, Math.max(perTerm.get(term) ?? 0, idf * effective));

          // Positions are grouped by QUERY term, so proximity measures distance
          // between distinct concepts rather than between inflections.
          let perDocPositions = positionsByDoc.get(posting.doc);
          if (!perDocPositions) {
            perDocPositions = new Map();
            positionsByDoc.set(posting.doc, perDocPositions);
          }
          const existing = perDocPositions.get(term);
          if (existing) existing.push(...posting.positions);
          else perDocPositions.set(term, [...posting.positions]);
        }
      }
    }

    const out = new Map<number, LexicalScore>();
    for (const [doc, score] of bm25) {
      const perTerm = credited.get(doc);
      const covered = perTerm ? [...perTerm.values()].reduce((a, b) => a + b, 0) : 0;
      const positionLists = [...(positionsByDoc.get(doc)?.values() ?? [])].map((l) =>
        [...l].sort((a, b) => a - b),
      );
      out.set(doc, {
        bm25: score,
        coverage: totalIdf > 0 ? Math.min(1, covered / totalIdf) : 0,
        proximity: proximityScore(positionLists, unique.size),
        matchedTerms: [...new Set(matched.get(doc) ?? [])],
      });
    }
    return out;
  }

  /**
   * A query term plus the index terms it backs off to.
   * Exact match always first, at full weight.
   */
  private expand(term: string): { indexTerm: string; discount: number }[] {
    const out = [{ indexTerm: term, discount: 1 }];
    if (term.length < MIN_PREFIX_LENGTH) return out;
    for (const indexTerm of this.inverted.keys()) {
      if (indexTerm.length > term.length && indexTerm.startsWith(term)) {
        out.push({ indexTerm, discount: PREFIX_DISCOUNT });
      }
    }
    return out;
  }
}

/**
 * Proximity over the smallest window containing one occurrence of each matched
 * term. A single-term query has no proximity signal, so it scores 0 and the
 * fusion weights fall back to BM25 alone.
 */
export function proximityScore(
  termPositions: readonly (readonly number[])[],
  distinctQueryTerms: number,
): number {
  const lists = termPositions.filter((l) => l.length > 0);
  if (distinctQueryTerms < 2 || lists.length < 2) return 0;

  // Sweep all occurrences in order, tracking the last position of each term;
  // the window is closed whenever every term has been seen at least once.
  const flat: { pos: number; term: number }[] = [];
  lists.forEach((list, termIdx) => {
    for (const pos of list) flat.push({ pos, term: termIdx });
  });
  flat.sort((a, b) => a.pos - b.pos);

  const lastSeen = new Map<number, number>();
  let best = Infinity;
  for (const { pos, term } of flat) {
    lastSeen.set(term, pos);
    if (lastSeen.size === lists.length) {
      const span = pos - Math.min(...lastSeen.values());
      if (span < best) best = span;
    }
  }
  if (!Number.isFinite(best)) return 0;

  // Fraction of query terms actually co-located, decayed by how far apart they are.
  const completeness = lists.length / distinctQueryTerms;
  const tightness = PROXIMITY_WINDOW / (PROXIMITY_WINDOW + best);
  return completeness * tightness;
}
