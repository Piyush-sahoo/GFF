/**
 * Shared test fixtures.
 *
 * The real corpus is indexed once for the whole suite — building it is the only
 * slow part of this module.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRetriever, type Retriever } from '../src/retriever';
import { corpusFromRecords } from '../src/corpus';
import type { Hit } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const CORPUS_JSONL = join(root, 'data', 'corpus.jsonl');
const RAW_DIR = join(root, '..', 'scratch-4');

let cached: Retriever | null = null;

/** The retriever over the real GFF 2026 corpus. */
export function realRetriever(): Retriever {
  if (!cached) {
    cached = createRetriever({
      jsonlPath: existsSync(CORPUS_JSONL) ? CORPUS_JSONL : undefined,
      rawDir: RAW_DIR,
    });
  }
  return cached;
}

/** Display label for a hit, whatever its type. */
export function label(hit: Hit): string {
  const record = hit.record;
  return record.type === 'session' ? record.title : record.name;
}

/** 1-based rank of the first hit whose label contains `needle`, or -1. */
export function rankOf(hits: readonly Hit[], needle: string): number {
  const i = hits.findIndex((h) => label(h).toLowerCase().includes(needle.toLowerCase()));
  return i === -1 ? -1 : i + 1;
}

/**
 * A tiny hand-built corpus, used where the real data has no example of the
 * thing under test (there is no partner with "invoice" in its description, so
 * the word-boundary regression needs one).
 */
export function syntheticRetriever(): Retriever {
  const corpus = corpusFromRecords([
    {
      type: 'partner',
      name: 'Razorpay',
      slug: 'razorpay',
      tier: 'Gold Partner',
      category: 'payments',
      whatTheyDo: 'Payment gateway and business banking for Indian businesses',
      useCases: ['online payments', 'payouts'],
      website: 'https://razorpay.com',
      booth: 'Hall 3, Booth 42', // must be stripped by the loader
      boothSource: 'made up',
      year: 2026,
    },
    {
      type: 'partner',
      name: 'J.P. Morgan',
      slug: 'j-p-morgan',
      tier: 'Diamond Partner',
      category: 'banking',
      whatTheyDo: 'Global corporate and investment banking',
      useCases: ['treasury', 'cross-border settlement'],
      year: 2026,
    },
    {
      type: 'partner',
      name: 'Invoicely',
      slug: 'invoicely',
      tier: 'Exhibitor',
      category: 'lending',
      // Deliberately dense with "invoice" and free of "voice" as a word.
      whatTheyDo: 'Invoice discounting and invoice financing for MSMEs',
      useCases: ['invoice financing', 'invoice discounting', 'receivables'],
      year: 2026,
    },
    {
      type: 'partner',
      name: 'Sarvam.ai',
      slug: 'sarvam-ai',
      tier: 'Silver Partner',
      category: 'ai',
      whatTheyDo: 'Sovereign AI platform with speech and voice models',
      useCases: ['speech to text', 'voice agents'],
      year: 2026,
    },
    {
      type: 'session',
      agendaCode: 'T0001',
      title: 'Open Session on Payment Gateways',
      description: 'A public discussion of gateway economics.',
      topics: ['Payments'],
      format: 'Panel Discussion',
      day: '2026-09-09',
      startTime: '10:00',
      endTime: '10:45',
      hall: 'Lotus 1',
      accessType: 'public',
      isClosedDoor: false,
      speakerNames: ['Asha Rao'],
      hostNames: [],
      year: 2026,
    },
    {
      type: 'session',
      agendaCode: 'T0002',
      title: 'Closed Roundtable on Payment Regulation',
      description: 'Invite-only discussion among regulators.',
      topics: ['Payments', 'Policy'],
      format: 'Roundtable',
      day: '2026-09-10',
      startTime: '14:00',
      endTime: '15:00',
      hall: 'Cube',
      accessType: 'invite-only',
      isClosedDoor: true,
      speakerNames: ['Asha Rao'],
      hostNames: [],
      year: 2026,
    },
    {
      type: 'speaker',
      name: 'Ms. Asha Rao',
      nameKey: 'asha rao',
      title: 'Head of Payments',
      org: 'Razorpay',
      bio: 'Asha leads payments infrastructure.',
      sessionCodes: ['T0001', 'T0002'],
      year: 2026,
    },
  ], 'synthetic');

  return createRetriever({ corpus });
}
