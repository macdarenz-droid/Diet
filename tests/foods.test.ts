// The offline food tables (public/data, built by scripts/foods/build.mjs) and their search.
// Spot-check values are copied from the source files pinned in build.mjs, row by row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { NUTRIENT_KEYS } from '@/core/models';
import { FIELDS, FOOD_FILES, FoodIndex, checkTable, numericId, resetFoods, searchLocal, withEstimate, type FoodRow, type FoodTable, type LocalCandidate } from '@/nutrition/foods';
import { choose } from '@/nutrition/ground';
import { COFID_DISACCHARIDE, COFID_STARCH, KJ_PER_KCAL, MAX_UNREPORTED_FIBRE, afcdAliases, cofidCarbs, cofidValue, dedupe, problems, usdaFood, type BuiltFood } from '../scripts/foods/build.mjs';
import { per100 } from './helpers';

const text = (f: string) => readFileSync(`public/${f}`, 'utf8');
const tables: FoodTable[] = FOOD_FILES.map(f => checkTable(JSON.parse(text(f))));
const index = new FoodIndex(tables);
const group = (dataType: string) => tables.flatMap(t => t.groups).find(g => g.dataType === dataType)!;
const rows = (dataType: string) => group(dataType).foods;
const row = (dataType: string, id: string | number) => rows(dataType).find(r => r[0] === id);
const DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'AFCD', 'CoFID'];

describe('shipped files', () => {
  it('lists exactly the table files in public/data, each named by its content hash', () => {
    const onDisk = readdirSync('public/data').filter(f => f.startsWith('foods-')).map(f => `data/${f}`).sort();
    expect([...FOOD_FILES].sort()).toEqual(onDisk);
    for (const f of FOOD_FILES) {
      const hash = createHash('sha256').update(text(f)).digest('hex').slice(0, 10);
      expect(f).toBe(`data/foods-${tables[FOOD_FILES.indexOf(f)]!.source}.${hash}.json`);
    }
  });

  it('stays within the phone budget: 3 MB raw and 800 KB gzipped in total', async () => {
    const { gzipSync } = await import('node:zlib');
    const raw = FOOD_FILES.reduce((n, f) => n + Buffer.byteLength(text(f)), 0);
    const gz = FOOD_FILES.reduce((n, f) => n + gzipSync(text(f), { level: 9 }).length, 0);
    expect(raw).toBeLessThanOrEqual(3_000_000);
    expect(gz).toBeLessThanOrEqual(800_000);
  });

  it('carries each source licence and the notices it requires', () => {
    const by = Object.fromEntries(tables.map(t => [t.source, t]));
    expect(Object.keys(by).sort()).toEqual(['afcd', 'cofid', 'usda']);
    for (const t of tables) for (const k of ['title', 'publisher', 'licence', 'licenceUrl', 'attribution'] as const) expect(t[k].length, `${t.source} ${k}`).toBeGreaterThan(10);
    expect(by.usda!.licence).toMatch(/CC0/);
    // FSANZ Data User Licence Agreement, clause 4A(b): licence link, Limitation of Data Statement and
    // the "Australian data" statement go with every copy; 4C(c): changes are identified.
    expect(by.afcd!.licenceUrl).toBe('https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement');
    expect(by.afcd!.notices.join(' ')).toMatch(/Limitation of Data Statement: There are limitations associated with food composition databases/);
    expect(by.afcd!.notices.join(' ')).toMatch(/based on Australian data, and Australian data may not be appropriate for use in other countries/);
    expect(by.afcd!.notices.join(' ')).toMatch(/Changes made by Nuance/);
    expect(by.cofid!.attribution).toMatch(/^Contains public sector information licensed under the Open Government Licence v3\.0\./);
  });

  it('has the five expected groups in source order', () => {
    expect(tables.flatMap(t => t.groups.map(g => g.dataType))).toEqual(DATA_TYPES);
  });

  it('matches the third-party notices file', () => {
    const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
    for (const t of tables) expect(notices).toContain(t.licenceUrl);
    expect(notices).toContain('There are limitations associated with food composition databases');
    expect(notices).toContain('Contains public sector information licensed under the Open Government Licence v3.0.');
  });
});

