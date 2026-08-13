/** Independent read-back check: parses the emitted CSVs with a strict RFC4180 parser. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoClient } from 'mongodb';

function parseCsv(text) {
  const rows = [];
  let row = [], f = '', i = 0, q = false;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { f += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      f += c; i++; continue;
    }
    if (c === '"') {
      if (f !== '') throw new Error('quote appears mid-field at ' + i);
      q = true; i++; continue;
    }
    if (c === ',') { row.push(f); f = ''; i++; continue; }
    if (c === '\r' && text[i + 1] === '\n') { row.push(f); rows.push(row); row = []; f = ''; i += 2; continue; }
    if (c === '\n' || c === '\r') throw new Error('bare CR/LF outside quotes at ' + i);
    f += c; i++;
  }
  if (q) throw new Error('unterminated quote');
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const FILES = ['exhibitors-2026.csv', 'speakers-2026.csv', 'sessions-2026.csv'];
const EXPECTED = { 'exhibitors-2026.csv': 316, 'speakers-2026.csv': 487, 'sessions-2026.csv': 256 };
const PLACEHOLDERS = /^(n\/?a|na|unknown|none|null|undefined|tbd|tba|-|--|\?|not available|not found|n\.a\.)$/i;
const BOOTHY = /booth|stall|stand\b|pavilion/i;

let fail = 0;
const parsed = {};

for (const f of FILES) {
  const path = resolve('exports', f);
  const raw = readFileSync(path, 'utf8');
  const buf = readFileSync(path);

  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const rows = parseCsv(raw.replace(/^﻿/, ''));
  const header = rows[0];
  const body = rows.slice(1);
  parsed[f] = { header, body };

  const badWidth = body.map((r, i) => [i + 2, r.length]).filter(([, n]) => n !== header.length);
  const boothCols = header.filter(h => BOOTHY.test(h));
  const placeholders = [];
  const untrimmed = [];
  for (let r = 0; r < body.length; r++) {
    for (let c = 0; c < body[r].length; c++) {
      const v = body[r][c];
      if (PLACEHOLDERS.test(v.trim()) && v.trim() !== '') placeholders.push({ line: r + 2, col: header[c], v });
      if (v !== v.trim()) untrimmed.push({ line: r + 2, col: header[c] });
    }
  }
  const dupHeaders = header.filter((h, i) => header.indexOf(h) !== i);
  const emptyHeaders = header.filter(h => h.trim() === '');

  const ok = bom && body.length === EXPECTED[f] && !badWidth.length && !boothCols.length &&
    !placeholders.length && !dupHeaders.length && !emptyHeaders.length && raw.endsWith('\r\n');
  if (!ok) fail++;

  console.log(`\n== ${f} ==`);
  console.log(`  bytes                ${buf.length}`);
  console.log(`  UTF-8 BOM            ${bom ? 'yes' : 'NO — FAIL'}`);
  console.log(`  CRLF line endings    ${raw.endsWith('\r\n') ? 'yes' : 'NO — FAIL'}`);
  console.log(`  data rows            ${body.length} (expected ${EXPECTED[f]}) ${body.length === EXPECTED[f] ? 'OK' : 'MISMATCH'}`);
  console.log(`  columns              ${header.length}`);
  console.log(`  ragged rows          ${badWidth.length ? JSON.stringify(badWidth.slice(0, 5)) + ' — FAIL' : 'none'}`);
  console.log(`  booth-like columns   ${boothCols.length ? boothCols.join(',') + ' — FAIL' : 'none'}`);
  console.log(`  duplicate headers    ${dupHeaders.length ? dupHeaders.join(',') + ' — FAIL' : 'none'}`);
  console.log(`  placeholder cells    ${placeholders.length ? JSON.stringify(placeholders.slice(0, 5)) + ' — FAIL' : 'none'}`);
  console.log(`  untrimmed cells      ${untrimmed.length ? JSON.stringify(untrimmed.slice(0, 3)) : 'none'}`);
  console.log(`  quoted cells         ${(raw.match(/"/g) || []).length} quote chars`);
  const nonEmpty = header.map((h, i) => `${h}=${body.filter(r => r[i] !== '').length}`);
  console.log(`  non-empty per column\n    ${nonEmpty.join('\n    ')}`);
}

// --- cross-check the CSV content against Atlas, row by row ---
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB);

console.log('\n== cross-check vs Atlas ==');
const P = await db.collection('partners').find({ year: 2026 }).toArray();
const byId = new Map(P.map(p => [String(p._id), p]));
const { header: eh, body: eb } = parsed['exhibitors-2026.csv'];
const ix = n => eh.indexOf(n);

let blended = 0, lostText = 0, wrongTraced = 0, idMiss = 0;
const untracedRows = [];
for (const r of eb) {
  const p = byId.get(r[ix('recordId')]);
  if (!p) { idMiss++; continue; }
  const main = r[ix('whatTheyDo')], uns = r[ix('whatTheyDo_unsourced')];
  const method = r[ix('whatTheyDo_method')];

  // traced column must hold exactly the DB value when the method is a traced one
  if (method && method !== 'unsourced' && main !== (p.whatTheyDo ?? '')) wrongTraced++;
  // when the method is 'unsourced', the traced column must be empty and the text preserved elsewhere
  if (method === 'unsourced') {
    untracedRows.push(p.name);
    if (main !== '') blended++;
    if (uns !== (p.unsourced?.whatTheyDo ?? '')) lostText++;
  }
  // no description may sit in both columns at once
  if (main !== '' && uns !== '' && main === uns) blended++;
}
console.log('  rows whose recordId is missing from Atlas :', idMiss);
console.log('  traced column != Atlas value              :', wrongTraced);
console.log('  blended (same text in traced+unsourced)   :', blended);
console.log('  unsourced text lost                       :', lostText);
console.log('  rows with whatTheyDo_method=unsourced     :', untracedRows.length, untracedRows);

// every DB doc must appear exactly once
const csvIds = eb.map(r => r[ix('recordId')]);
console.log('  unique recordIds                          :', new Set(csvIds).size, '/', csvIds.length);
console.log('  Atlas docs absent from CSV                :', P.filter(p => !csvIds.includes(String(p._id))).length);

// spot-check a multi-value join round-trips
const sp = parsed['sessions-2026.csv'];
const sIdx = n => sp.header.indexOf(n);
const S = await db.collection('sessions').find({ year: 2026 }).toArray();
const sById = new Map(S.map(s => [String(s._id), s]));
let joinMismatch = 0;
for (const r of sp.body) {
  const s = sById.get(r[sIdx('recordId')]);
  const expect = (s.speakerNames || []).join(';');
  if (r[sIdx('speakerNames')] !== expect) joinMismatch++;
  if (r[sIdx('hall')] !== (s.hall ?? '')) joinMismatch++;
  if (r[sIdx('description')] !== (s.description ?? '')) joinMismatch++;
}
console.log('  sessions field/join mismatches            :', joinMismatch);

const SPk = await db.collection('speakers').find({ year: 2026 }).toArray();
const spk = parsed['speakers-2026.csv'];
const kIdx = n => spk.header.indexOf(n);
const kById = new Map(SPk.map(s => [String(s._id), s]));
let kMis = 0;
for (const r of spk.body) {
  const s = kById.get(r[kIdx('recordId')]);
  if (r[kIdx('bio')] !== (s.bio ?? '')) kMis++;
  if (r[kIdx('sessionCodes')] !== (s.sessionCodes || []).join(';')) kMis++;
  if (r[kIdx('name')] !== s.name) kMis++;
}
console.log('  speakers field mismatches                 :', kMis);

// accent check — proves the BOM/UTF-8 round trip
const accented = spk.body.filter(r => /[^\x00-\x7F]/.test(r[kIdx('name')] + r[kIdx('bio')] + r[kIdx('org')])).length;
console.log('  rows containing non-ASCII (accents etc.)  :', accented);
console.log('  sample non-ASCII name:', spk.body.find(r => /[^\x00-\x7F]/.test(r[kIdx('name')]))?.[kIdx('name')] ||
  spk.body.find(r => /[^\x00-\x7F]/.test(r[kIdx('bio')]))?.[kIdx('bio')].slice(0, 80));

await client.close();
console.log(fail ? `\nRESULT: ${fail} file(s) FAILED structural checks` : '\nRESULT: all structural checks passed');
