/**
 * Archive CSV export — the JSON-input sibling of export.mjs.
 *
 * export.mjs reads MongoDB Atlas, which holds 2026 only and must keep holding
 * 2026 only. The 2024 and 2025 editions are archive data and are never loaded
 * into Atlas, so they get their own path: same CSV writer (exports/csv.mjs —
 * UTF-8 BOM, RFC4180 quoting, blank stays blank), same design rules, JSON in
 * instead of a database.
 *
 * Design rules, unchanged from export.mjs:
 *  - no booth/stall column (GFF publishes no floor plan for any year)
 *  - empty stays empty — never "N/A", "Unknown", or a guess
 *  - traced text and unsourced text never share a column
 *  - every row carries year, sourceUrl and extractedAt
 *
 * Column shape tracks the 2026 exports as closely as each year's source allows.
 * Columns a year genuinely lacks are omitted rather than emitted as empty
 * filler; exports/README.md documents every delta.
 *
 * Run:  node exports/export-archive.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCsv, formulaRisks, count, tally } from './csv.mjs';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(HERE, '..');
mkdirSync(HERE, { recursive: true });

const read = p => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

// ---------- shared column fragments ----------

// Mongo-only bookkeeping (lastSeenAt / status / recordId) has no archive
// equivalent and is omitted rather than emitted blank.
const provenance = extra => [
  { header: 'year', get: r => r.year },
  { header: 'sourceUrl', get: r => r.sourceUrl },
  ...extra,
  { header: 'extractedAt', get: r => r.extractedAt },
];

const speakerCols = year => [
  { header: 'name', get: s => s.name },
  { header: 'title', get: s => s.title },
  { header: 'org', get: s => s.org },
  { header: 'country', get: s => s.country },
  { header: 'bio', get: s => s.bio },
  { header: 'linkedin', get: s => s.linkedin },
  { header: 'headshotUrl', get: s => s.headshotUrl },
  // GFF's own speaker tiering, verbatim from each edition's CMS. The two years
  // spell it differently ("Category A" vs "Two - Category A") and are NOT
  // normalised across years — see exports/README.md.
  { header: 'speakerCategory', get: s => s.speakerCategory },
  // 2024 has no extractable agenda, so no session linkage exists for it.
  ...(year === 2025 ? [
    { header: 'sessionTitle', get: s => s.sessionTitle },
    { header: 'sessionCodes', get: s => s.sessionCodes },
  ] : []),
  { header: 'nameKey', get: s => s.nameKey },
  ...provenance(year === 2024 ? [{ header: 'sourceApi', get: s => s.sourceApi }] : []),
];

const exhibitorCols = year => [
  { header: 'name', get: p => p.name },
  { header: 'canonicalName', get: p => p.canonicalName },
  { header: 'slug', get: p => p.slug },
  { header: 'tier', get: p => p.tier },
  { header: 'sourceGroup', get: p => p.sourceGroup },
  // The same org is often listed under more than one heading (a Partner who also
  // exhibits). sourceGroup holds the primary listing, this holds the rest.
  { header: 'alsoListedIn', get: p => p.alsoListedIn },
  { header: 'category', get: p => p.category },
  { header: 'website', get: p => p.website },
  { header: 'logoUrl', get: p => p.logoUrl },
  // No traced whatTheyDo/useCases columns: GFF's partner payload carries no
  // description field in either archive year, so a traced column would be 100%
  // empty. The 2025 snapshot does hold model-written text with no provenance
  // recorded; it stays in the unsourced columns, exactly as export.mjs does.
  ...(year === 2025 ? [
    { header: 'whatTheyDo_unsourced', get: p => p.unsourced?.whatTheyDo },
    { header: 'useCases_unsourced', get: p => p.unsourced?.useCases },
    { header: 'unsourced_confidence', get: p => p.unsourced?.confidence },
  ] : []),
  { header: 'isDataArtifact', get: p => p.isDataArtifact },
  ...provenance(year === 2024 ? [{ header: 'sourceApi', get: p => p.sourceApi }] : []),
];

const orgCols = [
  { header: 'org', get: o => o.org },
  { header: 'aliases', get: o => o.aliases },
  { header: 'yearCount', get: o => o.yearCount },
  { header: 'years', get: o => o.years },
  { header: 'returning', get: o => o.returning },
  { header: 'in2024', get: o => o.in2024 },
  { header: 'tier2024', get: o => o.tier2024 },
  { header: 'group2024', get: o => o.group2024 },
  { header: 'in2025', get: o => o.in2025 },
  { header: 'tier2025', get: o => o.tier2025 },
  { header: 'group2025', get: o => o.group2025 },
  { header: 'in2026', get: o => o.in2026 },
  { header: 'tier2026', get: o => o.tier2026 },
  // No group2026 column: sourceGroup is added to a partner record by a later
  // pipeline step and lives only in Atlas, not in data/2026/partners-2026.json,
  // which is what this roll-up reads. An always-empty column would read as
  // "2026 had no listings" rather than "the field is not in this file".

  { header: 'category', get: o => o.category },
  { header: 'website', get: o => o.website },
  { header: 'otherWebsites', get: o => o.otherWebsites },
];

// ---------- load ----------

const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' });
const real = rows => rows.filter(r => r.isDataArtifact !== true);

const speakers2025 = read('data/archive-2025/speakers-2025.json').sort(byName);
const speakers2024 = read('data/archive-2024/speakers-2024.json').sort(byName);
const partners2025 = read('data/archive-2025/partners-2025.json');
const partners2024 = read('data/archive-2024/partners-2024.json');
const orgs = read('exports/orgs-by-year.json');

const exhibitors2025 = real(partners2025).sort(byName);
const exhibitors2024 = real(partners2024).sort(byName);

// ---------- write ----------

const audit = { generatedAt: new Date().toISOString(), generatedFrom: 'data/archive-*/ JSON', files: {} };

