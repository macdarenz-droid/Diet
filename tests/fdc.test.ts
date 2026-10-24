import { describe, expect, it, vi } from 'vitest';
import { FdcError, parseFood, parseSearch, search, searchUrl } from '@/nutrition/fdc';
import fixture from './fixtures/fdc-fried-rice.json';

describe('parsing a real USDA search response', () => {
  const c = parseSearch(fixture);

  it('reads every food with its per-100 g values', () => {
    expect(c).toHaveLength(3);
    expect(c[0]).toMatchObject({ fdcId: 2708951, description: 'Rice, fried, meatless', dataType: 'Survey (FNDDS)', rank: 0 });
    expect(c[0]!.per100).toEqual({ kcal: 174, protein: 3.84, carbs: 32.5, fat: 3.19, satFat: 0.493, fibre: 1.1, sugars: 0.62, sodium: 361 });
  });

  it('keeps the search order as rank', () => {
    expect(c.map(x => x.rank)).toEqual([0, 1, 2]);
  });
});

describe('parseFood', () => {
  const n = (nutrientId: number, value: number, unitName: string) => ({ nutrientId, value, unitName });

  it('falls back to Atwater energy ids, then to computed energy', () => {
    expect(parseFood({ fdcId: 1, description: 'x', foodNutrients: [n(2047, 120, 'KCAL'), n(1003, 1, 'G'), n(1004, 1, 'G'), n(1005, 1, 'G')] })!.kcal).toBe(120);
    expect(parseFood({ fdcId: 1, description: 'x', foodNutrients: [n(1003, 10, 'G'), n(1004, 10, 'G'), n(1005, 10, 'G')] })!.kcal).toBe(170);
  });

  it('converts kJ energy and gram sodium', () => {
    const f = parseFood({ fdcId: 1, description: 'x', foodNutrients: [n(1008, 418.4, 'kJ'), n(1003, 1, 'G'), n(1004, 1, 'G'), n(1005, 1, 'G'), n(1093, 0.5, 'G')] })!;
    expect(f.kcal).toBeCloseTo(100);
    expect(f.sodium).toBe(500);
  });

  it('rejects a food missing protein, fat or carbohydrate', () => {
    expect(parseFood({ fdcId: 1, description: 'x', foodNutrients: [n(1008, 100, 'KCAL'), n(1003, 1, 'G')] })).toBeNull();
  });

  it('uses NLEA sugars when total sugars are absent', () => {
    expect(parseFood({ fdcId: 1, description: 'x', foodNutrients: [n(1003, 1, 'G'), n(1004, 1, 'G'), n(1005, 1, 'G'), n(1063, 4.2, 'G')] })!.sugars).toBe(4.2);
  });
});

describe('search', () => {
  it('builds the query with the three generic data types', () => {
    const u = new URL(searchUrl('rice, fried', 'KEY'));
    expect(u.origin + u.pathname).toBe('https://api.nal.usda.gov/fdc/v1/foods/search');
    expect(u.searchParams.get('dataType')).toBe('Foundation,SR Legacy,Survey (FNDDS)');
    expect(u.searchParams.get('query')).toBe('rice, fried');
    expect(u.searchParams.get('api_key')).toBe('KEY');
  });

  it.each([[429, 'rate'], [403, 'auth'], [401, 'auth'], [500, 'server']] as const)('maps status %i to %s', async (status, kind) => {
    const f = vi.fn().mockResolvedValue(new Response('{}', { status }));
    await expect(search('rice', 'K', undefined, f)).rejects.toMatchObject({ kind });
  });

  it('maps a failed fetch to network', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const e = await search('rice', 'K', undefined, f).catch(x => x);
    expect(e).toBeInstanceOf(FdcError);
    expect(e.kind).toBe('network');
  });

  it('parses a good response', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));
    expect(await search('fried rice', 'K', undefined, f)).toHaveLength(3);
  });
});
