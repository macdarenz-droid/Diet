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

const base = (): Scan => ({ id: 'x', answers: [], edits: { grams: {}, removed: [] }, baseKcal: totals(analysis.items).kcal, phase: 'ready', step: 'ground', analysis, found: true, selected: null, refining: false });

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

// Review of dcfa404: refine, edits, swap scaling, ranges.
import { vi } from 'vitest';
import { answer, applyEdits, current, removeItem, scaleItems, start } from '@/slices/scan/session';
import { AnalysisError } from '@/ai/errors';
import { usage } from '@/core/store';
import type { AnalyzeInput } from '@/ai/analyze';

const calls: AnalyzeInput[] = [];
let next: () => Promise<unknown> = async () => { throw new Error('no mock'); };
vi.mock('@/ai/analyze', () => ({ analyze: (input: AnalyzeInput) => { calls.push(input); return next(); } }));

const flush = () => new Promise(r => setTimeout(r, 0));
const refined = () => ({
  analysis: { ...analysis, found: true, items: [item({ name: 'Burger', grams: 220 }), item({ name: 'Fries', grams: 120 }), item({ name: 'Sauce', grams: 30 })], questions: [], swaps: analysis.swaps },
  usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 },
});

describe('refining a scan', () => {
  it('reopens the question and keeps the old numbers when the refine fails, and records its usage', async () => {
    scan.value = { ...base(), analysis: { ...analysis, questions: [{ id: 'q', text: 'Fried or grilled?', options: ['Fried', 'Grilled'] }] } };
    const before = totals(scan.value.analysis!.items).kcal;
    usage.value = [];
    next = async () => { throw new AnalysisError('truncated', 'cut', { input: 5, output: 32000, cacheRead: 0, cacheWrite: 0 }); };
    answer('Fried or grilled?', 'Fried');
    await flush(); await flush();
    expect(scan.value!.answers).toEqual([]);
    expect(scan.value!.error?.kind).toBe('truncated');
    expect(totals(scan.value!.analysis!.items).kcal).toBe(before);
    expect(usage.value[0]).toMatchObject({ output: 32000, scans: 0, refines: 1 });
  });

  it('sends the corrections and re-applies them by name to the refreshed items', async () => {
    scan.value = base();
    setGrams(1, 60);
    removeItem(0);
    next = async () => refined();
    calls.length = 0;
    answer('Fried or grilled?', 'Grilled');
    await flush(); await flush(); await flush();
    expect(calls[0]!.edits).toEqual({ grams: { fries: 60 }, removed: ['Burger'] });
    expect(scan.value!.analysis!.items.map(i => `${i.name}:${i.grams}`)).toEqual(['Fries:60', 'Sauce:30']);
  });

  it('ignores edits while a refine runs', () => {
    scan.value = { ...base(), refining: true };
    setGrams(0, 10);
    removeItem(0);
    expect(scan.value!.analysis!.items[0]!.grams).toBe(220);
  });
});

describe('swaps follow the corrected portion', () => {
  it('scales swap items by the edited energy ratio, on screen and in the log', () => {
    scan.value = base();
    const full = totals(analysis.swaps[0]!.items).kcal;
    setGrams(0, 110);
    setGrams(1, 60);
    const swap = current.value!.analysis.swaps[0]!;
    const shown = current.value!.swaps.find(w => w.id === swap.id);
    const ratio = totals(scan.value!.analysis!.items).kcal / scan.value!.baseKcal;
    expect(ratio).toBeCloseTo(0.5);
    expect(shown).toBeDefined();
    expect(totals(shown!.items).kcal).toBeCloseTo(full * 0.5);
    const meal = toMeal({ ...scan.value!, selected: 's0' })!;
    expect(meal.totals.kcal).toBeCloseTo(full * 0.5);
  });

  it('leaves items alone at ratio 1', () => {
    const items = [item()];
    expect(scaleItems(items, 1)).toBe(items);
  });
});

describe('ranges survive edits', () => {
  it('restores the original range after moving the weight away and back', () => {
    const it0 = item({ grams: 150, gramsLow: 100, gramsHigh: 200 });
    const back = withGrams(withGrams(it0, 1), 150);
    expect(back.gramsLow).toBeCloseTo(100);
    expect(back.gramsHigh).toBeCloseTo(200);
  });

  it('applyEdits matches names case-insensitively', () => {
    const out = applyEdits([item({ name: 'Rice' }), item({ name: 'Egg' })], { grams: { rice: 50 }, removed: ['EGG'] });
    expect(out.map(i => `${i.name}:${i.grams}`)).toEqual(['Rice:50']);
  });
});

describe('start', () => {
  it('starts with empty edits and no base', () => {
    next = () => new Promise(() => {});
    start({ text: 'toast' });
    expect(scan.value).toMatchObject({ phase: 'running', edits: { grams: {}, removed: [] }, baseKcal: 0 });
  });
});

// Red team (failure paths) on dcfa404: double logging and refines that lose the result.
describe('logging and refine edge cases', () => {
  it('uses the given id so a repeated save overwrites', () => {
    const a = toMeal(base(), 1, 'scan-1')!;
    const b = toMeal(base(), 2, 'scan-1')!;
    expect(a.id).toBe('scan-1');
    expect(b.id).toBe(a.id);
  });

  it('keeps the result when a refine finds no food', async () => {
    scan.value = base();
    next = async () => ({ analysis: { ...analysis, found: false, items: [], swaps: [] }, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } });
    answer('Served with rice?', '1 cup');
    await flush(); await flush();
    expect(scan.value!.found).toBe(true);
    expect(scan.value!.analysis!.items).toHaveLength(2);
    expect(scan.value!.answers).toEqual([]);
  });

  it('keeps the chosen swap across a refine when it is still offered', async () => {
    scan.value = { ...base(), selected: 's0' };
    next = async () => refined();
    answer('Served with rice?', '1 cup');
    await flush(); await flush(); await flush();
    expect(scan.value!.selected).toBe('s0');
  });

});
