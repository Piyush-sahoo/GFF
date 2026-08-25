/**
 * The one CSV writer for this repo: UTF-8 with BOM, RFC4180 quoting, and blank
 * stays blank — never "N/A", never "Unknown", never a guess.
 *
 * Lifted verbatim out of export.mjs when export-archive.mjs needed the same
 * guarantees for the 2024/2025 files. Both importers share this so the archive
 * CSVs cannot quietly drift from the 2026 ones.
 */

const BOM = '﻿';

/** Cell value -> CSV text. Blank is blank: null/undefined/empty array all render as "". */
export function cell(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.length ? v.map(x => String(x).trim()).filter(Boolean).join(';') : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = String(v);
  return s.trim() === '' ? '' : s;
}

/** RFC4180 field: quote when the value contains a delimiter, quote, CR/LF, or edge whitespace. */
export function field(s) {
  if (s === '') return '';
  if (/[",\r\n]/.test(s) || s !== s.trim()) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(columns, rows) {
  const lines = [columns.map(c => field(c.header)).join(',')];
  for (const r of rows) lines.push(columns.map(c => field(cell(c.get(r)))).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

/** Excel/Sheets treat a leading = + - @ as a formula. We do not mutate data; we report it. */
export function formulaRisks(columns, rows) {
  const hits = [];
  for (const r of rows) {
    for (const c of columns) {
      const s = cell(c.get(r));
      if (/^[=+\-@\t\r]/.test(s)) hits.push({ column: c.header, value: s.slice(0, 60) });
    }
  }
  return hits;
}

/** True when a value carries information. Used for coverage counts. */
export const has = v => !(v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0));
export const count = (rows, fn) => rows.reduce((n, r) => n + (has(fn(r)) ? 1 : 0), 0);

export function tally(rows, fn) {
  const m = {};
  for (const r of rows) { const k = fn(r) ?? '(empty)'; m[k] = (m[k] || 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}

/** Strict RFC4180 reader, for verifying an emitted file independently of how it was written. */
export function parseCsv(text) {
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
