/**
 * Query analysis: strip self-descriptive filler, infer intent, weight terms.
 *
 * Attendees describe THEMSELVES before saying what they want:
 *
 *   "I am a voice agent company looking for partner and networking"
 *
 * Of those eleven words only "voice" and "agent" say anything about which
 * records to return. "company", "looking", "partner" and "networking" are
 * filler *in this position* — and the first of them is what dragged in a
 * speaker whose job title is Company Secretary and a chairman whose employer is
 * literally named "...Innovation Company of Trinidad & Tobago".
 *
 * Type words ("partner", "sessions", "speaker") become SOFT hints, never hard
 * filters, unless the caller explicitly opts in. The same query above wants
 * partners but must still surface the CEO of a voice-AI company; a hard
 * type=partner filter would delete that correct answer.
 */

import type { RecordType, RetrievalFilters } from './types';
import type { QueryTerm } from './lexical';
import { tokenize } from './text';

/**
 * First-person framing and intent verbs. These describe the asker's action,
 * not the thing being asked for.
 */
const INTENT_FILLER: ReadonlySet<string> = new Set([
  'am', 'attend', 'attending', 'build', 'building', 'connect', 'connecting',
  'explore', 'exploring', 'find', 'finding', 'hello', 'help', 'hey', 'hi',
  'hope', 'hoping', 'interest', 'interested', 'look', 'looking', 'meet',
  'meeting', 'need', 'needing', 'recommend', 'search', 'searching', 'see',
  'seek', 'seeking', 'speak', 'speaking', 'talking', 'thanks', 'try', 'trying',
  'visit', 'want', 'wanting', 'work', 'working', 'happening', 'presenting',
]);

/** Generic business nouns that carry no discriminating signal in a query. */
const GENERIC_BUSINESS: ReadonlySet<string> = new Set([
  'anyone', 'business', 'companie', 'company', 'enterprise', 'firm', 'folk',
  'guy', 'org', 'organisation', 'organization', 'people', 'someone', 'startup',
  'team', 'vendor',
]);

/** Words that hint at a record type. Soft by default. */
const TYPE_WORDS: ReadonlyMap<string, RecordType> = new Map<string, RecordType>([
  ['partner', 'partner'], ['partnership', 'partner'], ['sponsor', 'partner'],
  ['exhibitor', 'partner'], ['exhibiting', 'partner'], ['booth', 'partner'],
  ['stall', 'partner'], ['networking', 'partner'],
  ['speaker', 'speaker'], ['panelist', 'speaker'], ['panellist', 'speaker'],
  ['presenter', 'speaker'], ['founder', 'speaker'], ['ceo', 'speaker'],
  ['session', 'session'], ['talk', 'session'], ['panel', 'session'],
  ['keynote', 'session'], ['workshop', 'session'], ['masterclass', 'session'],
  ['roundtable', 'session'], ['fireside', 'session'], ['agenda', 'session'],
  ['schedule', 'session'],
]);

/**
 * Type words that also carry real content and so are kept as search terms as
 * well as hints. "keynote" and "masterclass" are literal session formats;
 * "partner" and "networking" are not descriptive of any record's text.
 */
const CONTENTFUL_TYPE_WORDS: ReadonlySet<string> = new Set([
  'keynote', 'workshop', 'masterclass', 'roundtable', 'fireside', 'panel',
  'founder', 'ceo',
]);

const NUMBER_WORDS: ReadonlyMap<string, number> = new Map([
  ['one', 1], ['first', 1], ['two', 2], ['second', 2], ['three', 3],
  ['third', 3], ['last', 3], ['final', 3],
]);

/** Weight applied to terms kept but known to be weak discriminators. */
const DEMOTED_WEIGHT = 0.3;

export interface AnalysedQuery {
  readonly raw: string;
  /** Content terms with weights, ready for the lexical and dense channels. */
  readonly terms: readonly QueryTerm[];
  /** Terms removed as filler, for diagnostics and for explaining a bad result. */
  readonly droppedFiller: readonly string[];
  /** Record types the phrasing suggests. Advisory; applied as a boost. */
  readonly typeHints: readonly RecordType[];
  /** Filters legible from the text, e.g. "day 2". Applied only on request. */
  readonly inferredFilters: RetrievalFilters;
}

/** Extract a day reference: "day 2", "second day", "10 september", "2026-09-10". */
function inferDay(raw: string): string | number | null {
  const folded = raw.toLowerCase();
  const iso = folded.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const dayNum = folded.match(/\bday\s*([123])\b/);
  if (dayNum) return Number(dayNum[1]);
  const wordFirst = folded.match(/\b(first|second|third|last|final)\s+day\b/);
  if (wordFirst) return NUMBER_WORDS.get(wordFirst[1]) ?? null;
  const dayWord = folded.match(/\bday\s+(one|two|three)\b/);
  if (dayWord) return NUMBER_WORDS.get(dayWord[1]) ?? null;
  const dateA = folded.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+sep(?:t|tember)?\b/);
  if (dateA) return `2026-09-${String(Number(dateA[1])).padStart(2, '0')}`;
  const dateB = folded.match(/\bsep(?:t|tember)?\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dateB) return `2026-09-${String(Number(dateB[1])).padStart(2, '0')}`;
  return null;
}

export interface AnalyseOptions {
  /**
   * Keep filler words as demoted terms instead of dropping them. Useful when a
   * query is nothing but filler and would otherwise analyse to zero terms.
   */
  readonly keepFiller?: boolean;
}

export function analyseQuery(raw: string, options: AnalyseOptions = {}): AnalysedQuery {
  const tokens = tokenize(raw);
  const terms: QueryTerm[] = [];
  const dropped: string[] = [];
  const typeHints = new Set<RecordType>();

  for (const token of tokens) {
    const type = TYPE_WORDS.get(token);
    if (type) {
      typeHints.add(type);
      // A type word is a hint; it stays a search term only if it also names
      // something records actually contain (a format, a job title).
      if (CONTENTFUL_TYPE_WORDS.has(token)) {
        terms.push({ term: token, weight: 1 });
      } else {
        dropped.push(token);
      }
      continue;
    }
    if (INTENT_FILLER.has(token) || GENERIC_BUSINESS.has(token)) {
      if (options.keepFiller) terms.push({ term: token, weight: DEMOTED_WEIGHT });
      else dropped.push(token);
      continue;
    }
    terms.push({ term: token, weight: 1 });
  }

  const day = inferDay(raw);
  const inferredFilters: RetrievalFilters = day !== null ? { day } : {};

  // A query made entirely of filler still has to retrieve something; fall back
  // to the filler rather than returning nothing at all.
  if (!terms.length && dropped.length && !options.keepFiller) {
    return {
      raw,
      terms: dropped.map((term) => ({ term, weight: DEMOTED_WEIGHT })),
      droppedFiller: [],
      typeHints: [...typeHints],
      inferredFilters,
    };
  }

  return {
    raw,
    terms,
    droppedFiller: dropped,
    typeHints: [...typeHints],
    inferredFilters,
  };
}

export const __internal = { INTENT_FILLER, GENERIC_BUSINESS, TYPE_WORDS };
