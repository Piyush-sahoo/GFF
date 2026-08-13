/**
 * Exact-name matching.
 *
 * Most of what attendees type is a proper noun — a company or a person. Dense
 * retrieval is bad at those (embeddings of rare names are noise) and BM25 is
 * merely okay, so names get their own channel with a heavy, explicit boost.
 *
 * The lexicon holds normalised forms, so all of these hit the same record:
 *
 *   "Razorpay"  "razorpay's"  "Razorpays"  "RAZORPAY?"   -> partner:razorpay
 *   "J.P. Morgan"  "JP Morgan"  "jpmorgan"               -> partner:j-p-morgan
 *   "Dista Technology Pvt. Ltd."  "Dista"                -> partner:dista-...
 *
 * DISTINCTIVENESS GUARD
 * ---------------------
 * A one-word alias is registered only if that word is rare in the corpus.
 * "Voice India" is a real exhibitor, but its bare alias "voice" appears in
 * twenty-odd records, so registering it would let the query "voice agent
 * company" name-match a single exhibitor and pin it above every better answer.
 * Rare words like "razorpay" are safe; common ones are only matchable as part
 * of the full multi-word name.
 */

import type { CorpusRecord } from './types';
import type { LexicalIndex } from './lexical';
import {
  companyAliases,
  normaliseName,
  normalisePersonName,
  stemPlural,
  tokenizeRaw,
} from './text';

/** Longest name form, in tokens, that the scanner will try to match. */
const MAX_NAME_TOKENS = 6;

/**
 * Single-token company names that are also ordinary English words.
 *
 * Corpus document frequency alone cannot catch these: "Raise" is a real
 * exhibitor and the token "raise" is rare IN THE CORPUS, so the distinctiveness
 * guard happily registered it as an entity name — and then "help me raise a
 * Series A" returned that exhibitor as the single best answer in the festival.
 * Rarity in the corpus is not the same as rarity in English.
 *
 * These are DEMOTED, not blocked: "tell me about Raise" should still find it,
 * so a match still scores, just not enough to pin the record at rank 1 on its
 * own. A capitalised occurrence in the raw query restores full strength.
 */
const COMMON_ENGLISH_NAMES: ReadonlySet<string> = new Set([
  'able', 'ace', 'act', 'aim', 'alliance', 'anchor', 'apex', 'arc', 'arrow',
  'aspire', 'atlas', 'aurora', 'axis', 'beam', 'bloom', 'blue', 'bolt', 'bond',
  'boost', 'branch', 'bridge', 'bright', 'bureau', 'cache', 'canopy', 'capital',
  'cargo', 'chain', 'chime', 'circle', 'clarity', 'cloud', 'coast', 'compass',
  'core', 'craft', 'credit', 'crest', 'cube', 'current', 'dash', 'dawn', 'delta',
  'draft', 'drive', 'eagle', 'echo', 'edge', 'element', 'ember', 'engine',
  'equity', 'everest', 'fabric', 'finance', 'flow', 'focus', 'forge', 'form',
  'forward', 'fusion', 'gateway', 'grid', 'grow', 'growth', 'harbour', 'harvest',
  'haven', 'horizon', 'hub', 'impact', 'insight', 'ivy', 'jump', 'keystone',
  'ledger', 'legacy', 'lens', 'lift', 'link', 'loop', 'lumen', 'meridian',
  'mesh', 'mint', 'momentum', 'motion', 'nest', 'nova', 'nugget', 'oak', 'onward',
  'orbit', 'origin', 'path', 'peak', 'pillar', 'pilot', 'pivot', 'plane',
  'pulse', 'quest', 'raise', 'ramp', 'range', 'reach', 'ridge', 'rise', 'river',
  'root', 'scale', 'shield', 'shift', 'signal', 'slice', 'spark', 'sphere',
  'spring', 'sprout', 'stack', 'stride', 'summit', 'surge', 'swift', 'thread',
  'tide', 'trust', 'unity', 'vault', 'venture', 'vertex', 'vista', 'wave',
  'wise', 'zenith',
]);

/** Multiplier applied to a lowercase single-token common-English name match. */
const COMMON_WORD_PENALTY = 0.25;
/**
 * A single-token alias must appear in at most this many documents to be
 * treated as an identity signal. Tuned against the corpus: distinctive brand
 * names sit at 1-4, generic words like "voice" or "payment" sit far above.
 */
const SINGLE_TOKEN_DF_MAX = 6;

type NameKind = 'primary' | 'associated' | 'code';

interface LexiconEntry {
  readonly id: string;
  readonly kind: NameKind;
  readonly tokens: number;
}

export interface NameHit {
  /** The normalised form that matched, e.g. "razorpay". */
  readonly form: string;
  readonly kind: NameKind;
  /** Boost contributed to this record, before fusion weighting. */
  readonly boost: number;
}

/** Base boost by how the name relates to the record. */
const KIND_WEIGHT: Readonly<Record<NameKind, number>> = {
  /** The record IS this entity. */
  primary: 1,
  /** The record features this entity, e.g. a session this person speaks at. */
  associated: 0.6,
  /** An agenda code, which is an exact identifier. */
  code: 1,
};

export class NameLexicon {
  private readonly forms = new Map<string, LexiconEntry[]>();

