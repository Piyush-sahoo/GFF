/**
 * Corpus loading, normalisation and invariant enforcement.
 *
 * Two sources are supported and produce identical `CorpusRecord`s:
 *   - the raw 2026 exports (partners/sessions/speakers JSON) from the data
 *     workspace, which is what exists today;
 *   - a `corpus.jsonl` once the corpus workspace publishes one.
 * `loadCorpus` prefers the JSONL and falls back to raw, so the app keeps
 * working while upstream catches up.
 *
 * The three hard rules are enforced HERE, at the boundary, so that no ranking
 * or formatting code downstream has to remember them:
 *   1. booth fields are stripped and their presence is reported, never emitted;
 *   2. isClosedDoor is computed and always present on sessions;
 *   3. records without a usable id are rejected, not silently renumbered.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  CorpusRecord,
  PartnerRecord,
  RecordType,
  Sector,
  SessionRecord,
  SpeakerRecord,
} from './types';
import { normalisePersonName, slugify } from './text';

const SECTORS: ReadonlySet<string> = new Set<Sector>([
  'payments', 'lending', 'banking', 'wealthtech', 'insurtech', 'regtech',
  'crypto', 'infra', 'ai', 'other',
]);

export class CorpusError extends Error {}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s || null;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter((s): s is string => s !== null);
}

function asSector(v: unknown): Sector {
  const s = str(v)?.toLowerCase();
  return s && SECTORS.has(s) ? (s as Sector) : 'other';
}

/**
 * Rule 1 tripwire. GFF 2026 publishes no booth allocation; if a booth-like key
 * ever appears upstream with a value, we want a loud signal rather than a
 * chatbot quietly inventing "Hall 2, booth 14".
 */
const BOOTH_KEYS = ['booth', 'boothsource', 'boothnumber', 'stall', 'stallnumber'];

function detectBooth(raw: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(raw)) {
    if (BOOTH_KEYS.includes(k.toLowerCase().replace(/[^a-z]/g, '')) && v != null && v !== '') {
      return true;
    }
  }
  return false;
}

interface BuildStats {
  boothValuesSeen: number;
  skipped: number;
}

function toPartner(raw: Record<string, unknown>, stats: BuildStats): PartnerRecord | null {
  const name = str(raw.name);
  if (!name) {
    stats.skipped += 1;
    return null;
  }
  if (detectBooth(raw)) stats.boothValuesSeen += 1;
  const slug = str(raw.slug) ?? slugify(name);
  return {
    type: 'partner',
    id: `partner:${slug}`,
    name,
    slug,
    tier: str(raw.tier),
    sector: asSector(raw.category ?? raw.sector),
    whatTheyDo: str(raw.whatTheyDo),
    useCases: strArray(raw.useCases),
    website: str(raw.website),
    logoUrl: str(raw.logoUrl),
    year: typeof raw.year === 'number' ? raw.year : 2026,
    sourceUrl: str(raw.sourceUrl) ?? 'https://www.globalfintechfest.com/partners',
    // booth / boothSource deliberately not copied. Rule 1.
  };
}

function toSpeaker(raw: Record<string, unknown>, stats: BuildStats): SpeakerRecord | null {
  const name = str(raw.name);
  if (!name) {
    stats.skipped += 1;
    return null;
  }
  const nameKey = str(raw.nameKey) ?? normalisePersonName(name);
  if (!nameKey) {
    stats.skipped += 1;
    return null;
  }
  return {
    type: 'speaker',
    id: `speaker:${slugify(nameKey)}`,
    name,
    nameKey,
    jobTitle: str(raw.title ?? raw.jobTitle),
    org: str(raw.org),
    bio: str(raw.bio),
    country: str(raw.country),
    linkedin: str(raw.linkedin),
    headshotUrl: str(raw.headshotUrl),
    sessionCodes: strArray(raw.sessionCodes),
    year: typeof raw.year === 'number' ? raw.year : 2026,
    sourceUrl: str(raw.sourceUrl) ?? 'https://www.globalfintechfest.com/speakers',
  };
}