describe('every food', () => {
  const all = tables.flatMap(t => t.groups.flatMap(g => g.foods.map(r => ({ source: t.source, dataType: g.dataType, r }))));

  it('is a row in the documented layout', () => {
    expect(FIELDS).toEqual(['id', 'name', 'kcal', 'protein', 'carbs', 'fat', 'satFat', 'fibre', 'sugars', 'sodium', 'alcohol', 'aliases']);
    expect(all.length).toBeGreaterThan(15000);
    for (const { source, r } of all) {
      expect(r.length, String(r[0])).toBeGreaterThanOrEqual(10);
      expect(r.length).toBeLessThanOrEqual(12);
      if (source === 'usda') expect(Number.isInteger(r[0])).toBe(true);
      if (source === 'afcd') expect(r[0]).toMatch(/^F\d{6}$/);
      if (source === 'cofid') expect(r[0]).toMatch(/^\d{2}-\d{3,4}(~\d)?$/);
      expect(typeof r[1] === 'string' && r[1].trim() === r[1] && r[1].length > 1).toBe(true);
      if (r[11] !== undefined && r[11] !== null) for (const a of r[11]) expect(typeof a === 'string' && a.length > 0).toBe(true);
    }
  });

  // Energy, protein, carbohydrate and fat are always present; saturated fat, fibre, sugars and
  // sodium are a number or null, where null means the source reports no value (never a made-up 0).
  it('has all eight nutrients, the first four always as numbers, in sane ranges', () => {
    for (const { r } of all) {
      const [, name, kcal, protein, carbs, fat, satFat, fibre, sugars, sodium, alcohol] = r;
      for (const v of [kcal, protein, carbs, fat]) expect(typeof v === 'number' && Number.isFinite(v) && v >= 0, name).toBe(true);
      for (const v of [satFat, fibre, sugars, sodium]) expect(v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0), name).toBe(true);
      expect(kcal, name).toBeLessThanOrEqual(902);
      for (const v of [protein, carbs, fat, satFat, fibre, sugars, alcohol]) if (typeof v === 'number') expect(v, name).toBeLessThanOrEqual(100.5);
      // Analyses do not add up exactly; the largest sum in the sources is CoFID 13-882 "Rosemary,
      // dried" at 106.9 g, then AFCD F003100 at 102.1 g; every other food is at most 100.5 g.
      expect(protein + carbs + fat + (fibre ?? 0) + (alcohol ?? 0), name).toBeLessThanOrEqual(108);
      if (satFat !== null) expect(satFat, name).toBeLessThanOrEqual(fat + 0.5);
      if (sodium !== null) expect(sodium, name).toBeLessThanOrEqual(40000);
    }
  });

  // Atwater general factors plus 7 kcal/g alcohol and 2 kcal/g fibre. Sources use their own
  // factors (USDA specific factors, FSANZ 17/16/37/8 kJ, CoFID 3.75 kcal/g carbohydrate), and
  // sweeteners, polyols and organic acids are not in these four columns, so a few foods differ by
  // more. Tolerance: 20 kcal or 15 %, whichever is larger; at least 99 % of each group within it.
  it('has energy consistent with its macronutrients', () => {
    for (const dataType of DATA_TYPES) {
      const list = rows(dataType);
      const off = list.filter(([, , kcal, p, c, f, , fib, , , alc]) => Math.abs(kcal - (4 * p + 4 * c + 9 * f + 7 * (alc ?? 0) + 2 * (fib ?? 0))) > Math.max(20, 0.15 * kcal));
      expect(off.length / list.length, `${dataType}: ${off.slice(0, 5).map(r => r[1]).join('; ')}`).toBeLessThanOrEqual(0.01);
    }
  });

  it('reports the secondary nutrients as often as its source does', () => {
    // Shares measured on the 2026-10-24 build, floors set a little below them.
    const floor: Record<string, [number, number, number, number]> = {
      'SR Legacy': [0.95, 0.95, 0.78, 0.98],
      'Survey (FNDDS)': [0.99, 0.99, 0.99, 0.99],
      AFCD: [0.99, 0.99, 0.99, 0.99],
      CoFID: [0.88, 0.5, 0.95, 0.97],
      Foundation: [0.25, 0.6, 0.3, 0.95],
    };
    for (const [dataType, f] of Object.entries(floor)) {
      const list = rows(dataType);
      [6, 7, 8, 9].forEach((col, k) => expect(list.filter(r => r[col] !== null).length / list.length, `${dataType} column ${col}`).toBeGreaterThanOrEqual(f[k]!));
    }
  });

  it('has a unique id within its group and a unique numeric id overall', () => {
    for (const dataType of DATA_TYPES) {
      const ids = rows(dataType).map(r => r[0]);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const numeric = all.map(({ source, r }) => numericId(source, r[0]));
    expect(new Set(numeric).size).toBe(numeric.length);
    for (const [k, { source }] of all.entries()) expect(source === 'usda' ? numeric[k]! < 1e9 : numeric[k]! >= 1e9).toBe(true);
  });
});

