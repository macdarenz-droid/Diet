import { describe, expect, it } from 'vitest';
import { scan, select, setGrams, toMeal, withGrams, type Scan } from '@/slices/scan/session';
import type { Analysis } from '@/core/models';
import { totals } from '@/nutrition/math';
import { item, per100 } from './helpers';

const analysis: Analysis = {
  dish: 'Burger and fries',
  kind: 'meal',
  confidence: 'medium',
  note: '',
  items: [item({ name: 'Burger', grams: 220, gramsLow: 180, gramsHigh: 260 }), item({ name: 'Fries', grams: 120, gramsLow: 100, gramsHigh: 150 })],
  questions: [],
  swaps: [{ id: 's0', title: 'Burger with salad', why: '', kind: 'dish', keeps: ['taste'], match: 'similar', effort: 'none', items: [item({ name: 'Burger', grams: 220, gramsLow: 220, gramsHigh: 220 }), item({ name: 'Salad', grams: 100, per100: per100({ kcal: 20 }) })] }],
};

const base = (): Scan => ({ id: 'x', answers: [], phase: 'ready', step: 'ground', analysis, found: true, selected: null, refining: false });

describe('editing a scan', () => {
  it('moves the range with the new weight', () => {
    expect(withGrams(item({ grams: 200, gramsLow: 150, gramsHigh: 260 }), 100)).toMatchObject({ grams: 100, gramsLow: 75, gramsHigh: 130 });
  });

  it('updates totals when grams change', () => {
    scan.value = base();
    setGrams(1, 60);
    expect(scan.value!.analysis!.items[1]!.grams).toBe(60);
    expect(totals(scan.value!.analysis!.items).kcal).toBeCloseTo(2.2 * 200 + 0.6 * 200);
  });

  it('toggles the chosen swap', () => {
    scan.value = base();
    select('s0');
    expect(scan.value!.selected).toBe('s0');
    select('s0');
    expect(scan.value!.selected).toBeNull();
  });
});

describe('toMeal', () => {
  it('logs the analysed meal by default', () => {
    const m = toMeal(base(), 1000)!;
    expect(m.dish).toBe('Burger and fries');
    expect(m.items).toHaveLength(2);
    expect(m.swappedFrom).toBeUndefined();
    expect(m.totals.kcal).toBeCloseTo(totals(analysis.items).kcal);
  });

  it('logs the chosen swap in its place', () => {
    const m = toMeal({ ...base(), selected: 's0' }, 1000)!;
    expect(m.dish).toBe('Burger with salad');
    expect(m.swappedFrom).toBe('Burger and fries');
    expect(m.totals.kcal).toBeCloseTo(440 + 20);
  });
});