  constructor(records: readonly CorpusRecord[], index: LexicalIndex) {
    const isDistinctive = (form: string): boolean => {
      const tokens = form.split(' ').filter(Boolean);
      if (tokens.length === 0) return false;
      if (tokens.length > 1) return true;
      const token = tokens[0];
      if (token.length < 3) return false;
      return index.documentFrequency(token) <= SINGLE_TOKEN_DF_MAX;
    };

    const add = (form: string, id: string, kind: NameKind): void => {
      const normalised = form.trim();
      if (!normalised || !isDistinctive(normalised)) return;
      const entries = this.forms.get(normalised);
      const entry: LexiconEntry = {
        id,
        kind,
        tokens: normalised.split(' ').filter(Boolean).length,
      };
      if (entries) {
        if (!entries.some((e) => e.id === id && e.kind === kind)) entries.push(entry);
      } else {
        this.forms.set(normalised, [entry]);
      }
    };

    // Person name -> speaker record, so sessions can be linked by the same key.
    const speakerIdByPerson = new Map<string, string>();
    for (const record of records) {
      if (record.type !== 'speaker') continue;
      const key = record.nameKey || normalisePersonName(record.name);
      if (key) speakerIdByPerson.set(key, record.id);
    }

    for (const record of records) {
      switch (record.type) {
        case 'partner': {
          for (const alias of companyAliases(record.name)) add(alias, record.id, 'primary');
          add(normaliseName(record.slug.replace(/-/g, ' ')), record.id, 'primary');
          break;
        }
        case 'speaker': {
          const key = record.nameKey || normalisePersonName(record.name);
          add(key, record.id, 'primary');
          add(normaliseName(record.name), record.id, 'primary');
          // The employer is an identity signal too, but a weaker one: many
          // people share an org, so it links as "associated".
          if (record.org) {
            for (const alias of companyAliases(record.org)) add(alias, record.id, 'associated');
          }
          break;
        }
        case 'session': {
          add(normaliseName(record.agendaCode), record.id, 'code');
          for (const person of [...record.speakerNames, ...record.hostNames]) {
            const key = normalisePersonName(person);
            if (!key) continue;
            add(key, record.id, 'associated');
            const speakerId = speakerIdByPerson.get(key);
            if (speakerId) add(key, speakerId, 'primary');
          }
          break;
        }
      }
    }
  }

  get size(): number {
    return this.forms.size;
  }

  /** True if `form` (already normalised) is a known entity name. */
  hasForm(form: string): boolean {
    return this.forms.has(form);
  }

  /**
   * Scan the query for entity names, longest match first, without overlap.
   * Returns the boost per record id and the forms that matched.
   */
  match(query: string): { boosts: Map<string, NameHit[]>; recognised: string[] } {
    const tokens = tokenizeRaw(query);
    const boosts = new Map<string, NameHit[]>();
    const recognised: string[] = [];
    // Which normalised tokens the user wrote with a capital letter. Sentence
    // case is ignored — a capital on the first word carries no brand signal.
    const capitalised = capitalisedTokens(query);
    let i = 0;

    while (i < tokens.length) {
      let matchedLength = 0;
      let entries: LexiconEntry[] | undefined;
      let form = '';

      for (let n = Math.min(MAX_NAME_TOKENS, tokens.length - i); n >= 1; n -= 1) {
        const candidate = tokens.slice(i, i + n).join(' ');
        const found = this.forms.get(candidate)
          // "jpmorgan" typed as one word must reach "jp morgan".
          ?? (n === 1 ? this.forms.get(stemPlural(candidate)) : undefined);
        if (found) {
          matchedLength = n;
          entries = found;
          form = candidate;
          break;
        }
      }

      if (!entries || matchedLength === 0) {
        i += 1;
        continue;
      }

      recognised.push(form);
      // Longer names are stronger evidence; a name matched against many records
      // (a big employer) is weaker evidence for any one of them.
      const lengthBonus = 1 + 0.35 * (matchedLength - 1);
      const ambiguityPenalty = 1 / Math.sqrt(entries.length);
      // A one-word name that is also an ordinary English word is only trusted
      // when the user capitalised it, which is how people write brand names.
      const commonWordPenalty =
        matchedLength === 1 && COMMON_ENGLISH_NAMES.has(form) && !capitalised.has(form)
          ? COMMON_WORD_PENALTY
          : 1;
      for (const entry of entries) {
        const boost =
          KIND_WEIGHT[entry.kind] * lengthBonus * ambiguityPenalty * commonWordPenalty;
        const list = boosts.get(entry.id);
        const hit: NameHit = { form, kind: entry.kind, boost };
        if (list) list.push(hit);
        else boosts.set(entry.id, [hit]);
      }
      i += matchedLength;
    }

    return { boosts, recognised };
  }
}

/**
 * Normalised tokens the user capitalised, excluding the first word of the
 * query (sentence case says nothing about brand names) and excluding
 * ALL-CAPS queries (shouting is not evidence either).
 */
export function capitalisedTokens(query: string): Set<string> {
  const words = query.split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  if (words.length && words.join('') === words.join('').toUpperCase()) return out;
  words.forEach((word, i) => {
    if (i === 0) return;
    if (!/^[A-Z]/.test(word)) return;
    const normalised = normaliseName(word);
    if (normalised) out.add(normalised);
  });
  return out;
}

/** Total boost for one record from all its name hits. */
export function totalBoost(hits: readonly NameHit[]): number {
  // Sum, but with diminishing returns so a record cannot win by accumulating
  // many weak associations.
  const sorted = [...hits].sort((a, b) => b.boost - a.boost);
  return sorted.reduce((sum, hit, i) => sum + hit.boost / (1 + i), 0);
}
