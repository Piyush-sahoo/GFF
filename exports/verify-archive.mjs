/**
 * Independent read-back check for the archive CSVs.
 *
 * Same job as verify.mjs, but the cross-check target is the source JSON rather
 * than Atlas — the archive years are never loaded into Mongo, so this script
 * needs no database and no credentials.
 *
 * Parses each emitted file with the strict RFC4180 reader in csv.mjs (not with
 * the writer that produced it), then re-derives every cell from the JSON and
 * compares. Exits non-zero on any failure.
 *
 * Run:  node exports/verify-archive.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, cell } from './csv.mjs';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(HERE, '..');
const read = p => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const PLACEHOLDERS = /^(n\/?a|na|unknown|none|null|undefined|tbd|tba|-|--|\?|not available|not found|n\.a\.)$/i;
const BOOTHY = /booth|stall|stand\b|pavilion/i;
const REQUIRED = ['year', 'sourceUrl', 'extractedAt'];
const RSC_REF = /^\$[0-9a-f]+$/;

const SPEC = {
  'speakers-2025.csv': { src: 'data/archive-2025/speakers-2025.json', rows: 993, key: 'name' },
  'exhibitors-2025.csv': { src: 'data/archive-2025/partners-2025.json', rows: 399, key: 'name', real: true },
  'sessions-2025.csv': { src: 'data/archive-2025/sessions-2025.json', rows: 391, key: 'agendaCode' },
  'speakers-2024.csv': { src: 'data/archive-2024/speakers-2024.json', rows: 841, key: 'name' },
  'exhibitors-2024.csv': { src: 'data/archive-2024/partners-2024.json', rows: 371, key: 'name', real: true },
  'sessions-2024.csv': { src: 'data/archive-2024/sessions-2024.json', rows: 338, key: 'agendaCode' },
  'orgs-by-year.csv': { src: 'exports/orgs-by-year.json', rows: 713, key: 'org', skipRequired: true },
};

let fail = 0;
const check = (cond, label) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fail++;
};

for (const [file, spec] of Object.entries(SPEC)) {
  console.log(`\n== ${file} ==`);
  const path = resolve(HERE, file);
  const buf = readFileSync(path);
  const raw = buf.toString('utf8');

  check(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, 'UTF-8 BOM');
  check(raw.endsWith('\r\n'), 'CRLF line endings');

  const rows = parseCsv(raw.replace(/^﻿/, ''));
  const header = rows[0];
  const body = rows.slice(1);

  check(body.length === spec.rows, `${body.length} data rows (expected ${spec.rows})`);
  check(body.every(r => r.length === header.length), 'no ragged rows');
  check(!header.some(h => BOOTHY.test(h)), 'no booth/stall column');
  check(new Set(header).size === header.length, 'no duplicate headers');
  check(header.every(h => h.trim() !== ''), 'no empty header');
  if (!spec.skipRequired) {
    check(REQUIRED.every(h => header.includes(h)), `carries ${REQUIRED.join('/')}`);
    for (const h of REQUIRED) {
      const i = header.indexOf(h);
      check(i >= 0 && body.every(r => r[i] !== ''), `every row has a ${h}`);
    }
  }

  const bad = [];
  for (let r = 0; r < body.length; r++) {
    for (let c = 0; c < header.length; c++) {
      const v = body[r][c].trim();
      if (v !== '' && PLACEHOLDERS.test(v)) bad.push({ line: r + 2, col: header[c], v });
    }
  }
  check(!bad.length, `no placeholder cells ${bad.length ? JSON.stringify(bad.slice(0, 3)) : ''}`);

  // A raw "$3e" is an unresolved RSC row reference, not a bio. deref() exists to
  // stop those reaching a CSV; assert none did.
  const refs = [];
  for (let r = 0; r < body.length; r++) {
    for (let c = 0; c < header.length; c++) {
      if (RSC_REF.test(body[r][c])) refs.push({ line: r + 2, col: header[c], v: body[r][c] });
    }
  }
  check(!refs.length, `no unresolved RSC refs ${refs.length ? JSON.stringify(refs.slice(0, 3)) : ''}`);

  // --- cell-for-cell against the source JSON ---
  let src = read(spec.src);
  if (spec.real) src = src.filter(r => r.isDataArtifact !== true);
  const byKey = new Map(src.map(r => [String(r[spec.key]), r]));
  check(byKey.size === src.length, 'source keys unique');

  const ki = header.indexOf(spec.key);
  let mismatch = 0, missing = 0;
  const seen = new Set();
  for (const r of body) {
    const rec = byKey.get(r[ki]);
    if (!rec) { missing++; continue; }
    seen.add(r[ki]);
    for (let c = 0; c < header.length; c++) {
      const h = header[c];
      // Nested/derived columns are re-derived here the same way the exporter does.
      const v = h === 'whatTheyDo_unsourced' ? rec.unsourced?.whatTheyDo
        : h === 'useCases_unsourced' ? rec.unsourced?.useCases
        : h === 'unsourced_confidence' ? rec.unsourced?.confidence
        : h === 'speakersWithTitles' ? rec.speakersRaw
        : h === 'hostsWithTitles' ? rec.hostsRaw
        : rec[h];
      if (r[c] !== cell(v)) { if (mismatch < 3) console.log(`       ${h}: csv=${JSON.stringify(r[c].slice(0, 60))} json=${JSON.stringify(cell(v).slice(0, 60))}`); mismatch++; }
    }
  }
  check(!missing, `every CSV row found in source (${missing} orphans)`);
  check(!mismatch, `every cell matches source (${mismatch} mismatches)`);
  check(seen.size === src.length, `every source row exported (${src.length - seen.size} missing)`);

  const nonEmpty = header.map((h, i) => `${h}=${body.filter(r => r[i] !== '').length}`);
  console.log('  non-empty per column\n    ' + nonEmpty.join('\n    '));
}

// The archive must never claim to be 2026 data.
for (const file of ['speakers-2025.csv', 'exhibitors-2025.csv', 'sessions-2025.csv',
                    'speakers-2024.csv', 'exhibitors-2024.csv', 'sessions-2024.csv']) {
  const rows = parseCsv(readFileSync(resolve(HERE, file), 'utf8').replace(/^﻿/, ''));
  const i = rows[0].indexOf('year');
  const want = file.slice(-8, -4);
  check(rows.slice(1).every(r => r[i] === want), `${file} is year=${want} throughout`);
}

console.log(fail ? `\nRESULT: ${fail} check(s) FAILED` : '\nRESULT: all checks passed');
process.exit(fail ? 1 : 0);
