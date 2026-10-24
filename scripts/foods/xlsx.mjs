// Minimal reader for the .xlsx workbooks the food build uses (Node built-ins plus the system
// `unzip`). Reads cell text only: shared strings, inline strings and plain values.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function unescapeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITY[e] ?? m;
  });
}

const text = xml => unescapeXml([...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''));

function colIndex(ref) {
  let n = 0;
  for (const ch of /^[A-Z]+/.exec(ref)[0]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

/** Rows of one worksheet as arrays of strings ('' for an empty cell), from an unzipped workbook. */
export function readSheet(dir, sheetName) {
  const workbook = readFileSync(join(dir, 'xl/workbook.xml'), 'utf8');
  const rels = readFileSync(join(dir, 'xl/_rels/workbook.xml.rels'), 'utf8');
  let shared = [];
  try {
    shared = [...readFileSync(join(dir, 'xl/sharedStrings.xml'), 'utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => text(m[1]));
  } catch { /* a workbook without shared strings */ }
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map(m => ({
    name: unescapeXml(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? ''),
    rid: /\br:id="([^"]*)"/.exec(m[1])?.[1],
  }));
  const sheet = sheets.find(s => s.name === sheetName);
  if (!sheet) throw new Error(`sheet "${sheetName}" not found; sheets: ${sheets.map(s => s.name).join(' | ')}`);
  const rel = [...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map(m => m[1]).find(a => new RegExp(`\\bId="${sheet.rid}"`).test(a));
  let target = /\bTarget="([^"]*)"/.exec(rel ?? '')?.[1];
  if (!target) throw new Error(`no worksheet target for ${sheetName}`);
  target = target.replace(/^\//, '');
  if (!target.startsWith('xl/')) target = `xl/${target}`;
  const xml = readFileSync(join(dir, target), 'utf8');
  const rows = [];
  for (const r of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row = [];
    for (const c of (r[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      if (!ref) continue;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1] ?? 'n';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = text(body);
      else if (v !== undefined) value = unescapeXml(v);
      row[colIndex(ref)] = value;
    }
    rows.push(Array.from(row, x => x ?? ''));
  }
  return rows;
}

/** Header text with line breaks and repeated spaces collapsed, for matching column names. */
export const clean = s => String(s).replace(/\s+/g, ' ').trim();
