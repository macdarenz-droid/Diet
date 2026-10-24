// Grounding: matching Claude's items to the offline food tables (docs/FOOD-DATA.md).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MIN_COVER, applyCandidate, choose, energyFits, nameScore, stem, tokens } from '@/nutrition/ground';
import { LOOKUPS_MAX, cleanQuery, groundAll } from '@/nutrition/lookup';
import { ALIAS_COVER, FOOD_FILES, FoodIndex, checkTable } from '@/nutrition/foods';
import type { Candidate } from '@/nutrition/candidate';
import { item, per100 } from './helpers';

// The shipped tables, read from disk the way the app fetches them.
const index = new FoodIndex(FOOD_FILES.map(f => checkTable(JSON.parse(readFileSync(`public/${f}`, 'utf8')))));
const search = async (q: string) => index.search(q, 12);
const cand = (description: string, kcal: number, rank = 0): Candidate => ({ fdcId: rank + 1, description, dataType: 'SR Legacy', per100: per100({ kcal, protein: 1, carbs: 1, fat: 1 }), rank });

describe('name matching', () => {
  it('normalises plurals and drops filler words', () => {
    expect(tokens('Eggs, fried, with butter')).toEqual(['egg', 'fried', 'butter']);
  });
  it('scores the share of query words found', () => {
    expect(nameScore('rice, fried', 'Rice, fried, meatless')).toBeCloseTo(1.15);
    expect(nameScore('rice, fried', 'Bread, white')).toBe(0);
  });
});

describe('plurals', () => {
  it.each([['tomatoes', 'tomato'], ['potatoes', 'potato'], ['mangoes', 'mango'], ['berries', 'berry'], ['eggs', 'egg'], ['hummus', 'hummus'], ['glass', 'glass'], ['peas', 'pea']])('%s → %s', (a, b) => {
    expect(stem(a)).toBe(b);
  });
  it('matches singular names to plural table names', () => {
    expect(nameScore('tomato, raw', 'Tomatoes, red, ripe, raw')).toBeGreaterThanOrEqual(1);
    expect(nameScore('potato, baked', 'Potatoes, baked, flesh and skin')).toBeGreaterThanOrEqual(1);
  });
});

describe('energy check', () => {
  it('accepts within 60% and rejects beyond', () => {
    expect(energyFits(174, 180)).toBe(true);
    expect(energyFits(280, 180)).toBe(true);
    expect(energyFits(300, 180)).toBe(false);
    expect(energyFits(60, 180)).toBe(false);
  });
  it('compares low-energy foods in absolute terms', () => {
    expect(energyFits(2, 15)).toBe(true);
    expect(energyFits(45, 5)).toBe(false);
  });
});

describe('choose, on the shipped tables', () => {
  it.each([
    ['rice, white, cooked', 130, /rice/i],
    ['rice, fried', 180, /rice/i],
    ['egg, fried', 196, /egg/i],
    ['banana', 89, /banana/i],
    ['tomato, raw', 18, /tomato/i],
    ['pandesal', 290, /pan de sal|pandesal/i],
    ['chicken adobo', 190, /adobo/i],
  ] as const)('%s at %i kcal per 100 g', async (q, kcal, want) => {
    const c = choose(q, per100({ kcal }), await search(q));
    expect(c?.description).toMatch(want);
  });

  it('keeps the estimate when every candidate is far off in energy', async () => {
    expect(choose('rice, white, cooked', per100({ kcal: 600 }), await search('rice, white, cooked'))).toBeNull();
  });

  it.each([
    ['tofu', 76, /tofu|soybean curd/i, /yogurt/i],
    ['oats, cooked', 70, /oats/i, /bran/i],
    ['beef mince, cooked', 250, /beef, mince/i, /\braw\b/i],
    ['chicken thigh, roasted, with skin', 230, /thigh/i, /^$/],
  ] as const)('%s matches the food itself, cooked as asked', async (q, kcal, want, not) => {
    const c = choose(q, per100({ kcal }), await search(q));
    expect(c?.description).toMatch(want);
    expect(c!.description.replace(/from raw/i, '')).not.toMatch(not);
  });

  it('rejects a compound naming another food, and raw for cooked', () => {
    expect(choose('tofu', per100({ kcal: 76 }), [cand('Tofu yogurt', 90)])).toBeNull();
    expect(choose('toast', per100({ kcal: 290 }), [cand('French toast, NFS', 230)])).toBeNull();
    expect(choose('rice, white, cooked', per100({ kcal: 130 }), [cand('Rice, white, raw', 160)])).toBeNull();
    expect(choose('carrot, raw', per100({ kcal: 41 }), [cand('Carrots, boiled', 35)])).toBeNull();
    expect(choose('chicken thigh, roasted', per100({ kcal: 230 }), [cand('Chicken thigh, roasted, from raw', 230)])?.description).toBe('Chicken thigh, roasted, from raw');
  });

  it('keeps the estimate when nothing shares the name', async () => {
    expect(choose('sinigang', per100({ kcal: 40 }), await search('sinigang'))).toBeNull();
  });

  it('prefers the closer energy among good name matches', () => {
    const c = [cand('Chicken thigh, roasted', 280, 0), cand('Chicken thigh, roasted, skin', 230, 1)];
    expect(choose('chicken thigh, roasted', per100({ kcal: 225 }), c)?.description).toBe('Chicken thigh, roasted, skin');
  });
});

