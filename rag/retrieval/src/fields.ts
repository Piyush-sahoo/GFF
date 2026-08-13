/**
 * Field extraction and per-field weights.
 *
 * Weights are set so that identity-bearing fields (a company name, a person's
 * name, the people on a session) outrank descriptive prose. Attendees
 * overwhelmingly type names, so a name occurrence must be worth more than the
 * same word buried in a 900-character bio.
 */

import type { CorpusRecord } from './types';

export interface DocField {
  readonly name: string;
  readonly weight: number;
  readonly text: string;
}

const PARTNER_WEIGHTS = {
  name: 4,
  sector: 1.5,
  tier: 1,
  whatTheyDo: 1.5,
  useCases: 1.5,
} as const;

const SPEAKER_WEIGHTS = {
  name: 4,
  org: 3,
  jobTitle: 1.5,
  bio: 1,
  country: 0.8,
} as const;

const SESSION_WEIGHTS = {
  title: 3,
  speakerNames: 2.5,
  hostNames: 2,
  topics: 2,
  format: 1.5,
  hall: 1.5,
  description: 1.2,
} as const;

function field(name: string, weight: number, text: string | null | undefined): DocField[] {
  return text ? [{ name, weight, text }] : [];
}

/** All searchable fields for a record, with their weights. */
export function fieldsFor(record: CorpusRecord): DocField[] {
  switch (record.type) {
    case 'partner':
      return [
        ...field('name', PARTNER_WEIGHTS.name, record.name),
        ...field('sector', PARTNER_WEIGHTS.sector, record.sector),
        ...field('tier', PARTNER_WEIGHTS.tier, record.tier),
        ...field('whatTheyDo', PARTNER_WEIGHTS.whatTheyDo, record.whatTheyDo),
        ...field('useCases', PARTNER_WEIGHTS.useCases, record.useCases.join(' ')),
      ];
    case 'speaker':
      return [
        ...field('name', SPEAKER_WEIGHTS.name, record.name),
        ...field('org', SPEAKER_WEIGHTS.org, record.org),
        ...field('jobTitle', SPEAKER_WEIGHTS.jobTitle, record.jobTitle),
        ...field('bio', SPEAKER_WEIGHTS.bio, record.bio),
        ...field('country', SPEAKER_WEIGHTS.country, record.country),
      ];
    case 'session':
      return [
        ...field('title', SESSION_WEIGHTS.title, record.title),
        ...field('speakerNames', SESSION_WEIGHTS.speakerNames, record.speakerNames.join(' ')),
        ...field('hostNames', SESSION_WEIGHTS.hostNames, record.hostNames.join(' ')),
        ...field('topics', SESSION_WEIGHTS.topics, record.topics.join(' ')),
        ...field('format', SESSION_WEIGHTS.format, record.format),
        ...field('hall', SESSION_WEIGHTS.hall, record.hall),
        ...field('description', SESSION_WEIGHTS.description, record.description),
      ];
  }
}

/** Flat text of a record, used by the dense channel. */
export function textFor(record: CorpusRecord): string {
  return fieldsFor(record).map((f) => f.text).join(' \n ');
}