const files = [
  ['speakers-2025.csv', speakerCols(2025), speakers2025],
  ['exhibitors-2025.csv', exhibitorCols(2025), exhibitors2025],
  ['speakers-2024.csv', speakerCols(2024), speakers2024],
  ['exhibitors-2024.csv', exhibitorCols(2024), exhibitors2024],
  ['orgs-by-year.csv', orgCols, orgs],
];

for (const [file, cols, rows] of files) {
  writeFileSync(resolve(HERE, file), toCsv(cols, rows), 'utf8');
  const risks = formulaRisks(cols, rows);
  audit.files[file] = {
    rows: rows.length,
    columns: cols.length,
    formulaRiskCells: risks.length,
    formulaRiskSample: risks.slice(0, 5),
    coverage: Object.fromEntries(cols.map(c => [c.header, count(rows, c.get)])),
  };
  console.log(`${file}: ${rows.length} rows, ${cols.length} cols`);
}

// Rows the last fetch no longer served are kept (never regress an archive) and
// counted here so the README can say so rather than the CSV looking stale.
audit.notInLatestFetch = {
  'speakers-2025.csv': speakers2025.filter(s => s.notInLatestFetch).length,
  'exhibitors-2025.csv': exhibitors2025.filter(p => p.notInLatestFetch).length,
};
audit.dataArtifactsExcluded = {
  'exhibitors-2025.csv': partners2025.length - exhibitors2025.length,
  'exhibitors-2024.csv': partners2024.length - exhibitors2024.length,
};
audit.tiers = {
  2024: tally(exhibitors2024, p => p.sourceGroup),
  2025: tally(exhibitors2025, p => p.sourceGroup),
};
audit.orgsByYearCount = tally(orgs, o => o.yearCount);

writeFileSync(resolve(HERE, 'export-archive-audit.json'), JSON.stringify(audit, null, 2));
console.log('\n' + JSON.stringify(
  { notInLatestFetch: audit.notInLatestFetch, dataArtifactsExcluded: audit.dataArtifactsExcluded,
    orgsByYearCount: audit.orgsByYearCount }, null, 2));
