// Grounding: matching Claude's items to the offline food tables (docs/FOOD-DATA.md).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyCandidate, choose, energyFits, nameScore, stem, tokens } from '@/nutrition/ground';
import { LOOKUPS_MAX, cleanQuery, groundAll } from '@/nutrition/lookup';
import { FOOD_FILES, FoodIndex, checkTable } from '@/nutrition/foods';
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

  it('keeps the estimate when nothing shares the name', async () => {
    expect(choose('sinigang', per100({ kcal: 40 }), await search('sinigang'))).toBeNull();
  });

  it('prefers the closer energy among good name matches', () => {
    const c = [cand('Chicken thigh, roasted', 280, 0), cand('Chicken thigh, roasted, skin', 230, 1)];
    expect(choose('chicken thigh, roasted', per100({ kcal: 225 }), c)?.description).toBe('Chicken thigh, roasted, skin');
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