describe('values against the source rows', () => {
  const at = (dataType: string, id: string | number) => {
    const r = row(dataType, id);
    expect(r, `${dataType} ${id}`).toBeDefined();
    return r!;
  };

  it('USDA SR Legacy 168878 "Rice, white, long-grain, regular, enriched, cooked"', () => {
    // Source: 130 kcal, protein 2.69, fat 0.28, carbohydrate by difference 28.2, fibre 0.4,
    // total sugars 0.05, saturated 0.077, sodium 1 mg. Available carbohydrate 28.2 - 0.4 = 27.8.
    expect(at('SR Legacy', 168878)).toEqual([168878, 'Rice, white, long-grain, regular, enriched, cooked', 130, 2.69, 27.8, 0.28, 0.08, 0.4, 0.05, 1]);
  });

  it('USDA SR Legacy 167717 "Yeast extract spread", with the FNDDS aliases of its dropped twin', () => {
    // Source: 185 kcal, protein 23.9, fat 0.9, by difference 20.4, fibre 6.5, sugars 1.6, sat 0,
    // sodium 3380. FNDDS 2710006 "Yeast extract spread" has the same values and lists Marmite,
    // Promite and Vegemite as additional descriptions.
    const r = at('SR Legacy', 167717);
    expect(r.slice(0, 10)).toEqual([167717, 'Yeast extract spread', 185, 23.9, 13.9, 0.9, 0, 6.5, 1.6, 3380]);
    expect(r[11]).toEqual(['Marmite', 'Promite', 'Vegemite']);
    expect(row('Survey (FNDDS)', 2710006)).toBeUndefined();
  });

  it('USDA FNDDS 2710508 "Tea, bubble"', () => {
    // Source: 55 kcal, protein 0.39, fat 1.39, by difference 10.4, fibre 0.1, sugars 3.5,
    // saturated 0.844, sodium 9; additional descriptions milk tea, tapioca balls, boba.
    expect(at('Survey (FNDDS)', 2710508)).toEqual([2710508, 'Tea, bubble', 55, 0.39, 10.3, 1.39, 0.84, 0.1, 3.5, 9, null, ['milk tea', 'tapioca balls', 'boba']]);
  });

  it('USDA Foundation 321358 "Hummus, commercial"', () => {
    // Source: 229 kcal, protein 7.35, fat 17.1, by difference 14.9, fibre 5.4, sugars (1063) 0.34,
    // saturated 2.22, sodium 438.
    expect(at('Foundation', 321358)).toEqual([321358, 'Hummus, commercial', 229, 7.35, 9.5, 17.1, 2.22, 5.4, 0.34, 438]);
  });

  it('drops SR Legacy 171287 "Egg, whole, raw, fresh" for Foundation 748967, NDB 1123, which reports every value', () => {
    expect(row('SR Legacy', 171287)).toBeUndefined();
    // Source: 148 kcal, protein 12.4, fat 9.96, by difference 0.96, fibre 0, sugars 0.2, sat 3.2, sodium 129.
    expect(at('Foundation', 748967)).toEqual([748967, 'Eggs, Grade A, Large, egg whole', 148, 12.4, 0.96, 9.96, 3.2, 0, 0.2, 129]);
  });

  it('AFCD F008785 "Spread, yeast, vegemite"', () => {
    // Source: energy with dietary fibre 683 kJ (683 / 4.184 = 163.2 kcal), protein 24.4, fat 0.9,
    // available carbohydrate with sugar alcohols 10.9, fibre 6.5, sugars 1.6, saturated 0.14, sodium 3000.
    expect(at('AFCD', 'F008785')).toEqual(['F008785', 'Spread, yeast, vegemite', 163.2, 24.4, 10.9, 0.9, 0.14, 6.5, 1.6, 3000]);
  });

  it('AFCD F009534 "Wax jambu, raw" with the names its description gives, Makopa among them', () => {
    // Source: 109 kJ (26.1 kcal), protein 0.7, fat 0.2, available carbohydrate 4.5, fibre 1.9,
    // sugars 4.5, saturated 0, sodium 1. Description: "Also known as Java Apple; Rose Apple; Makopa; Wax Apple."
    expect(at('AFCD', 'F009534')).toEqual(['F009534', 'Wax jambu, raw', 26.1, 0.7, 4.5, 0.2, 0, 1.9, 4.5, 1, null, ['Java Apple', 'Rose Apple', 'Makopa', 'Wax Apple']]);
  });

  it('CoFID 12-596 "Milk, whole, pasteurised, average": lactose 4.6 as monosaccharide equivalent is 4.38 g', () => {
    // Source: 63 kcal, protein 3.4, fat 3.6, CHO 4.6 (all lactose), AOAC fibre 0.0, sat 2.29, sodium 42.
    expect(at('CoFID', '12-596')).toEqual(['12-596', 'Milk, whole, pasteurised, average', 63, 3.4, 4.38, 3.6, 2.29, 0, 4.38, 42]);
  });

  it('CoFID 11-1145 "Bread, white, average": starch 45.8 / 1.10, sugars 3.0 / 1.05, saturated fat N', () => {
    // Source: 236 kcal, protein 8.7, fat 2.1, CHO 48.7, starch 45.8, total sugars 3.0 (galactose
    // blank, so total sugars / 1.05), AOAC fibre 2.9, saturated N, sodium 400.
    expect(at('CoFID', '11-1145')).toEqual(['11-1145', 'Bread, white, average', 236, 8.7, 44.49, 2.1, null, 2.9, 2.86, 400]);
  });

  it('leaves out CoFID alcoholic drinks given per 100 ml and foods weighed with inedible parts', () => {
    expect(row('CoFID', '17-752')).toBeUndefined(); // Wine, red (group QE)
    expect(rows('CoFID').filter(r => /weighed with/i.test(r[1]))).toEqual([]);
  });
});