// Red team on 9d4f16a: the top search result always read as a full name match, so one shared word
// was enough and only the energy check stood in the way.
describe('choose rejects foods that only share a word', () => {
  it.each([
    ['acai bowl', 120], // was Ramen bowl, NFS
    ['hot chips', 250], // was Pancakes, chocolate (hot cakes)
    ['butter chicken', 120], // the AFCD sauce for it
    ['butter chicken', 150], // was Chicken, liver, fried, added butter
    ['butter chicken', 200],
    ['chicken salt', 200], // was chicken luncheon meat, through its alias "no salt added"
  ] as const)('%s at %i kcal per 100 g keeps the estimate', async (q, kcal) => {
    expect(choose(q, per100({ kcal }), await search(q))).toBeNull();
  });

  it.each([220, 250, 280])('meat pie at %i kcal per 100 g: a savoury meat pie, not an empanada that lists the name', async kcal => {
    expect(choose('meat pie', per100({ kcal }), await search('meat pie'))?.description).toMatch(/^Pie, savoury, meat/);
  });

  it('weighs rare words more: "adobo" carries "chicken adobo", "bowl" does not carry "acai bowl"', async () => {
    const adobo = (await search('chicken adobo')).find(c => c.description === 'Adobo, with rice')!;
    expect(adobo.cover).toBeGreaterThanOrEqual(MIN_COVER);
    const ramen = (await search('acai bowl')).find(c => c.description === 'Ramen bowl, NFS')!;
    expect(ramen.cover).toBeLessThan(MIN_COVER);
  });

  const tiny = (...foods: [string, string[]?][]) => new FoodIndex([{ ...checkTable(JSON.parse(readFileSync(`public/${FOOD_FILES[0]}`, 'utf8'))), groups: [{ dataType: 'Survey (FNDDS)', foods: foods.map(([name, aliases], i) => [i + 1, name, 150, 10, 10, 8, null, null, null, null, null, aliases ?? null]) }] }]);
  const coverOf = (index: FoodIndex, q: string) => index.search(q, 5)[0]?.cover ?? 0;

  it('does not count a word the name gives as added, missing or left open', () => {
    expect(coverOf(tiny(['Chicken, liver, fried, added butter']), 'butter chicken')).toBeLessThan(MIN_COVER);
    expect(coverOf(tiny(['Pot pie, no meat']), 'meat pie')).toBeLessThan(MIN_COVER);
    expect(coverOf(tiny(['Pot pie, chicken (NS as to meat)']), 'meat pie')).toBeLessThan(MIN_COVER);
    expect(coverOf(tiny(['Beverage base, added vitamins (Milo)']), 'milo')).toBe(1);
    expect(coverOf(tiny(['Non-dairy milk']), 'milk')).toBe(1);
    expect(coverOf(tiny(['Chicken, liver, fried, added butter']), 'chicken liver, fried, added butter')).toBe(1);
  });

  it('does not add up a word in the name and a word in an alias', () => {
    expect(coverOf(tiny(['Chicken, luncheon meat', ['low salt', 'lean']]), 'chicken salt')).toBeLessThan(MIN_COVER);
    expect(coverOf(tiny(['Roll, white, hard', ['Pan de sal']]), 'pandesal')).toBeGreaterThanOrEqual(MIN_COVER);
  });

  it('counts a match through an alias for less than one through the name', () => {
    const index = tiny(['Empanada, beef', ['meat pie']], ['Pie, savoury, meat']);
    const [a, b] = ['Empanada, beef (meat pie)', 'Pie, savoury, meat'].map(d => index.search('meat pie', 5).find(c => c.description === d)!);
    expect(b!.cover).toBe(1);
    expect(a!.cover).toBe(ALIAS_COVER);
    expect(ALIAS_COVER).toBeLessThan(1);
  });

  it('rejects a product made from the food or a stand-in for it, unless the query names it', () => {
    const full = (description: string, kcal = 150) => ({ ...cand(description, kcal), cover: 1 });
    expect(choose('butter chicken', per100({ kcal: 150 }), [full('Sauce, butter chicken, commercial', 100)])).toBeNull();
    expect(choose('caesar salad', per100({ kcal: 150 }), [full('Salad dressing, caesar, fat-free', 130)])).toBeNull();
    expect(choose('orange', per100({ kcal: 47 }), [full('Orange juice, 100%', 45)])).toBeNull();
    expect(choose('chicken, fried', per100({ kcal: 250 }), [full('Chicken, meatless, breaded, fried', 234)])).toBeNull();
    expect(choose('hot dog', per100({ kcal: 250 }), [full('Hot dog, vegetarian', 233)])).toBeNull();
    expect(choose('crab', per100({ kcal: 90 }), [full('Crab, imitation', 95)])).toBeNull();
    expect(choose('soy sauce', per100({ kcal: 53 }), [full('Sauce, soy', 53)])).not.toBeNull();
    expect(choose('orange juice', per100({ kcal: 45 }), [full('Orange juice, 100%', 45)])).not.toBeNull();
    expect(choose('sausage, meatless', per100({ kcal: 250 }), [full('Sausage, meatless', 255)])).not.toBeNull();
    expect(choose('spaghetti', per100({ kcal: 120 }), [full('Spaghetti with tomato sauce', 120)])).not.toBeNull();
    expect(choose('cheese quiche', per100({ kcal: 350 }), [full('Cheese quiche, meatless', 365)])).not.toBeNull();
  });

  it('holds plain candidates to the same floor', () => {
    expect(choose('acai bowl', per100({ kcal: 120 }), [cand('Ramen bowl', 127)])).toBeNull();
  });
});

