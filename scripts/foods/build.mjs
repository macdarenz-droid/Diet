// Builds the offline food tables in public/data/ from pinned open food-composition datasets.
// Usage: node scripts/foods/build.mjs [--cache DIR] [--offline]
// Sources, licences, the normalisation rules and the output schema: docs/FOOD-DATA.md.
// Node 22 built-ins only (fetch, crypto, zlib); archives and workbooks are unpacked with the
// system `unzip` command (Info-ZIP).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { clean, readSheet } from './xlsx.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'public/data');
const FOODS_TS = join(ROOT, 'src/nutrition/foods.ts');
export const KJ_PER_KCAL = 4.184;
const RETRIEVED = '2026-10-24';

// ---------------------------------------------------------------------------------------------
// Pinned downloads. sha256 values were taken from the files downloaded on 2026-10-24; a changed
// file stops the build until someone reviews the new release and updates the pin.
export const DOWNLOADS = {
  foundation: {
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip',
    sha256: '186e988ec542e913f51ef62b86a47758e8cdd0d1dc3889e7b055581f3c09c77a',
  },
  srLegacy: {
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip',
    sha256: '0fe8ae486a2c8eb42cb96413f058deb51863a46c8fb8eeb4b1fb45006dd338ef',
  },
  fndds: {
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip',
    sha256: 'dfb06ae7ddc397ccd570b91c14b75438ab2ba39f64f22d321f61d4a52a77f3eb',
  },
  afcdDetails: {
    url: 'https://www.foodstandards.gov.au/sites/default/files/2025-12/AFCD%20Release%203%20-%20Food%20Details.xlsx',
    sha256: '69aa096c45cb0699db60a9c544442312e9ff09af587b99c42dc78bc26f689629',
  },
  afcdNutrients: {
    url: 'https://www.foodstandards.gov.au/sites/default/files/2025-12/AFCD%20Release%203%20-%20Nutrient%20profiles.xlsx',
    sha256: '14cb3e73dbf58987b440e6299624c0fefd7a4e61591fc1f753995d9534e0efc9',
  },
  cofid: {
    url: 'https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx',
    sha256: '436e9445ef2adb2a75f3d7edd51302de3adad25385f9795fc94ba58bd030e97d',
  },
};

// ---------------------------------------------------------------------------------------------
// Licence and attribution text written into each output file, so every copy carries its notices.
const AFCD_LIMITATION = 'There are limitations associated with food composition databases. Food composition data used in the database or databases may represent an average of the nutrient content of a particular sample of foods and ingredients, determined at a particular time. The nutrient composition of foods and ingredients can vary substantially between batches and brands because of a number of factors, including changes in season, processing practices and ingredient source, and methods of calculation.';