describe('carbohydrate normalisation', () => {
  const nutrient = (id: number, amount: number) => ({ nutrient: { id }, amount });
  const usda = (...n: [number, number][]) => usdaFood({ fdcId: 1, description: 'Test food', foodNutrients: n.map(([id, a]) => nutrient(id, a)) }, 'test');

  it('USDA: available carbohydrate is carbohydrate by difference minus fibre', () => {
    expect(usda([1008, 100], [1003, 5], [1004, 2], [1005, 20], [1079, 3])!.carbs).toBe(17);
  });

  it('USDA: without a fibre value, by difference is kept only when at most 1 g of fibre is possible', () => {
    expect(MAX_UNREPORTED_FIBRE).toBe(1);
    expect(usda([1008, 100], [1003, 5], [1004, 2], [1005, 10], [2000, 9])!.carbs).toBe(10);
    expect(usda([1008, 100], [1003, 5], [1004, 2], [1005, 0.8])!.carbs).toBe(0.8);
    expect(usda([1008, 100], [1003, 5], [1004, 2], [1005, 10], [2000, 8.5])).toBeNull();
    expect(usda([1008, 100], [1003, 5], [1004, 2], [1005, 10])).toBeNull();
  });

  it('USDA: a negative by-difference value becomes 0; protein, fat or carbohydrate missing skips the food', () => {
    expect(usda([1008, 100], [1003, 20], [1004, 5], [1005, -0.5])!.carbs).toBe(0);
    expect(usda([1008, 100], [1003, 20], [1005, 1])).toBeNull();
  });

  it('USDA: energy in kcal (1008, then 2048, 2047), else kJ / 4.184; nothing else is invented', () => {
    expect(KJ_PER_KCAL).toBe(4.184);
    expect(usda([2047, 120], [2048, 118], [1003, 1], [1004, 1], [1005, 1], [1079, 0])!.kcal).toBe(118);
    expect(usda([1062, 418.4], [1003, 1], [1004, 1], [1005, 1], [1079, 0])!.kcal).toBe(100);
    expect(usda([1003, 1], [1004, 1], [1005, 1], [1079, 0])).toBeNull();
    const f = usda([1008, 50], [1003, 1], [1004, 1], [1005, 1], [1079, 0])!;
    expect([f.satFat, f.sugars, f.sodium]).toEqual([null, null, null]);
  });

  it('USDA: aliases come from FNDDS "Additional Description" attributes only', () => {
    const f = usdaFood({
      fdcId: 1, description: 'Roll, white, hard',
      foodNutrients: [nutrient(1008, 293), nutrient(1003, 9.9), nutrient(1004, 4.3), nutrient(1005, 52.7), nutrient(1079, 2.3)],
      foodAttributes: [
        { value: 'Pan de sal / Pandisal Filipino bread', foodAttributeType: { id: 1001, name: 'Additional Description' } },
        { value: 'Moisture change: 0%', foodAttributeType: { id: 1002, name: 'Adjustments' } },
        { value: '4204', foodAttributeType: { id: 999, name: 'Attribute' } },
      ],
    }, 'test')!;
    expect(f.aliases).toEqual(['Pan de sal / Pandisal Filipino bread']);
    expect(f.carbs).toBeCloseTo(50.4);
  });

  it('CoFID: monosaccharide equivalents become weights', () => {
    expect([COFID_STARCH, COFID_DISACCHARIDE]).toEqual([1.1, 1.05]);
    const base = { CHO: 4.6, STAR: 0, TOTSUG: 4.6, GLUC: 0, FRUCT: 0, GALACT: 0, SUCR: 0, MALT: 0, LACT: 4.6 };
    expect(cofidCarbs(base).carbs).toBeCloseTo(4.6 / 1.05, 10);
    expect(cofidCarbs(base).sugars).toBeCloseTo(4.6 / 1.05, 10);
    // Glucose and fructose are monosaccharides already; starch divides by 1.10; the rest by 1.05.
    const mixed = { CHO: 20, STAR: 11, TOTSUG: 8, GLUC: 3, FRUCT: 3, GALACT: 0, SUCR: 2.1, MALT: 0, LACT: 0 };
    expect(cofidCarbs(mixed).sugars).toBeCloseTo(3 + 3 + 2, 10);
    expect(cofidCarbs(mixed).carbs).toBeCloseTo(10 + 8 + 1 / 1.05, 10);
    // No starch value: the whole carbohydrate divides by 1.05, as the CoFID user guide says.
    expect(cofidCarbs({ ...mixed, STAR: null }).carbs).toBeCloseTo(20 / 1.05, 10);
    expect(cofidCarbs({ ...mixed, CHO: null }).carbs).toBeNull();
  });

  it('CoFID: trace is 0, N and blank are not reported', () => {
    expect(cofidValue('Tr', 'x')).toBe(0);
    expect(cofidValue('N', 'x')).toBeNull();
    expect(cofidValue('', 'x')).toBeNull();
    expect(cofidValue('2.5', 'x')).toBe(2.5);
    expect(() => cofidValue('n/a', 'x')).toThrow();
  });

  it('AFCD: aliases from "Also known as" and "Commonly called" sentences only', () => {
    expect(afcdAliases('Fruit with pink skin. Also known as Java Apple; Rose Apple; Makopa; Wax Apple.')).toEqual(['Java Apple', 'Rose Apple', 'Makopa', 'Wax Apple']);
    expect(afcdAliases('Peanuts roasted with oil. Commonly called Beer Nuts.')).toEqual(['Beer Nuts']);
    expect(afcdAliases('Small pellets (also known as seeds or pearls). Sometimes sold as Sago.')).toEqual([]);
  });
});

