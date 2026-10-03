/**
 * Turns pasted text, CSV/TSV, spreadsheet rows (xlsx) or a vCard into contacts for a customer list.
 * Pure functions (no DOM, no network): everything is parsed in the browser and only the cleaned
 * contacts are sent to the API.
 */
export interface ParsedContact { phone: string; name?: string }
export interface ImportPreview { contacts: ParsedContact[]; invalid: string[]; duplicates: number; total: number }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * "+509 3700-1234" and "00509…" are international and kept as is. Anything else gets the default
 * country code (digits only, e.g. "509") unless it already starts with it. Returns "+digits" or null.
 */
export function normalizePhone(raw: string, countryCode = ''): string | null {
  const text = raw.trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  let full: string;
  if (text.startsWith('+')) full = digits;
  else if (digits.startsWith('00')) full = digits.slice(2);
  else {
    const cc = countryCode.replace(/\D/g, '');
    if (!cc) full = digits;
    else if (digits.startsWith(cc) && digits.length >= cc.length + 7) full = digits;
    else full = cc + digits.replace(/^0+/, '');
  }
  return /^[1-9]\d{7,14}$/.test(full) ? `+${full}` : null;
}

const looksLikePhone = (v: string) => (v.match(/\d/g) ?? []).length >= 7 && !/[a-z]{3,}/i.test(v);

/** RFC 4180-ish parser: quoted fields, escaped quotes, the delimiter is detected from the first line. */
export function parseDelimited(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = ([',', ';', '\t'] as const).map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

/** vCard (.vcf, the "export contacts" file of phones and Google Contacts): one row per phone number. */
export function parseVcf(input: string): string[][] {
  const lines = input.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n'); // unfold continuation lines
  const rows: string[][] = [];
  let name = '';
  let phones: string[] = [];
  let inCard = false;
  for (const line of lines) {
    const up = line.toUpperCase();
    if (up.startsWith('BEGIN:VCARD')) { inCard = true; name = ''; phones = []; continue; }
    if (up.startsWith('END:VCARD')) {
      if (inCard) for (const p of phones) rows.push([p, name]);
      inCard = false;
      continue;
    }
    if (!inCard) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).split(';')[0]!.split('.').pop()!.toUpperCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'FN' && value) name = value;
    else if (key === 'N' && !name) { const [family = '', given = ''] = value.split(';'); name = `${given} ${family}`.trim(); }
    else if (key === 'TEL' && value) phones.push(value.replace(/^tel:/i, ''));
  }
  return rows;
}

const PHONE_HEADER = /^(phone|tel|telephone|mobile|mobil|movil|cell|cel|celular|whatsapp|numero|number|num|contact number)/;
const NAME_HEADER = /^(name|nom|nombre|prenom|first ?name|given ?name|full ?name|contact|client|customer)/;
const LAST_HEADER = /^(last ?name|family ?name|surname|apellido|nom de famille)/;

/** Maps table rows (with or without a header line) to contacts, cleaning and de-duplicating them. */
export function rowsToContacts(rows: unknown[][], countryCode = ''): ImportPreview {
  const table = rows.map((r) => r.map((c) => (c == null ? '' : String(c).trim()))).filter((r) => r.some(Boolean));
  let phoneCol = -1;
  let nameCols: number[] = [];
  let data = table;

  const header = table[0]?.map(fold) ?? [];
  const phoneAt = header.findIndex((h) => PHONE_HEADER.test(h));
  if (phoneAt >= 0 && !looksLikePhone(table[0]![phoneAt]!)) {
    phoneCol = phoneAt;
    const given = header.findIndex((h, i) => i !== phoneAt && NAME_HEADER.test(h));
    const last = header.findIndex((h, i) => i !== phoneAt && LAST_HEADER.test(h));
    nameCols = [given, last].filter((i) => i >= 0);
    data = table.slice(1);
  } else {
    // No header: the phone is the first column that looks like one; the name is another text column.
    const sample = table.slice(0, 10);
    const width = Math.max(0, ...sample.map((r) => r.length));
    phoneCol = Array.from({ length: width }, (_, i) => i).find((i) => sample.filter((r) => looksLikePhone(r[i] ?? '')).length > sample.length / 2) ?? 0;
    const nameCol = Array.from({ length: width }, (_, i) => i).find((i) => i !== phoneCol && sample.some((r) => (r[i] ?? '') !== '' && !looksLikePhone(r[i]!)));
    nameCols = nameCol === undefined ? [] : [nameCol];
  }

  const seen = new Set<string>();
  const contacts: ParsedContact[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const row of data) {
    const raw = row[phoneCol] ?? '';
    const phone = normalizePhone(raw, countryCode);
    if (!phone) { if (raw) invalid.push(raw); continue; }
    if (seen.has(phone)) { duplicates++; continue; }
    seen.add(phone);
    const name = nameCols.map((i) => row[i] ?? '').filter(Boolean).join(' ').slice(0, 100);
    contacts.push(name ? { phone, name } : { phone });
  }
  return { contacts, invalid, duplicates, total: data.length };
}

/** Pasted text: one contact per line ("+50937001234, Jean"); also accepts a copied spreadsheet (tabs). */
export const parsePasted = (text: string, countryCode = '') => rowsToContacts(parseDelimited(text), countryCode);

export type FileKind = 'xlsx' | 'vcf' | 'text';
export const fileKind = (name: string): FileKind => (/\.xlsx$/i.test(name) ? 'xlsx' : /\.vcf$/i.test(name) ? 'vcf' : 'text');