export const META = {
  usda: {
    title: 'USDA FoodData Central: Foundation Foods (April 2026), SR Legacy (April 2018), FNDDS 2021-2023 (October 2024)',
    publisher: 'U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center',
    licence: 'CC0 1.0 Universal (public domain)',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center. FoodData Central. [Internet]. [cited 2026-10-24]. Available from https://fdc.nal.usda.gov/.',
    notices: [],
  },
  afcd: {
    title: 'Australian Food Composition Database - Release 3 (December 2025)',
    publisher: 'Food Standards Australia New Zealand (FSANZ)',
    licence: 'FSANZ Data User Licence Agreement (based on Creative Commons Attribution-ShareAlike 3.0 Australia). This derived file is distributed under the same licence.',
    licenceUrl: 'https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement',
    attribution: 'Food Standards Australia New Zealand (FSANZ), Australian Food Composition Database - Release 3. https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd',
    notices: [
      `Limitation of Data Statement: ${AFCD_LIMITATION}`,
      'This work is based on Australian data, and Australian data may not be appropriate for use in other countries.',
      'Changes made by Nuance: only energy, protein, fat, available carbohydrate (with sugar alcohols), saturated fat, dietary fibre, total sugars, sodium and alcohol are kept; energy is converted from kJ to kcal by dividing by 4.184; values are rounded (energy and sodium to 0.1, grams to 0.01); aliases are taken from the "Also known as" and "Commonly called" sentences of the food description. FSANZ does not endorse Nuance.',
    ],
  },
  cofid: {
    title: "McCance and Widdowson's Composition of Foods Integrated Dataset (CoFID) 2021",
    publisher: 'Public Health England (now the Office for Health Improvement and Disparities)',
    licence: 'Open Government Licence v3.0',
    licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    attribution: "Contains public sector information licensed under the Open Government Licence v3.0. Source: Public Health England, McCance and Widdowson's The Composition of Foods Integrated Dataset 2021, https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid",
    notices: [
      'Changes made by Nuance: carbohydrate and total sugars are converted from monosaccharide equivalents to weights (starch / 1.10, sucrose, maltose and lactose / 1.05, other carbohydrate / 1.05); trace values are read as 0; alcoholic drinks (given per 100 ml) and foods weighed with inedible parts are left out; values are rounded.',
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// Download, verify and unpack.

function args() {
  const a = process.argv.slice(2);
  const get = flag => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
  return { cache: resolve(get('--cache') ?? join(tmpdir(), 'nuance-foods-cache')), offline: a.includes('--offline') };
}

const sha256 = buf => createHash('sha256').update(buf).digest('hex');

async function fetchPinned(key, cache, offline) {
  const { url, sha256: want } = DOWNLOADS[key];
  const file = join(cache, 'downloads', `${key}${url.endsWith('.zip') ? '.zip' : '.xlsx'}`);
  if (existsSync(file) && sha256(readFileSync(file)) === want) return file;
  if (offline) throw new Error(`${key}: not in the cache (${file}) and --offline was given`);
  console.log(`download ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== want) throw new Error(`${key}: sha256 ${got} does not match the pinned ${want}; review the new release before updating the pin`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  return file;
}

/** Unzips into a fresh, empty directory of its own (downloads are untrusted input). */
function unzip(archive, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const r = spawnSync('unzip', ['-q', '-o', archive, '-d', dir], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`unzip failed for ${archive} (status ${r.status})`);
  return dir;
}

// ---------------------------------------------------------------------------------------------
// Shared helpers.

const round = (v, dp) => (v === null || v === undefined ? null : Math.round(v * 10 ** dp) / 10 ** dp + 0);
const tidy = s => String(s).replace(/\s+/g, ' ').trim();

/** One normalised food. Nutrients per 100 g edible portion; null means the source reports no value. */
function food(id, name, n, aliases = []) {
  return {
    id,
    name: tidy(name),
    kcal: round(n.kcal, 1),
    protein: round(n.protein, 2),
    carbs: round(n.carbs, 2),
    fat: round(n.fat, 2),
    satFat: round(n.satFat, 2),
    fibre: round(n.fibre, 2),
    sugars: round(n.sugars, 2),
    sodium: round(n.sodium, 1),
    alcohol: n.alcohol ? round(n.alcohol, 2) : null,
    aliases: [...new Set(aliases.map(tidy).filter(a => a && a.toLowerCase() !== tidy(name).toLowerCase()))],
  };
}

const stats = {};
const count = (source, reason) => { (stats[source] ??= {})[reason] = (stats[source][reason] ?? 0) + 1; };

// ---------------------------------------------------------------------------------------------
// USDA FoodData Central. Nutrient ids as in src/nutrition/fdc.ts (docs/ARCHITECTURE.md §5).
// "Carbohydrate, by difference" (1005) includes dietary fibre (1079); available carbohydrate is
// 1005 minus 1079. When fibre is not reported, 1005 is used as available carbohydrate only if the
// most fibre the food could hold (1005 minus total sugars) is at most 1 g per 100 g; otherwise the
// food is left out.
export const MAX_UNREPORTED_FIBRE = 1;

export function usdaFood(f, source) {
  const m = new Map();
  for (const n of f.foodNutrients ?? []) {
    const id = n?.nutrient?.id;
    if (typeof id === 'number' && typeof n.amount === 'number' && Number.isFinite(n.amount) && !m.has(id)) m.set(id, n.amount);
  }
  const protein = m.get(1003);
  const fat = m.get(1004) ?? m.get(1085);
  const carbDiff = m.get(1005);
  if (protein === undefined || fat === undefined || carbDiff === undefined) { count(source, 'skipped: no protein, fat or carbohydrate'); return null; }
  const kj = m.get(1062);
  const kcal = m.get(1008) ?? m.get(2048) ?? m.get(2047) ?? (kj !== undefined ? kj / KJ_PER_KCAL : undefined);
  if (kcal === undefined) { count(source, 'skipped: no energy'); return null; }
  const fibre = m.get(1079);
  const sugars = m.get(2000) ?? m.get(1063);
  let carbs;
  if (fibre !== undefined) {
    carbs = carbDiff - fibre;
  } else if (carbDiff - (sugars ?? 0) <= MAX_UNREPORTED_FIBRE) {
    carbs = carbDiff;
    count(source, 'no fibre value, carbohydrate by difference kept (at most 1 g of fibre possible)');
  } else { count(source, 'skipped: no fibre value to subtract'); return null; }
  // By-difference values carry the error of every other analysis and can fall below 0.
  if (carbs < 0) { count(source, 'available carbohydrate below 0 set to 0'); carbs = 0; }
  return {
    ndb: f.ndbNumber !== undefined ? String(f.ndbNumber) : undefined,
    ...food(f.fdcId, f.description, {
      kcal, protein, carbs, fat,
      satFat: m.get(1258), fibre, sugars, sodium: m.get(1093), alcohol: m.get(1018),
    }, (f.foodAttributes ?? []).filter(a => a?.foodAttributeType?.id === 1001).map(a => String(a.value ?? ''))),
  };
}

function readUsda(dir, key, source) {
  const file = readdirSync(dir).find(f => f.endsWith('.json'));
  const json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const list = (json[key] ?? []).filter(Boolean);
  (stats[source] ??= {})['records in source'] = list.length;
  return list.map(f => usdaFood(f, source)).filter(Boolean);
}

// ---------------------------------------------------------------------------------------------
// AFCD Release 3. Values per 100 g of the analysed (edible) portion. Carbohydrate is the source's
// "Available carbohydrate, with sugar alcohols"; energy is "Energy with dietary fibre, equated" in
// kJ, divided by 4.184. A blank cell means "not reported" (About AFCD Release 3, p. 1).

const AFCD_COLS = {
  id: 'Public Food Key',
  name: 'Food Name',
  kj: 'Energy with dietary fibre, equated (kJ)',
  protein: 'Protein (g)',
  fat: 'Fat, total (g)',
  carbs: 'Available carbohydrate, with sugar alcohols (g)',
  fibre: 'Total dietary fibre (g)',
  sugars: 'Total sugars (g)',
  satFat: 'Total saturated fatty acids, equated (g)',
  sodium: 'Sodium (Na) (mg)',
  alcohol: 'Alcohol (g)',
};

export function num(v, where) {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const x = Number(s);
  if (!Number.isFinite(x)) throw new Error(`unexpected value "${s}" (${where})`);
  return x;
}

function headerIndex(rows, want, label) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const h = rows[r].map(clean);
    const ix = {};
    for (const [k, name] of Object.entries(want)) ix[k] = h.indexOf(name);
    if (Object.values(ix).every(i => i >= 0)) return { row: r, ix };
  }
  throw new Error(`${label}: header row not found`);
}

/** Alias sentences in AFCD food descriptions: "Also known as A; B." and "Commonly called C." */
export function afcdAliases(description) {
  const out = [];
  for (const m of String(description ?? '').matchAll(/(?:^|[.!?]\s+)(?:Also known as|Commonly called)\s+([^.]+)\./g)) {
    out.push(...m[1].split(/\s*;\s*|\s*,\s*|\s+or\s+/));
  }
  return out;
}

function readAfcd(detailsDir, nutrientsDir) {
  const details = readSheet(detailsDir, 'Food details');
  const d = headerIndex(details, { id: 'Public Food Key', desc: 'Food Description' }, 'AFCD food details');
  const desc = new Map(details.slice(d.row + 1).filter(r => r[d.ix.id]).map(r => [r[d.ix.id], r[d.ix.desc]]));
  const rows = readSheet(nutrientsDir, 'All solids & liquids per 100 g');
  const { row, ix } = headerIndex(rows, AFCD_COLS, 'AFCD nutrient profiles');
  const out = [];
  for (const r of rows.slice(row + 1)) {
    const id = r[ix.id];
    if (!id) continue;
    count('AFCD', 'records in source');
    if (!/^F\d{6}$/.test(id)) throw new Error(`AFCD: unexpected food key ${id}`);
    const v = k => num(r[ix[k]], `AFCD ${id} ${AFCD_COLS[k]}`);
    const kj = v('kj'), protein = v('protein'), fat = v('fat'), carbs = v('carbs');
    if (protein === null || fat === null || carbs === null) { count('AFCD', 'skipped: no protein, fat or carbohydrate'); continue; }
    if (kj === null) { count('AFCD', 'skipped: no energy'); continue; }
    out.push(food(id, r[ix.name], {
      kcal: kj / KJ_PER_KCAL, protein, carbs, fat,
      satFat: v('satFat'), fibre: v('fibre'), sugars: v('sugars'), sodium: v('sodium'), alcohol: v('alcohol'),
    }, afcdAliases(desc.get(id))));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// CoFID 2021. Carbohydrate, starch and sugars are given as monosaccharide equivalents (user guide
// p. 10); converted to weights with the guide's factors (p. 16): starch / 1.10, sucrose, maltose
// and lactose / 1.05, glucose, fructose and galactose as given, anything else / 1.05. "Tr" (trace)
// is read as 0 and "N" (present, amount unknown) as not reported. Fibre is AOAC fibre only; the
// Englyst NSP value measures less and is not used. Alcoholic drinks (group Q, per 100 ml) and
// foods "weighed with" inedible parts are left out.

export const COFID_STARCH = 1.1;
export const COFID_DISACCHARIDE = 1.05;

export function cofidValue(v, where) {
  const s = String(v ?? '').trim();
  if (s === 'Tr') return 0;
  if (s === 'N' || s === '') return null;
  const x = Number(s);
  if (!Number.isFinite(x)) throw new Error(`unexpected value "${s}" (${where})`);
  return x;
}

/** Available carbohydrate and total sugars as weights, from CoFID monosaccharide equivalents. */
export function cofidCarbs(c) {
  const parts = [c.GLUC, c.FRUCT, c.GALACT, c.SUCR, c.MALT, c.LACT];
  const sugars = parts.every(x => x !== null)
    ? c.GLUC + c.FRUCT + c.GALACT + (c.SUCR + c.MALT + c.LACT) / COFID_DISACCHARIDE
    : c.TOTSUG !== null ? c.TOTSUG / COFID_DISACCHARIDE : null;
  if (c.CHO === null) return { carbs: null, sugars };
  if (c.STAR === null || c.TOTSUG === null || sugars === null) return { carbs: c.CHO / COFID_DISACCHARIDE, sugars };
  const rest = Math.max(0, c.CHO - c.STAR - c.TOTSUG);
  return { carbs: c.STAR / COFID_STARCH + sugars + rest / COFID_DISACCHARIDE, sugars };
}

function readCofid(dir) {
  const prox = readSheet(dir, '1.3 Proximates');
  const inorg = readSheet(dir, '1.4 Inorganics');
  const codes = ['PROT', 'FAT', 'CHO', 'KCALS', 'STAR', 'TOTSUG', 'GLUC', 'GALACT', 'FRUCT', 'SUCR', 'MALT', 'LACT', 'ALCO', 'AOACFIB', 'SATFOD'];
  const pc = prox[1].map(clean);
  const ix = Object.fromEntries(codes.map(k => [k, pc.indexOf(k)]));
  for (const [k, i] of Object.entries(ix)) if (i < 0) throw new Error(`CoFID: column ${k} not found`);
  if (clean(prox[0][0]) !== 'Food Code' || clean(prox[0][1]) !== 'Food Name' || clean(prox[0][3]) !== 'Group') throw new Error('CoFID: unexpected proximates header');
  const naCol = inorg[1].map(clean).indexOf('NA');
  if (naCol < 0) throw new Error('CoFID: sodium column not found');
  // Sodium is matched by row position as well as code, because one code appears twice.
  const sodiumRows = inorg.slice(3).filter(r => r[0]);
  const out = [];
  const codesSeen = new Map();
  const proxRows = prox.slice(3).filter(r => clean(r[0] ?? ''));
  if (proxRows.length !== sodiumRows.length) throw new Error('CoFID: proximates and inorganics differ in length');
  for (const [k, r] of proxRows.entries()) {
    const code = clean(r[0]);
    const inorganic = sodiumRows[k];
    if (clean(inorganic[0]) !== code || clean(inorganic[1]) !== clean(r[1])) throw new Error(`CoFID: row ${k} differs between proximates and inorganics`);
    count('CoFID', 'records in source');
    if (!/^\d{2}-\d{3,4}$/.test(code)) throw new Error(`CoFID: unexpected food code ${code}`);
    // CoFID 2021 gives two different foods the code 13-669; a repeat gets "~2", "~3", ...
    const seen = (codesSeen.get(code) ?? 0) + 1;
    codesSeen.set(code, seen);
    const id = seen === 1 ? code : `${code}~${seen}`;
    if (seen > 1) count('CoFID', 'food code used twice in the source, kept with a suffix');
    const name = r[1];
    if (/^Q/.test(clean(r[3] ?? ''))) { count('CoFID', 'skipped: alcoholic drink given per 100 ml'); continue; }
    if (/weighed with/i.test(name)) { count('CoFID', 'skipped: weighed with inedible parts'); continue; }
    const c = Object.fromEntries(codes.map(k => [k, cofidValue(r[ix[k]], `CoFID ${id} ${k}`)]));
    const { carbs, sugars } = cofidCarbs(c);
    if (c.PROT === null || c.FAT === null || carbs === null) { count('CoFID', 'skipped: no protein, fat or carbohydrate'); continue; }
    if (c.KCALS === null) { count('CoFID', 'skipped: no energy'); continue; }
    out.push(food(id, name, {
      kcal: c.KCALS, protein: c.PROT, carbs, fat: c.FAT,
      satFat: c.SATFOD, fibre: c.AOACFIB, sugars, sodium: cofidValue(inorganic[naCol], `CoFID ${id} NA`), alcohol: c.ALCO,
    }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Checks that stop the build: every kept food must pass these.

const GRAMS = ['protein', 'carbs', 'fat', 'satFat', 'fibre', 'sugars', 'alcohol'];

export function problems(f) {
  const out = [];
  for (const k of ['kcal', 'protein', 'carbs', 'fat']) if (typeof f[k] !== 'number') out.push(`${k} missing`);
  for (const k of [...GRAMS, 'kcal', 'sodium']) if (f[k] !== null && (typeof f[k] !== 'number' || !Number.isFinite(f[k]) || f[k] < 0)) out.push(`${k} invalid`);
  for (const k of GRAMS) if (f[k] !== null && f[k] > 100.5) out.push(`${k} over 100 g`);
  if (f.kcal > 902) out.push('kcal over 902');
  if (f.sodium !== null && f.sodium > 40000) out.push('sodium over 40 g');
  if (f.satFat !== null && f.satFat > f.fat + 0.5) out.push('saturated fat above fat');
  return out;
}

// ---------------------------------------------------------------------------------------------
// Deduplication.
// 1. A Foundation food and an SR Legacy food with the same NDB number are the same food analysed
//    again; the SR Legacy one is dropped when the Foundation one reports every nutrient it reports.
// 2. Across all sources, foods with the same name (case and punctuation ignored) and the same
//    eight values are one food; the first in source order (Foundation, SR Legacy, FNDDS, AFCD,
//    CoFID) is kept.

const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'satFat', 'fibre', 'sugars', 'sodium'];
const reported = f => KEYS.filter(k => f[k] !== null);

export function dedupe(groups) {
  const foundationByNdb = new Map(groups.Foundation.filter(f => f.ndb).map(f => [f.ndb, f]));
  groups['SR Legacy'] = groups['SR Legacy'].filter(f => {
    const twin = f.ndb ? foundationByNdb.get(f.ndb) : undefined;
    if (twin && reported(f).every(k => twin[k] !== null)) { count('SR Legacy', 'dropped: Foundation food with the same NDB number reports every value'); return false; }
    return true;
  });
  const kept = new Map();
  for (const [type, list] of Object.entries(groups)) {
    groups[type] = list.filter(f => {
      const key = f.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + '|' + KEYS.map(k => f[k] === null ? '' : round(f[k], 1)).join(',');
      const first = kept.get(key);
      if (!first) { kept.set(key, f); return true; }
      // The dropped copy's aliases (FNDDS "Additional Description") stay searchable on the kept one.
      first.aliases = [...new Set([...first.aliases, ...f.aliases])];
      count(type, 'dropped: same name and values as an earlier food');
      return false;
    });
  }
  return groups;
}

// ---------------------------------------------------------------------------------------------
// Output. One file per licence; the file name carries a content hash so a changed table is never
// served from an old cache. Row layout is in `fields`; trailing empty fields are left off.

export const FIELDS = ['id', 'name', 'kcal', 'protein', 'carbs', 'fat', 'satFat', 'fibre', 'sugars', 'sodium', 'alcohol', 'aliases'];

function row(f) {
  const r = [f.id, f.name, f.kcal, f.protein, f.carbs, f.fat, f.satFat, f.fibre, f.sugars, f.sodium, f.alcohol, f.aliases.length ? f.aliases : null];
  while (r.length > 10 && r[r.length - 1] === null) r.pop();
  return r;
}

function writeTable(source, groups) {
  const m = META[source];
  const body = {
    schema: 1,
    source,
    title: m.title,
    publisher: m.publisher,
    licence: m.licence,
    licenceUrl: m.licenceUrl,
    attribution: m.attribution,
    notices: m.notices,
    retrieved: RETRIEVED,
    downloads: Object.entries(DOWNLOADS).filter(([k]) => ({ usda: ['foundation', 'srLegacy', 'fndds'], afcd: ['afcdDetails', 'afcdNutrients'], cofid: ['cofid'] })[source].includes(k)).map(([, d]) => d),
    units: 'per 100 g edible portion; kcal; sodium mg; others g; null = not reported by the source',
    fields: FIELDS,
    groups: Object.entries(groups).map(([dataType, list]) => ({ dataType, foods: list.map(row) })),
  };
  const text = JSON.stringify(body);
  const hash = sha256(text).slice(0, 10);
  const name = `foods-${source}.${hash}.json`;
  writeFileSync(join(OUT, name), text);
  return { name, raw: Buffer.byteLength(text), gzip: gzipSync(text, { level: 9 }).length, count: Object.values(groups).reduce((n, l) => n + l.length, 0) };
}

function updateFoodsTs(names) {
  const src = readFileSync(FOODS_TS, 'utf8');
  const line = `export const FOOD_FILES = [${names.map(n => `'data/${n}'`).join(', ')}] as const;`;
  const next = src.replace(/^export const FOOD_FILES = \[.*\] as const;$/m, line);
  if (next === src && !src.includes(line)) throw new Error('FOOD_FILES line not found in src/nutrition/foods.ts');
  writeFileSync(FOODS_TS, next);
}

async function main() {
  const { cache, offline } = args();
  const get = async key => fetchPinned(key, cache, offline);
  const x = key => join(cache, 'unpacked', key);

  const foundation = readUsda(unzip(await get('foundation'), x('foundation')), 'FoundationFoods', 'Foundation');
  const srLegacy = readUsda(unzip(await get('srLegacy'), x('srLegacy')), 'SRLegacyFoods', 'SR Legacy');
  const fndds = readUsda(unzip(await get('fndds'), x('fndds')), 'SurveyFoods', 'Survey (FNDDS)');
  const afcd = readAfcd(unzip(await get('afcdDetails'), x('afcdDetails')), unzip(await get('afcdNutrients'), x('afcdNutrients')));
  const cofid = readCofid(unzip(await get('cofid'), x('cofid')));

  const groups = dedupe({ Foundation: foundation, 'SR Legacy': srLegacy, 'Survey (FNDDS)': fndds, AFCD: afcd, CoFID: cofid });

  const bad = Object.values(groups).flat().map(f => [f, problems(f)]).filter(([, p]) => p.length);
  if (bad.length) {
    for (const [f, p] of bad.slice(0, 30)) console.error(`${f.id} ${f.name}: ${p.join(', ')}`);
    throw new Error(`${bad.length} foods failed the checks`);
  }
  for (const [type, list] of Object.entries(groups)) {
    const ids = new Set();
    for (const f of list) { if (ids.has(f.id)) throw new Error(`${type}: duplicate id ${f.id}`); ids.add(f.id); }
  }

  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (/^foods-[a-z]+\.[0-9a-f]+\.json$/.test(f)) rmSync(join(OUT, f));
  const files = [
    writeTable('usda', { Foundation: groups.Foundation, 'SR Legacy': groups['SR Legacy'], 'Survey (FNDDS)': groups['Survey (FNDDS)'] }),
    writeTable('afcd', { AFCD: groups.AFCD }),
    writeTable('cofid', { CoFID: groups.CoFID }),
  ];
  updateFoodsTs(files.map(f => f.name));

  for (const [type, list] of Object.entries(groups)) (stats[type] ??= {}).kept = list.length;
  const total = { foods: files.reduce((n, f) => n + f.count, 0), raw: files.reduce((n, f) => n + f.raw, 0), gzip: files.reduce((n, f) => n + f.gzip, 0) };
  // The counts docs/FOOD-DATA.md quotes, kept next to the script so a rebuild shows what changed.
  writeFileSync(join(ROOT, 'scripts/foods/build-report.json'), `${JSON.stringify({ counts: stats, files, total }, null, 2)}\n`);
  console.log(JSON.stringify(stats, null, 2));
  for (const f of files) console.log(`${f.name}: ${f.count} foods, ${f.raw} bytes raw, ${f.gzip} bytes gzip`);
  console.log(`total: ${total.foods} foods, ${total.raw} bytes raw, ${total.gzip} bytes gzip`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message ?? e); process.exit(1); });
}
