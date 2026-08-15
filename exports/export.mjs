/**
 * GFF 2026 CSV export — reads MongoDB Atlas (authoritative, deduped state), writes
 * three UTF-8-with-BOM, RFC4180-quoted CSVs plus a stats file the README is built from.
 *
 * Design rules enforced here:
 *  - no booth/stall column (GFF publishes no partner booth data; the DB fields are 100% null)
 *  - empty stays empty — never "N/A", "Unknown", or a guess
 *  - traced text and unsourced text never share a column
 */
import { MongoClient } from 'mongodb';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Write the CSVs next to this script (repo layout: exports/) rather than into a
// cwd-relative ./exports subdirectory, so re-runs update the committed files
// in place instead of creating a nested exports/exports/.
const OUT = resolve(dirname(fileURLToPath(import.meta.url)));
mkdirSync(OUT, { recursive: true });

// ---------- CSV writing (RFC4180) ----------

const BOM = '﻿';

/** Cell value -> CSV text. Blank is blank: null/undefined/empty array all render as "". */
function cell(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.length ? v.map(x => String(x).trim()).filter(Boolean).join(';') : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = String(v);
  return s.trim() === '' ? '' : s;
}

/** RFC4180 field: quote when the value contains a delimiter, quote, CR/LF, or edge whitespace. */
function field(s) {
  if (s === '') return '';
  if (/[",\r\n]/.test(s) || s !== s.trim()) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(columns, rows) {
  const lines = [columns.map(c => field(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map(c => field(cell(c.get(r)))).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

/** Excel/Sheets treat a leading = + - @ as a formula. We do not mutate data; we report it. */
function formulaRisks(columns, rows) {
  const hits = [];
  for (const r of rows) {
    for (const c of columns) {
      const s = cell(c.get(r));
      if (/^[=+\-@\t\r]/.test(s)) hits.push({ column: c.header, value: s.slice(0, 60) });
    }
  }
  return hits;
}

// ---------- helpers ----------

const has = v => !(v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0));
const count = (rows, fn) => rows.reduce((n, r) => n + (has(fn(r)) ? 1 : 0), 0);

// ---------- load ----------

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB);

const YEAR = 2026;
const audit = { year: YEAR, generatedFrom: 'MongoDB Atlas (gff)', collections: {} };

// --- partners / exhibitors ---
const partnersAll = await db.collection('partners').find({ year: YEAR }).toArray();
// Filter on the flag, never on names. (Atlas currently holds no isDataArtifact:true docs — see README.)
const artifacts = partnersAll.filter(p => p.isDataArtifact === true);
const partners = partnersAll.filter(p => p.isDataArtifact !== true);
partners.sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' }));

// A description/use-case list counts as TRACED only when its own provenance method is not 'unsourced'.
const tracedWtd = p => (p.provenance?.whatTheyDo?.method && p.provenance.whatTheyDo.method !== 'unsourced') ? p.whatTheyDo : null;
const tracedUse = p => (p.provenance?.useCases?.method && p.provenance.useCases.method !== 'unsourced') ? p.useCases : null;

const exhibitorCols = [
  { header: 'name', get: p => p.name },
  { header: 'aliases', get: p => p.aliases },
  { header: 'slug', get: p => p.slug },
  { header: 'tier', get: p => p.tier },
  { header: 'sourceGroup', get: p => p.sourceGroup },
  { header: 'category', get: p => p.category },
  { header: 'website', get: p => p.website },
  { header: 'logoUrl', get: p => p.logoUrl },

  // traced description + how it was obtained
  { header: 'whatTheyDo', get: tracedWtd },
  { header: 'whatTheyDo_method', get: p => p.provenance?.whatTheyDo?.method },
  { header: 'whatTheyDo_variant', get: p => p.provenance?.whatTheyDo?.variant },
  { header: 'whatTheyDo_sourceUrl', get: p => p.provenance?.whatTheyDo?.sourceUrl },
  { header: 'whatTheyDo_fetchedAt', get: p => p.provenance?.whatTheyDo?.fetchedAt },
  { header: 'whatTheyDo_writer', get: p => p.provenance?.whatTheyDo?.writer },
  { header: 'whatTheyDo_note', get: p => p.provenance?.whatTheyDo?.note },

  // traced use cases + how they were obtained
  { header: 'useCases', get: tracedUse },
  { header: 'useCases_method', get: p => p.provenance?.useCases?.method },
  { header: 'useCases_basis', get: p => p.provenance?.useCases?.basis },
  { header: 'useCases_fetchedAt', get: p => p.provenance?.useCases?.fetchedAt },
  { header: 'useCases_writer', get: p => p.provenance?.useCases?.writer },
  { header: 'useCases_note', get: p => p.provenance?.useCases?.note },

  // unsourced variants, kept strictly apart from the traced columns above
  { header: 'whatTheyDo_unsourced', get: p => p.unsourced?.whatTheyDo },
  { header: 'useCases_unsourced', get: p => p.unsourced?.useCases },
  { header: 'unsourced_method', get: p => p.unsourced?.method },
  { header: 'unsourced_confidence', get: p => p.unsourced?.confidence },
  { header: 'unsourced_writer', get: p => p.unsourced?.writer },
  { header: 'unsourced_note', get: p => p.unsourced?.note },

  { header: 'confidence', get: p => p.confidence },
  { header: 'confidenceScore', get: p => p.confidenceScore },
  { header: 'confidence_method', get: p => p.provenance?.confidence?.method },
  { header: 'confidence_originalValue', get: p => p.provenance?.confidence?.originalValue },
  { header: 'confidence_thresholds', get: p => p.provenance?.confidence?.thresholds },
  { header: 'confidence_note', get: p => p.provenance?.confidence?.note },

  { header: 'logoUrl_method', get: p => p.provenance?.logoUrl?.method },
  { header: 'logoUrl_sourceUrl', get: p => p.provenance?.logoUrl?.sourceUrl },

  { header: 'sourceUrl', get: p => p.sourceUrl },
  { header: 'extractedAt', get: p => p.extractedAt },
  { header: 'lastSeenAt', get: p => p.lastSeenAt },
  { header: 'status', get: p => p.status },
  { header: 'isDataArtifact', get: p => p.isDataArtifact },
  { header: 'year', get: p => p.year },
  { header: 'recordId', get: p => String(p._id) },
];

// --- speakers ---
const speakers = await db.collection('speakers').find({ year: YEAR }).toArray();
speakers.sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' }));

const speakerCols = [
  { header: 'name', get: s => s.name },
  { header: 'title', get: s => s.title },
  { header: 'org', get: s => s.org },
  { header: 'country', get: s => s.country },
  { header: 'bio', get: s => s.bio },
  { header: 'linkedin', get: s => s.linkedin },
  { header: 'headshotUrl', get: s => s.headshotUrl },
  { header: 'sessionTitle', get: s => s.sessionTitle },
  { header: 'sessionCodes', get: s => s.sessionCodes },
  { header: 'sourceUrl', get: s => s.sourceUrl },
  { header: 'lastSeenAt', get: s => s.lastSeenAt },
  { header: 'status', get: s => s.status },
  { header: 'year', get: s => s.year },
  { header: 'nameKey', get: s => s.nameKey },
  { header: 'recordId', get: s => String(s._id) },
];

// --- sessions ---
const sessions = await db.collection('sessions').find({ year: YEAR }).toArray();
sessions.sort((a, b) =>
  String(a.day).localeCompare(String(b.day)) ||
  String(a.startTime).localeCompare(String(b.startTime)) ||
  String(a.agendaCode).localeCompare(String(b.agendaCode)));

const sessionCols = [
  { header: 'agendaCode', get: s => s.agendaCode },
  { header: 'title', get: s => s.title },
  { header: 'day', get: s => s.day },
  { header: 'startTime', get: s => s.startTime },
  { header: 'endTime', get: s => s.endTime },
  { header: 'hall', get: s => s.hall },          // published by GFF — legitimate, unlike partner booths
  { header: 'format', get: s => s.format },
  { header: 'track', get: s => s.track },
  { header: 'topics', get: s => s.topics },
  { header: 'accessType', get: s => s.accessType },
  { header: 'isClosedDoor', get: s => s.isClosedDoor },
  { header: 'description', get: s => s.description },
  { header: 'speakerNames', get: s => s.speakerNames },
  { header: 'speakersWithTitles', get: s => s.speakersRaw },
  { header: 'hostNames', get: s => s.hostNames },
  { header: 'hostsWithTitles', get: s => s.hostsRaw },
  { header: 'status', get: s => s.status },
  { header: 'withdrawnDetectedAt', get: s => s.withdrawnDetectedAt },
  { header: 'sourceUrl', get: s => s.sourceUrl },
  { header: 'lastSeenAt', get: s => s.lastSeenAt },
  { header: 'documentId', get: s => s.documentId },
  { header: 'year', get: s => s.year },
  { header: 'recordId', get: s => String(s._id) },
];

// ---------- write ----------

const files = [
  ['exhibitors-2026.csv', exhibitorCols, partners, 316],
  ['speakers-2026.csv', speakerCols, speakers, 487],
  ['sessions-2026.csv', sessionCols, sessions, 256],
];

for (const [file, cols, rows, expected] of files) {
  const path = resolve(OUT, file);
  writeFileSync(path, toCsv(cols, rows), 'utf8');
  const risks = formulaRisks(cols, rows);
  audit.collections[file] = {
    path, rows: rows.length, expected, match: rows.length === expected,
    columns: cols.length, formulaRiskCells: risks.length, formulaRiskSample: risks.slice(0, 5),
  };
  console.log(`${file}: ${rows.length} rows (expected ${expected}) ${rows.length === expected ? 'OK' : 'MISMATCH'}, ${cols.length} cols`);
}

// ---------- coverage stats (README numbers come from here, not from memory) ----------

audit.partners = {
  yearMatched: partnersAll.length,
  isDataArtifactTrue_excluded: artifacts.length,
  isDataArtifactFalse: partnersAll.filter(p => p.isDataArtifact === false).length,
  isDataArtifactMissing: partnersAll.filter(p => p.isDataArtifact === undefined).length,
  exported: partners.length,
  boothNonNull: partnersAll.filter(p => has(p.booth)).length,
  boothSourceNonNull: partnersAll.filter(p => has(p.boothSource)).length,
  coverage: {
    name: count(partners, p => p.name),
    aliases: count(partners, p => p.aliases),
    tier: count(partners, p => p.tier),
    sourceGroup: count(partners, p => p.sourceGroup),
    category: count(partners, p => p.category),
    website: count(partners, p => p.website),
    logoUrl: count(partners, p => p.logoUrl),
    whatTheyDo_traced: count(partners, tracedWtd),
    whatTheyDo_unsourced: count(partners, p => p.unsourced?.whatTheyDo),
    whatTheyDo_anyText: count(partners, p => p.whatTheyDo || p.unsourced?.whatTheyDo),
    useCases_traced: count(partners, tracedUse),
    useCases_unsourced: count(partners, p => p.unsourced?.useCases),
    confidence: count(partners, p => p.confidence),
    confidenceScore: count(partners, p => p.confidenceScore),
    logoUrl_provenance: count(partners, p => p.provenance?.logoUrl?.method),
  },
  whatTheyDoMethods: tally(partners, p => p.provenance?.whatTheyDo?.method),
  useCasesMethods: tally(partners, p => p.provenance?.useCases?.method),
  tiers: tally(partners, p => p.tier),
  sourceGroups: tally(partners, p => p.sourceGroup),
  categories: tally(partners, p => p.category),
};

audit.speakers = {
  exported: speakers.length,
  coverage: {
    name: count(speakers, s => s.name), title: count(speakers, s => s.title), org: count(speakers, s => s.org),
    country: count(speakers, s => s.country), bio: count(speakers, s => s.bio), linkedin: count(speakers, s => s.linkedin),
    headshotUrl: count(speakers, s => s.headshotUrl), sessionTitle: count(speakers, s => s.sessionTitle),
    sessionCodes: count(speakers, s => s.sessionCodes),
  },
};

audit.sessions = {
  exported: sessions.length,
  statuses: tally(sessions, s => s.status),
  days: tally(sessions, s => s.day),
  coverage: {
    agendaCode: count(sessions, s => s.agendaCode), title: count(sessions, s => s.title), day: count(sessions, s => s.day),
    startTime: count(sessions, s => s.startTime), endTime: count(sessions, s => s.endTime), hall: count(sessions, s => s.hall),
    format: count(sessions, s => s.format), track: count(sessions, s => s.track), topics: count(sessions, s => s.topics),
    description: count(sessions, s => s.description), speakerNames: count(sessions, s => s.speakerNames),
    hostNames: count(sessions, s => s.hostNames), accessType: count(sessions, s => s.accessType),
  },
  closedDoor: sessions.filter(s => s.isClosedDoor === true).length,
  inviteOnly: sessions.filter(s => s.accessType === 'invite-only').length,
  halls: [...new Set(sessions.map(s => s.hall).filter(Boolean))].sort(),
};

function tally(rows, fn) {
  const m = {};
  for (const r of rows) { const k = fn(r) ?? '(empty)'; m[k] = (m[k] || 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}

writeFileSync(resolve(OUT, 'export-audit.json'), JSON.stringify(audit, null, 2));
console.log('\n' + JSON.stringify({ partners: audit.partners, speakers: audit.speakers.coverage, sessions: audit.sessions }, null, 2));

await client.close();