describe('build checks and deduplication', () => {
  const food = (p: Partial<BuiltFood>): BuiltFood => ({ id: 1, name: 'Food', kcal: 100, protein: 5, carbs: 10, fat: 4, satFat: 1, fibre: 1, sugars: 2, sodium: 50, alcohol: null, aliases: [], ...p });

  it('rejects impossible values', () => {
    expect(problems(food({}))).toEqual([]);
    expect(problems(food({ kcal: -1 }))).toContain('kcal invalid');
    expect(problems(food({ fat: 120 }))).toContain('fat over 100 g');
    expect(problems(food({ satFat: 9 }))).toContain('saturated fat above fat');
  });

  it('drops an SR Legacy food only for a Foundation twin that reports every value it reports', () => {
    const g = dedupe({
      Foundation: [food({ id: 10, ndb: '1', name: 'Egg, A' }), food({ id: 11, ndb: '2', name: 'Egg, B', sugars: null })],
      'SR Legacy': [food({ id: 20, ndb: '1', name: 'Egg, raw' }), food({ id: 21, ndb: '2', name: 'Egg, raw, b' })],
    });
    expect(g['SR Legacy'].map(f => f.id)).toEqual([21]);
  });

  it('keeps the first of two foods with the same name and values, with both alias lists', () => {
    const g = dedupe({
      Foundation: [],
      'SR Legacy': [food({ id: 1, name: 'Yeast extract spread' })],
      'Survey (FNDDS)': [food({ id: 2, name: 'Yeast extract spread', aliases: ['Vegemite'] }), food({ id: 3, name: 'Yeast extract spread', kcal: 101 })],
    });
    expect(g['Survey (FNDDS)'].map(f => f.id)).toEqual([3]);
    expect(g['SR Legacy'][0]!.aliases).toEqual(['Vegemite']);
  });
});