describe('applyCandidate', () => {
  it('never replaces label values', () => {
    const it0 = item({ source: 'label' });
    expect(applyCandidate(it0, cand('Food', 200))).toBe(it0);
  });
  it('marks database matches and falls back to the estimate', () => {
    const it0 = item();
    expect(applyCandidate(it0, cand('Food', 210, 4))).toMatchObject({ source: 'database', food: { id: 5, description: 'Food', dataset: 'SR Legacy' } });
    expect(applyCandidate({ ...it0, source: 'database' }, null)).toMatchObject({ source: 'estimate', per100: it0.estimate });
  });
  it('fills what the source does not report from the estimate', () => {
    const it0 = item({ per100: per100({ kcal: 200, protein: 10, carbs: 20, fat: 8, sodium: 900, satFat: 3 }) });
    const g = applyCandidate(it0, { ...cand('Food, cooked', 210), missing: ['sodium', 'satFat'] });
    expect(g.per100.sodium).toBe(900);
    expect(g.per100.satFat).toBe(3);
    expect(g.per100.kcal).toBe(210);
  });
});

describe('groundAll', () => {
  const fried = item({ name: 'Fried rice', query: 'rice, fried', per100: per100({ kcal: 185, protein: 4, carbs: 30, fat: 5 }) });

  it('searches each distinct name once and grounds every list', async () => {
    const calls: string[] = [];
    const r = await groundAll([[fried, fried], [fried]], { search: async q => { calls.push(q); return search(q); } });
    expect(calls).toEqual(['rice, fried']);
    expect(r.status).toBe('done');
    expect(r.value.flat().every(i => i.source === 'database')).toBe(true);
  });

  it('keeps estimates and says so when the tables cannot load', async () => {
    const r = await groundAll([[fried]], { search: async () => { throw new Error('offline'); } });
    expect(r.status).toBe('unavailable');
    expect(r.value[0]![0]!.source).toBe('estimate');
  });

  // Red team on 9d4f16a: the searches ran as one long task, so nothing painted and Back did nothing.
  const three = ['rice, fried', 'egg, fried', 'banana'].map(query => item({ query }));

  it('runs each search in a task of its own, so the page paints and handles input in between', async () => {
    let ticks = 0;
    const seen: number[] = [];
    await groundAll([three], { search: async q => { seen.push(ticks); setTimeout(() => { ticks++; }, 0); return search(q); } });
    expect(seen).toEqual([0, 1, 2]);
  });

  it('stops searching when the scan is cancelled between two searches', async () => {
    const ctrl = new AbortController();
    const seen: string[] = [];
    await groundAll([three], { signal: ctrl.signal, search: async q => { seen.push(q); setTimeout(() => ctrl.abort(), 0); return search(q); } });
    expect(seen).toEqual(['rice, fried']);
  });

  it('leaves label items untouched and does not search for them', async () => {
    const label = item({ source: 'label', query: 'muesli bar' });
    const seen: string[] = [];
    const r = await groundAll([[label]], { search: async q => { seen.push(q); return []; } });
    expect(seen).toEqual([]);
    expect(r.value[0]![0]).toBe(label);
  });
});

describe('lookup limits', () => {
  it('cleans model-chosen search names', () => {
    expect(cleanQuery('chicken"><img src=x onerror=1> thigh')).toBe('chicken img src x onerror 1 thigh');
    expect(cleanQuery("Rice, Fried (with egg) — Mum's")).toBe("rice, fried (with egg) mum's");
    expect(cleanQuery('x'.repeat(200))).toHaveLength(60);
  });

  it(`makes at most ${LOOKUPS_MAX} distinct lookups per scan, meal items first`, async () => {
    const seen: string[] = [];
    const many = Array.from({ length: 60 }, (_, i) => item({ name: `Food ${i}`, query: `food number ${i}` }));
    await groundAll([[many[0]!], many.slice(1)], { search: async q => { seen.push(q); return []; } });
    expect(seen).toHaveLength(LOOKUPS_MAX);
    expect(seen).toContain('food number 0');
  });
});
