/**
 * Metadata filtering, applied BEFORE ranking.
 *
 * "Which payments sessions are on day 2" is two operations: restrict to
 * sessions on 2026-09-10, then rank those by relevance to "payments". Filtering
 * first is both cheaper and more correct — a great day-1 session must not
 * outrank a merely good day-2 one when the attendee asked for day 2.
 *
 * Filter values are matched leniently on the surface (case, punctuation and
 * plurals are normalised) but strictly on the token level: hall "204" matches
 * "Hall 204 A&B" because every filter token is present, not because of a
 * substring scan.
 */

import type {
  CorpusRecord,
  RetrievalFilters,
  SessionRecord,
} from './types';
import { normaliseName, normalisePersonName } from './text';

/** Context needed to resolve relative filters like "day 2". */
export interface FilterContext {
  /** All session dates present in the corpus, ascending. */
  readonly days: readonly string[];
}

function asArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value as T];
}

/**
 * Resolve a day reference to an ISO date.
 * Accepts 1/2/3, "day 2", "2026-09-10", "10 september". Returns null when the
 * reference cannot be resolved against the corpus's actual dates.
 */
export function normaliseDay(
  value: string | number,
  context: FilterContext,
): string | null {
  const { days } = context;
  if (typeof value === 'number') {
    return days[value - 1] ?? null;
  }
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return days.includes(raw) ? raw : null;

  const folded = raw.toLowerCase();
  const dayNumber = folded.match(/^day\s*(\d+)$/);
  if (dayNumber) return days[Number(dayNumber[1]) - 1] ?? null;
  if (/^\d+$/.test(folded)) return days[Number(folded) - 1] ?? null;

  const dateA = folded.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+sep(?:t|tember)?$/);
  const dateB = folded.match(/^sep(?:t|tember)?\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  const dayOfMonth = dateA?.[1] ?? dateB?.[1];
  if (dayOfMonth) {
    const iso = `2026-09-${String(Number(dayOfMonth)).padStart(2, '0')}`;
    return days.includes(iso) ? iso : null;
  }
  return null;
}

/**
 * True when every token of `filterValue` is present in `recordValue`.
 * Token-level, so "voice" never matches "invoice".
 */
export function looseMatch(recordValue: string | null, filterValue: string): boolean {
  if (!recordValue) return false;
  const target = normaliseName(recordValue).split(' ').filter(Boolean);
  const wanted = normaliseName(filterValue).split(' ').filter(Boolean);
  if (!wanted.length) return false;
  const set = new Set(target);
  return wanted.every((token) => set.has(token));
}

function matchesAny(recordValue: string | null, filterValues: readonly string[]): boolean {
  return filterValues.some((v) => looseMatch(recordValue, v));
}

export interface FilterOutcome {
  readonly kept: boolean;
  /** Set when the record was removed specifically for being closed-door. */
  readonly droppedClosedDoor: boolean;
}

/** Evaluate one record against the filters. */
export function evaluate(
  record: CorpusRecord,
  filters: RetrievalFilters,
  context: FilterContext,
): FilterOutcome {
  const keep = (kept: boolean): FilterOutcome => ({ kept, droppedClosedDoor: false });

  const types = asArray(filters.type);
  if (types.length && !types.includes(record.type)) return keep(false);

  // Session-only filters immediately exclude non-sessions when specified.
  const sessionOnly =
    filters.day !== undefined ||
    filters.hall !== undefined ||
    filters.format !== undefined ||
    filters.speaker !== undefined ||
    filters.excludeClosedDoor === true;

  if (record.type !== 'session') {
    if (sessionOnly && filters.speaker === undefined) {
      // A day/hall/format filter is meaningless for partners and speakers.
      if (filters.day !== undefined || filters.hall !== undefined || filters.format !== undefined) {
        return keep(false);
      }
    }
    if (filters.speaker !== undefined && record.type === 'speaker') {
      const wanted = asArray(filters.speaker).map(normalisePersonName).filter(Boolean);
      if (wanted.length && !wanted.includes(record.nameKey)) return keep(false);
    } else if (filters.speaker !== undefined) {
      return keep(false);
    }
    if (record.type === 'partner') {
      const sectors = asArray(filters.sector);
      if (sectors.length && !sectors.includes(record.sector)) return keep(false);
      const tiers = asArray(filters.tier).map(String);
      if (tiers.length && !matchesAny(record.tier, tiers)) return keep(false);
    } else {
      // Partner-only filters exclude non-partners when specified.
      if (filters.sector !== undefined || filters.tier !== undefined) return keep(false);
    }
    if (filters.track !== undefined) return keep(false);
    return keep(true);
  }

  const session: SessionRecord = record;

  if (filters.sector !== undefined || filters.tier !== undefined) return keep(false);

  const days = asArray(filters.day);
  if (days.length) {
    const resolved = days
      .map((d) => normaliseDay(d, context))
      .filter((d): d is string => d !== null);
    // An unresolvable day filter matches nothing rather than everything.
    if (!resolved.length || !session.day || !resolved.includes(session.day)) return keep(false);
  }

  const halls = asArray(filters.hall).map(String);
  if (halls.length && !matchesAny(session.hall, halls)) return keep(false);

  const formats = asArray(filters.format).map(String);
  if (formats.length && !matchesAny(session.format, formats)) return keep(false);

  const tracks = asArray(filters.track).map(String);
  if (tracks.length) {
    const haystack = [session.track, ...session.topics];
    const hit = tracks.some((t) => haystack.some((h) => looseMatch(h, t)));
    if (!hit) return keep(false);
  }

  const speakers = asArray(filters.speaker).map(normalisePersonName).filter(Boolean);
  if (speakers.length) {
    const present = new Set(
      [...session.speakerNames, ...session.hostNames].map(normalisePersonName).filter(Boolean),
    );
    if (!speakers.some((s) => present.has(s))) return keep(false);
  }

  // Rule 2, opt-in half: callers that are about to say "you should attend X"
  // can ask for closed-door sessions to be removed entirely.
  if (filters.excludeClosedDoor && session.isClosedDoor) {
    return { kept: false, droppedClosedDoor: true };
  }

  return keep(true);
}

/** Build the filter context from the corpus's session dates. */
export function contextFromRecords(records: readonly CorpusRecord[]): FilterContext {
  const days = [...new Set(
    records
      .filter((r): r is SessionRecord => r.type === 'session')
      .map((r) => r.day)
      .filter((d): d is string => d !== null),
  )].sort();
  return { days };
}