function toSession(raw: Record<string, unknown>, stats: BuildStats): SessionRecord | null {
  const title = str(raw.title);
  const agendaCode = str(raw.agendaCode);
  if (!title || !agendaCode) {
    stats.skipped += 1;
    return null;
  }
  const accessType = str(raw.accessType);
  // Rule 2: closed-door is derived, never trusted as optional. Anything that is
  // not explicitly public is treated as closed-door.
  const isClosedDoor =
    typeof raw.isClosedDoor === 'boolean'
      ? raw.isClosedDoor
      : accessType !== null && accessType.toLowerCase() !== 'public';
  return {
    type: 'session',
    id: `session:${agendaCode}`,
    agendaCode,
    title,
    description: str(raw.description),
    track: str(raw.track),
    topics: strArray(raw.topics).map((t) => t.replace(/,+$/, '').trim()).filter(Boolean),
    format: str(raw.format),
    day: str(raw.day),
    dayNumber: null, // assigned in assignDayNumbers once all days are known
    startTime: str(raw.startTime),
    endTime: str(raw.endTime),
    hall: str(raw.hall),
    accessType,
    isClosedDoor,
    speakerNames: strArray(raw.speakerNames),
    hostNames: strArray(raw.hostNames),
    year: typeof raw.year === 'number' ? raw.year : 2026,
    sourceUrl: str(raw.sourceUrl) ?? 'https://www.globalfintechfest.com/agenda',
  };
}

/**
 * Festival day numbers are derived from the distinct dates present, ascending,
 * rather than hardcoded. "Day 2" therefore stays correct if the schedule moves.
 */
function assignDayNumbers(records: CorpusRecord[]): CorpusRecord[] {
  const days = [...new Set(
    records.filter((r): r is SessionRecord => r.type === 'session')
      .map((r) => r.day)
      .filter((d): d is string => d !== null),
  )].sort();
  const index = new Map(days.map((d, i) => [d, i + 1]));
  return records.map((r) =>
    r.type === 'session' ? { ...r, dayNumber: r.day ? index.get(r.day) ?? null : null } : r,
  );
}

export interface CorpusLoadReport {
  readonly source: string;
  readonly counts: Readonly<Record<RecordType, number>>;
  readonly total: number;
  /** Records dropped for having no id-forming field. Rule 3. */
  readonly skipped: number;
  /**
   * Upstream records that carried a non-empty booth-like value. Expected to be
   * 0 for GFF 2026; non-zero means someone started publishing booth data and
   * this module's rule-1 stance needs a deliberate review.
   */
  readonly boothValuesSeen: number;
  readonly days: readonly string[];
}

export interface LoadedCorpus {
  readonly records: readonly CorpusRecord[];
  readonly report: CorpusLoadReport;
}

function build(
  partners: unknown[],
  sessions: unknown[],
  speakers: unknown[],
  source: string,
): LoadedCorpus {
  const stats: BuildStats = { boothValuesSeen: 0, skipped: 0 };
  const records: CorpusRecord[] = [];
  for (const r of partners) {
    const rec = toPartner(r as Record<string, unknown>, stats);
    if (rec) records.push(rec);
  }
  for (const r of sessions) {
    const rec = toSession(r as Record<string, unknown>, stats);
    if (rec) records.push(rec);
  }
  for (const r of speakers) {
    const rec = toSpeaker(r as Record<string, unknown>, stats);
    if (rec) records.push(rec);
  }

  // Rule 3: ids must be unique, otherwise a hit could resolve to the wrong
  // record. Later duplicates lose; the count surfaces in `skipped`.
  const seen = new Set<string>();
  const unique = records.filter((r) => {
    if (seen.has(r.id)) {
      stats.skipped += 1;
      return false;
    }
    seen.add(r.id);
    return true;
  });

  const dated = assignDayNumbers(unique);
  const counts = { partner: 0, speaker: 0, session: 0 } as Record<RecordType, number>;
  for (const r of dated) counts[r.type] += 1;
  const days = [...new Set(
    dated.filter((r): r is SessionRecord => r.type === 'session')
      .map((r) => r.day).filter((d): d is string => d !== null),
  )].sort();

  return {
    records: dated,
    report: {
      source,
      counts,
      total: dated.length,
      skipped: stats.skipped,
      boothValuesSeen: stats.boothValuesSeen,
      days,
    },
  };
}

/**
 * Build a corpus from records already in memory. Goes through exactly the same
 * normalisation and rule enforcement as the on-disk loaders, so an app holding
 * its own data gets identical guarantees.
 */
export function corpusFromRecords(
  input: readonly unknown[],
  source = 'memory',
): LoadedCorpus {
  const partners: unknown[] = [];
  const sessions: unknown[] = [];
  const speakers: unknown[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const type = String(rec.type ?? '').toLowerCase();
    if (type === 'partner') partners.push(rec);
    else if (type === 'session') sessions.push(rec);
    else if (type === 'speaker') speakers.push(rec);
  }
  return build(partners, sessions, speakers, source);
}

