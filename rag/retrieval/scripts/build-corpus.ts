/**
 * Snapshot the upstream corpus into `data/corpus.jsonl` so this module is
 * self-contained and the Next.js app never has to reach into a sibling
 * workspace at runtime.
 *
 * Source precedence, highest first:
 *   1. GFF_CORPUS_JSONL      a published corpus.jsonl
 *   2. GFF_RAW_DIR           the raw 2026 JSON exports
 *   3. the known upstream workspace paths
 *
 * Re-run this whenever upstream publishes. It is a poll, not a block: if the
 * published corpus is missing the raw exports are used and the source is
 * recorded in `data/corpus.meta.json`.
 *
 *   npm run build:corpus
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCorpus } from '../src/corpus';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const workers = resolve(root, '..');

const jsonlPath =
  process.env.GFF_CORPUS_JSONL ?? join(workers, 'scratch-5', 'corpus.jsonl');
const rawDir = process.env.GFF_RAW_DIR ?? join(workers, 'scratch-4');

const loaded = loadCorpus({ jsonlPath, rawDir });

const outDir = join(root, 'data');
mkdirSync(outDir, { recursive: true });

const lines = loaded.records.map((r) => JSON.stringify(r)).join('\n');
writeFileSync(join(outDir, 'corpus.jsonl'), lines + '\n', 'utf8');

const meta = {
  source: loaded.report.source,
  publishedCorpusAvailable: existsSync(jsonlPath),
  counts: loaded.report.counts,
  total: loaded.report.total,
  skipped: loaded.report.skipped,
  boothValuesSeen: loaded.report.boothValuesSeen,
  days: loaded.report.days,
};
writeFileSync(join(outDir, 'corpus.meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

console.log(`corpus written from ${loaded.report.source}`);
console.log(`  total    ${loaded.report.total}`);
console.log(`  partners ${loaded.report.counts.partner}`);
console.log(`  sessions ${loaded.report.counts.session}`);
console.log(`  speakers ${loaded.report.counts.speaker}`);
console.log(`  skipped  ${loaded.report.skipped}`);
console.log(`  days     ${loaded.report.days.join(', ')}`);
if (loaded.report.boothValuesSeen > 0) {
  console.warn(
    `  WARNING: ${loaded.report.boothValuesSeen} upstream records carried booth values. ` +
      'They were stripped. Rule 1 needs a deliberate review before any booth feature ships.',
  );
} else {
  console.log('  booth    none upstream (expected) — never synthesised');
}
