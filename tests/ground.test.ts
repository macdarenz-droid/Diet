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

// Review of dcfa404: plurals and nutrients a source does not report.
import { stem } from '@/nutrition/ground';

describe('plurals', () => {
  it.each([['tomatoes', 'tomato'], ['potatoes', 'potato'], ['mangoes', 'mango'], ['berries', 'berry'], ['eggs', 'egg'], ['hummus', 'hummus'], ['glass', 'glass'], ['peas', 'pea']])('%s → %s', (a, b) => {
    expect(stem(a)).toBe(b);
  });
  it('matches singular queries to plural USDA names', () => {
    expect(nameScore('tomato, raw', 'Tomatoes, red, ripe, raw')).toBeGreaterThanOrEqual(1);
    expect(nameScore('potato, baked', 'Potatoes, baked, flesh and skin')).toBeGreaterThanOrEqual(1);
    expect(nameScore('mango', 'Mangos, raw')).toBeGreaterThanOrEqual(1);
  });
});

describe('missing nutrients', () => {
  it('fills what the source does not report from the estimate', () => {
    const it0 = item({ per100: per100({ kcal: 200, protein: 10, carbs: 20, fat: 8, sodium: 900, satFat: 3 }) });
    const c: Candidate = { ...cand('Food, cooked', 210), missing: ['sodium', 'satFat'] };
    const g = applyCandidate(it0, c);
    expect(g.source).toBe('usda');
    expect(g.per100.sodium).toBe(900);
    expect(g.per100.satFat).toBe(3);
    expect(g.per100.kcal).toBe(210);
  });
});

describe('cache and status', () => {
  it('caches every candidate so a cached rescan grounds the same way', async () => {
    const many: Candidate[] = Array.from({ length: 10 }, (_, i) => cand(`Rice, fried, variant ${i}`, i === 9 ? 185 : 600, i));
    const store: Record<string, string> = {};
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: () => {} };
    try {
      const { localCache } = await import('@/nutrition/lookup');
      const fried = item({ query: 'rice, fried', per100: per100({ kcal: 190, protein: 4, carbs: 30, fat: 5 }) });
      const first = await groundAll([[fried]], { key: 'K', cache: localCache(), search: async () => many });
      const again = await groundAll([[fried]], { key: '', cache: localCache(), search: async () => { throw new Error('should not search'); } });
      expect(first.value[0]![0]!.usda?.description).toBe('Rice, fried, variant 9');
      expect(again.value[0]![0]!.usda?.description).toBe('Rice, fried, variant 9');
      expect(again.status).toBe('done');
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

// Red team (security) on dcfa404: lookups a photo can trigger, and what stays on the device.
import { CACHE_MAX, LOOKUPS_MAX, PREFIX, cleanQuery, clearLookupCache } from '@/nutrition/lookup';

describe('lookup limits', () => {
  it('cleans model-chosen search names', () => {
    expect(cleanQuery('chicken"><img src=x onerror=1> thigh')).toBe('chicken img src x onerror 1 thigh');
    expect(cleanQuery("Rice, Fried (with egg) — Mum's")).toBe("rice, fried (with egg) mum's");
    expect(cleanQuery('x'.repeat(200))).toHaveLength(60);
  });

  it(`makes at most ${LOOKUPS_MAX} distinct lookups per scan, meal items first`, async () => {
    const seen: string[] = [];
    const many = Array.from({ length: 60 }, (_, i) => item({ name: `Food ${i}`, query: `food number ${i}` }));
    await groundAll([[many[0]!], many.slice(1)], { key: 'K', cache: memoryCache(), search: async q => { seen.push(q); return []; } });
    expect(seen).toHaveLength(LOOKUPS_MAX);
    expect(seen).toContain('food number 0');
  });

  it('expires and bounds the cache, and clears it', async () => {
    const store: Record<string, string> = {};
    const ls = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
    (globalThis as { localStorage?: unknown }).localStorage = new Proxy(ls, { ownKeys: () => Object.keys(store), getOwnPropertyDescriptor: (_t, k) => (k in store ? { enumerable: true, configurable: true, value: store[k as string] } : undefined) });
    try {
      const { localCache } = await import('@/nutrition/lookup');
      let t = 0;
      const cache = localCache(() => t);
      for (let i = 0; i < CACHE_MAX + 20; i++) { t = i; cache.set(`q${i}`, []); }
      const kept = Object.keys(store).filter(k => k.startsWith(PREFIX));
      expect(kept).toHaveLength(CACHE_MAX);
      expect(kept).not.toContain(`${PREFIX}q0`);
      t = 40 * 24 * 60 * 60 * 1000;
      expect(cache.get(`q${CACHE_MAX + 19}`)).toBeUndefined();
      expect(store[`${PREFIX}q${CACHE_MAX + 19}`]).toBeUndefined();
      clearLookupCache();
      expect(Object.keys(store).filter(k => k.startsWith(PREFIX))).toHaveLength(0);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

// Red team (failure paths) on dcfa404: grounding always finishes.
import { GROUND_BUDGET_MS } from '@/nutrition/lookup';
import { vi } from 'vitest';

describe('grounding budget', () => {
  it('finishes with estimates when USDA hangs', async () => {
    vi.useFakeTimers();
    try {
      const fried = item({ query: 'rice, fried' });
      const run = groundAll([[fried]], { key: 'K', cache: memoryCache(), search: () => new Promise(() => {}) });
      await vi.advanceTimersByTimeAsync(GROUND_BUDGET_MS + 10);
      const r = await run;
      expect(r.status).toBe('offline');
      expect(r.value[0]![0]!.source).toBe('estimate');
    } finally {
      vi.useRealTimers();
    }
  });
});