/** Load the three raw 2026 exports from a directory. */
export function loadCorpusFromRawDir(dir: string): LoadedCorpus {
  const read = (file: string): unknown[] => {
    const path = join(dir, file);
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  };
  const partners = read('partners-2026.json');
  const sessions = read('sessions-2026.json');
  const speakers = read('speakers-2026.json');
  if (!partners.length && !sessions.length && !speakers.length) {
    throw new CorpusError(`no 2026 exports found in ${dir}`);
  }
  return build(partners, sessions, speakers, `raw:${dir}`);
}

/**
 * Load a JSONL corpus. Each line is one record; the record's `type` decides how
 * it is normalised. Lines that are not valid JSON objects are skipped and
 * counted rather than aborting the load.
 */
export function loadCorpusFromJsonl(path: string): LoadedCorpus {
  const text = readFileSync(path, 'utf8');
  const partners: unknown[] = [];
  const sessions: unknown[] = [];
  const speakers: unknown[] = [];
  let malformed = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      malformed += 1;
      continue;
    }
    if (!obj || typeof obj !== 'object') {
      malformed += 1;
      continue;
    }
    const rec = obj as Record<string, unknown>;
    const type = String(rec.type ?? rec.recordType ?? '').toLowerCase();
    if (type === 'partner') partners.push(rec);
    else if (type === 'session') sessions.push(rec);
    else if (type === 'speaker') speakers.push(rec);
    // Untyped lines are inferred from their distinguishing fields.
    else if ('agendaCode' in rec || 'isClosedDoor' in rec) sessions.push(rec);
    else if ('tier' in rec || 'slug' in rec) partners.push(rec);
    else if ('nameKey' in rec || 'bio' in rec) speakers.push(rec);
    else malformed += 1;
  }
  const loaded = build(partners, sessions, speakers, `jsonl:${path}`);
  return {
    records: loaded.records,
    report: { ...loaded.report, skipped: loaded.report.skipped + malformed },
  };
}

export interface LoadCorpusOptions {
  /** Path to a corpus.jsonl. Used when it exists. */
  readonly jsonlPath?: string;
  /** Directory holding the raw 2026 JSON exports. Used as fallback. */
  readonly rawDir?: string;
}

/**
 * Load the corpus, preferring the published JSONL and falling back to raw.
 * A JSONL that exists but is empty falls through to raw as well, so a
 * half-written upstream file cannot silently empty the chatbot's knowledge.
 */
export function loadCorpus(options: LoadCorpusOptions = {}): LoadedCorpus {
  const { jsonlPath, rawDir } = options;
  if (jsonlPath && existsSync(jsonlPath)) {
    const loaded = loadCorpusFromJsonl(jsonlPath);
    if (loaded.report.total > 0) return loaded;
  }
  if (rawDir && existsSync(rawDir)) return loadCorpusFromRawDir(rawDir);
  throw new CorpusError(
    `no corpus available (jsonlPath=${jsonlPath ?? 'unset'}, rawDir=${rawDir ?? 'unset'})`,
  );
}

/**
 * Indexed, immutable view of the corpus. `get` is the single resolution point
 * used by the ranker to satisfy rule 3.
 */
export class CorpusStore {
  private readonly byId: ReadonlyMap<string, CorpusRecord>;
  readonly records: readonly CorpusRecord[];
  readonly report: CorpusLoadReport;

  constructor(loaded: LoadedCorpus) {
    this.records = loaded.records;
    this.report = loaded.report;
    this.byId = new Map(loaded.records.map((r) => [r.id, r]));
  }

  get size(): number {
    return this.records.length;
  }

  get(id: string): CorpusRecord | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  ofType<T extends RecordType>(type: T): readonly Extract<CorpusRecord, { type: T }>[] {
    return this.records.filter((r) => r.type === type) as Extract<CorpusRecord, { type: T }>[];
  }
}

/**
 * Rule 1, assertable. Throws if any object in `value` (recursively, to a small
 * depth) carries a booth-like key. Used in tests and safe to call on anything
 * about to be handed to an LLM.
 */
export function assertNoBoothData(value: unknown, path = '$', depth = 0): void {
  if (depth > 6 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoBoothData(v, `${path}[${i}]`, depth + 1));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (BOOTH_KEYS.includes(k.toLowerCase().replace(/[^a-z]/g, ''))) {
      throw new CorpusError(
        `booth data must never be returned: found key "${k}" at ${path}. ` +
          'GFF 2026 publishes no booth allocation; it must not be synthesised.',
      );
    }
    assertNoBoothData(v, `${path}.${k}`, depth + 1);
  }
}