describe('search', () => {
  const top = (q: string, n = 5) => index.search(q, n);
  const names = (q: string, n = 5) => top(q, n).map(c => c.description);

  it('rice, white, cooked: cooked white rice first', () => {
    const r = top('rice, white, cooked');
    for (const c of r) expect(c.description).toMatch(/^Rice, white, cooked/);
    const picked = choose('rice, white, cooked', per100({ kcal: 130 }), r)!;
    expect(picked.description).toMatch(/^Rice, white, cooked/);
    expect(picked.per100.kcal).toBeGreaterThan(120);
    expect(picked.per100.kcal).toBeLessThan(140);
  });

  it('chicken adobo: the FNDDS adobo dishes first', () => {
    expect(names('chicken adobo', 2)).toEqual(['Adobo, with rice', 'Adobo, with noodles']);
  });

  it('vegemite: the AFCD Vegemite analysis and the USDA yeast extract spread', () => {
    const r = top('vegemite', 2);
    expect(r.map(c => c.sourceId).sort()).toEqual(['167717', 'F008785']);
    for (const c of r) expect(choose('vegemite', per100({ kcal: 170 }), [c])).not.toBeNull();
  });

  it('pandesal: the FNDDS hard white roll, found through "Pan de sal" written as one word', () => {
    const [c] = top('pandesal', 1);
    expect(c).toMatchObject({ sourceId: '2707655', dataType: 'Survey (FNDDS)', alias: 'Pan de sal', description: 'Roll, white, hard (Pan de sal)' });
    expect(top('pan de sal', 1)[0]!.sourceId).toBe('2707655');
  });

  it('egg, fried: fried whole eggs only', () => {
    for (const d of names('egg, fried', 5)) expect(d).toMatch(/^Egg, whole, (cooked, )?fried/);
    expect(choose('egg, fried', per100({ kcal: 190 }), top('egg, fried'))!.description).toMatch(/^Egg, whole/);
  });

  it('banana: raw bananas before banana-flavoured foods', () => {
    expect(names('banana', 2).sort()).toEqual(['Banana, raw', 'Bananas, raw']);
    expect(choose('banana', per100({ kcal: 90 }), top('banana'))!.description).toMatch(/^Bananas?, raw$/);
  });

  it('milk tea: bubble tea, which FNDDS also calls milk tea, then tea with milk', () => {
    expect(names('milk tea', 2)).toEqual(['Tea, bubble (milk tea)', 'Tea, hot, with milk']);
  });

  it('flat white: the AFCD coffee, where the two words stand together, before a white flat bread', () => {
    expect(top('flat white', 1)[0]!.description).toMatch(/^Coffee, flat white/);
  });

  it('makopa: the AFCD wax jambu', () => {
    expect(top('makopa', 1)[0]).toMatchObject({ sourceId: 'F009534', dataType: 'AFCD', description: 'Wax jambu, raw (Makopa)' });
  });

  it('returns nothing for a dish no source covers, and for an empty query', () => {
    expect(top('sinigang')).toEqual([]);
    expect(top('  ,  ')).toEqual([]);
  });

  it('finds words typed in part', () => {
    expect(names('spaghet', 3).every(d => /spaghetti/i.test(d))).toBe(true);
  });

  it('ranks a food named by the query above a shorter-named one that only lists it as an alias', () => {
    const tiny = new FoodIndex([{ ...tables[0]!, groups: [{ dataType: 'SR Legacy', foods: [
      [1, 'Daiquiri', 100, 0, 10, 0, null, null, null, null, null, ['banana']],
      [2, 'Banana, raw', 89, 1, 20, 0, null, null, null, null],
    ] }] }]);
    expect(tiny.search('banana').map(c => [c.fdcId, c.description])).toEqual([[2, 'Banana, raw'], [1, 'Daiquiri (banana)']]);
  });

  it('bread, white: breads before dishes whose aliases merely mention bread', () => {
    // FNDDS lists "bread, nfs" as an additional description of "Hamburger, on white bun, ...".
    expect(names('bread, white', 6).every(d => d.startsWith('Bread'))).toBe(true);
  });

  it('returns candidates choose() accepts: ranked, with all eight nutrients and the missing ones named', () => {
    const r = top('bread, white', 8);
    expect(r.map(c => c.rank)).toEqual(r.map((_, i) => i));
    for (const c of r) {
      expect(Object.keys(c.per100).sort()).toEqual([...NUTRIENT_KEYS].sort());
      for (const k of c.missing) expect(c.per100[k]).toBe(0);
    }
    const cofid = r.find(c => c.sourceId === '11-1145')!;
    expect(cofid).toMatchObject({ source: 'cofid', dataType: 'CoFID', missing: ['satFat'], fdcId: numericId('cofid', '11-1145') });
    expect(choose('bread, white', per100({ kcal: 250 }), r)).not.toBeNull();
  });

  it('withEstimate fills only the nutrients the source does not report', () => {
    const est = per100({ kcal: 240, protein: 8, carbs: 45, fat: 3, satFat: 0.7, fibre: 2, sugars: 3, sodium: 450 });
    const c = { per100: per100({ kcal: 236, protein: 8.7, carbs: 44.49, fat: 2.1, satFat: 0, fibre: 2.9, sugars: 2.86, sodium: 400 }), missing: ['satFat' as const] };
    expect(withEstimate(c, est)).toEqual({ ...c.per100, satFat: 0.7 });
  });
});

