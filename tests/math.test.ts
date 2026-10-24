import { describe, expect, it } from 'vitest';
import { add, atwater, deltaKeys, isBetter, macroSplit, range, rankSwaps, scale, sub, swapScore, totals } from '@/nutrition/math';
import type { Swap } from '@/core/models';
import { item, per100 } from './helpers';

describe('scale and totals', () => {
  it('scales per-100 g values by weight', () => {
    expect(scale(per100({ kcal: 174, protein: 3.84 }), 250)).toMatchObject({ kcal: 435, protein: 9.6 });
  });
  it('treats negative grams as zero', () => {
    expect(scale(per100({ kcal: 100 }), -50).kcal).toBe(0);
  });
  it('sums items and builds a low-mid-high range from the gram ranges', () => {
    const items = [item({ grams: 200, gramsLow: 150, gramsHigh: 260 }), item({ grams: 50, gramsLow: 50, gramsHigh: 50, per100: per100({ kcal: 884, fat: 100 }) })];
    expect(totals(items).kcal).toBeCloseTo(400 + 442);
    const r = range(items);
    expect(r.low.kcal).toBeCloseTo(300 + 442);
    expect(r.high.kcal).toBeCloseTo(520 + 442);
    expect(r.mid.kcal).toBeCloseTo(totals(items).kcal);
  });
  it('adds and subtracts every nutrient', () => {
    const a = per100({ kcal: 10, sodium: 5 });
    const b = per100({ kcal: 3, sodium: 1 });
    expect(add(a, b)).toMatchObject({ kcal: 13, sodium: 6 });
    expect(sub(a, b)).toMatchObject({ kcal: 7, sodium: 4 });
  });
});

describe('energy split', () => {
  it('uses Atwater factors and sums to 1', () => {
    const s = macroSplit(per100({ protein: 25, carbs: 50, fat: 10 }));
    expect(s.protein).toBeCloseTo(100 / 390);
    expect(s.carbs).toBeCloseTo(200 / 390);
    expect(s.fat).toBeCloseTo(90 / 390);
    expect(s.protein + s.carbs + s.fat).toBeCloseTo(1);
  });
  it('is all zero with no energy', () => {
    expect(macroSplit(per100())).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });
  it('computes Atwater energy', () => {
    expect(atwater({ protein: 10, carbs: 10, fat: 10 })).toBe(170);
  });
});

const swap = (id: string, n: Partial<ReturnType<typeof per100>>, match: Swap['match'] = 'similar'): Swap => ({
  id, title: id, why: '', kind: 'dish', keeps: [], match, effort: 'low', items: [item({ grams: 100, per100: per100(n) })],
});

describe('swap ranking', () => {
  const original = per100({ kcal: 800, protein: 30, sugars: 40, satFat: 12, sodium: 1500, fibre: 4 });
  const lowEnergy = swap('lowEnergy', { kcal: 450, protein: 28, sugars: 35, satFat: 10, sodium: 1400, fibre: 4 });
  const highProtein = swap('highProtein', { kcal: 780, protein: 60, sugars: 38, satFat: 12, sodium: 1500, fibre: 4 });
  const lowSugar = swap('lowSugar', { kcal: 760, protein: 30, sugars: 8, satFat: 12, sodium: 1500, fibre: 6 });
  const heart = swap('heart', { kcal: 780, protein: 30, sugars: 40, satFat: 3, sodium: 600, fibre: 6 });
  const all = [highProtein, lowSugar, heart, lowEnergy];

  it.each([
    ['lose', 'lowEnergy'],
    ['muscle', 'highProtein'],
    ['sugar', 'lowSugar'],
    ['heart', 'heart'],
  ] as const)('puts the best swap for %s first', (goal, first) => {
    expect(rankSwaps(original, all, goal)[0]!.id).toBe(first);
  });

  it('prefers a closer match when the numbers are equal', () => {
    const a = swap('a', { kcal: 500 }, 'loose');
    const b = swap('b', { kcal: 500 }, 'close');
    expect(rankSwaps(per100({ kcal: 800 }), [a, b], 'lose').map(s => s.id)).toEqual(['b', 'a']);
  });

  it('scores an improvement above zero and a worse option below', () => {
    expect(swapScore(original, per100({ ...original, kcal: 600 }), 'lose', 'loose')).toBeGreaterThan(0);
    expect(swapScore(original, per100({ ...original, kcal: 1000 }), 'lose', 'loose')).toBeLessThan(0);
  });
});

describe('deltas', () => {
  it('lists four nutrients, the goal\'s most important first', () => {
    expect(deltaKeys('lose')[0]).toBe('kcal');
    expect(deltaKeys('muscle')[0]).toBe('protein');
    expect(deltaKeys('heart')[0]).toBe('satFat');
    for (const g of ['lose', 'maintain', 'muscle', 'sugar', 'heart'] as const) expect(deltaKeys(g)).toHaveLength(4);
  });
  it('judges direction per goal', () => {
    expect(isBetter('lose', 'kcal', -100)).toBe(true);
    expect(isBetter('lose', 'kcal', 100)).toBe(false);
    expect(isBetter('muscle', 'protein', 10)).toBe(true);
    expect(isBetter('heart', 'fibre', 3)).toBe(true);
    expect(isBetter('lose', 'kcal', 0)).toBeNull();
  });
});

// Review of dcfa404: a close match never lifts a worse option.
describe('swaps that make the goal worse', () => {
  it('are dropped, however close the match', () => {
    const original = per100({ kcal: 500 });
    const worse = swap('worse', { kcal: 560 }, 'close');
    const better = swap('better', { kcal: 460 }, 'loose');
    expect(rankSwaps(original, [worse, better], 'lose').map(s => s.id)).toEqual(['better']);
    expect(swapScore(original, per100({ kcal: 560 }), 'lose', 'close')).toBeLessThan(0);
  });
});
