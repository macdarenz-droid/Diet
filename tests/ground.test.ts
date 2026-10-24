import { describe, expect, it } from 'vitest';
import { applyCandidate, choose, energyFits, nameScore, tokens } from '@/nutrition/ground';
import { groundAll, type Cache } from '@/nutrition/lookup';
import { FdcError, parseSearch, type Candidate } from '@/nutrition/fdc';
import fixture from './fixtures/fdc-fried-rice.json';
import { item, per100 } from './helpers';

const candidates = parseSearch(fixture);
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

describe('choose', () => {
  it('picks the real fried-rice entry for a fried-rice estimate', () => {
    expect(choose('rice, fried', per100({ kcal: 185 }), candidates)?.fdcId).toBe(2708951);
  });
  it('keeps the estimate when every candidate is far off in energy', () => {
    expect(choose('rice, fried', per100({ kcal: 450 }), candidates)).toBeNull();
  });
  it('keeps the estimate when names do not match', () => {
    expect(choose('chicken adobo', per100({ kcal: 180 }), candidates)).toBeNull();
  });
  it('prefers the closer energy among good name matches', () => {
    const c = [cand('Chicken thigh, roasted', 280, 0), cand('Chicken thigh, roasted, skin', 230, 1)];
    expect(choose('chicken thigh, roasted', per100({ kcal: 225 }), c)?.description).toBe('Chicken thigh, roasted, skin');
  });
});

describe('applyCandidate', () => {
  it('never replaces label values', () => {
    const it0 = item({ source: 'label' });
    expect(applyCandidate(it0, candidates[0]!)).toBe(it0);
  });
  it('marks USDA matches and falls back to the estimate', () => {
    const it0 = item();
    expect(applyCandidate(it0, candidates[0]!)).toMatchObject({ source: 'usda', usda: { fdcId: 2708951 } });
    expect(applyCandidate({ ...it0, source: 'usda', per100: candidates[0]!.per100 }, null)).toMatchObject({ source: 'estimate', per100: it0.estimate });
  });
});

function memoryCache(seed: Record<string, Candidate[]> = {}): Cache & { store: Map<string, Candidate[]> } {
  const store = new Map(Object.entries(seed));
  return { store, get: q => store.get(q), set: (q, c) => { store.set(q, c); } };
}

describe('groundAll', () => {
  const fried = item({ name: 'Fried rice', query: 'rice, fried', per100: per100({ kcal: 185, protein: 4, carbs: 30, fat: 5 }) });

  it('searches each distinct query once and caches it', async () => {
    const calls: string[] = [];
    const cache = memoryCache();
    const r = await groundAll([[fried, fried], [fried]], { key: 'K', cache, search: async q => { calls.push(q); return candidates; } });
    expect(calls).toEqual(['rice, fried']);
    expect(cache.store.has('rice, fried')).toBe(true);
    expect(r.status).toBe('done');
    expect(r.value.flat().every(i => i.source === 'usda')).toBe(true);
  });

  it('uses the cache without a request', async () => {
    let called = false;
    const r = await groundAll([[fried]], { key: 'K', cache: memoryCache({ 'rice, fried': candidates }), search: async () => { called = true; return []; } });
    expect(called).toBe(false);
    expect(r.value[0]![0]!.source).toBe('usda');
  });

  it('stops on a rate limit and leaves estimates', async () => {
    const other = item({ name: 'Egg', query: 'egg, fried', per100: per100({ kcal: 196 }) });
    let n = 0;
    const r = await groundAll([[fried, other]], { key: 'K', cache: memoryCache(), search: async () => { n++; throw new FdcError('rate', 'limit'); } });
    expect(r.status).toBe('rate');
    expect(r.value[0]!.every(i => i.source === 'estimate')).toBe(true);
    expect(n).toBeLessThanOrEqual(2);
  });

  it('reports no-key and never searches without a key', async () => {
    let called = false;
    const r = await groundAll([[fried]], { key: '', cache: memoryCache(), search: async () => { called = true; return candidates; } });
    expect(called).toBe(false);
    expect(r.status).toBe('no-key');
    expect(r.value[0]![0]!.source).toBe('estimate');
  });

  it('leaves label items untouched and does not search for them', async () => {
    const label = item({ source: 'label', query: 'muesli bar' });
    const seen: string[] = [];
    const r = await groundAll([[label]], { key: 'K', cache: memoryCache(), search: async q => { seen.push(q); return []; } });
    expect(seen).toEqual([]);
    expect(r.value[0]![0]).toBe(label);
  });
});