describe('searchLocal', () => {
  afterEach(() => { resetFoods(); vi.unstubAllGlobals(); });

  it('fetches each table once, same origin, and keeps the index for later searches', async () => {
    const fetchMock = vi.fn(async (path: string) => new Response(text(path), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const a: LocalCandidate[] = await searchLocal('vegemite', 3);
    const b = await searchLocal('banana', 3);
    expect(fetchMock.mock.calls.map(c => c[0]).sort()).toEqual([...FOOD_FILES].sort());
    for (const [p] of fetchMock.mock.calls) expect(p).toMatch(/^data\/foods-[a-z]+\.[0-9a-f]{10}\.json$/);
    expect(a[0]!.description).toBe('Yeast extract spread (Vegemite)');
    expect(b.length).toBe(3);
  });

  it('tries again after a failed load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(searchLocal('banana')).rejects.toThrow(/status 503/);
    vi.stubGlobal('fetch', vi.fn(async (path: string) => new Response(text(path), { status: 200 })));
    expect((await searchLocal('banana', 1)).length).toBe(1);
  });

  it('refuses a table in an unknown shape', () => {
    expect(() => checkTable({ schema: 2, groups: [] })).toThrow();
    const t = JSON.parse(text(FOOD_FILES[1]!)) as FoodTable;
    expect(() => checkTable({ ...t, fields: [...t.fields].reverse() })).toThrow();
    const r: FoodRow = ['F1', 'x', 1, 0, 0, 0, null, null, null, null];
    expect(new FoodIndex([{ ...t, groups: [{ dataType: 'AFCD', foods: [r] }] }]).foods[0]!.missing).toEqual(['satFat', 'fibre', 'sugars', 'sodium']);
  });
});
