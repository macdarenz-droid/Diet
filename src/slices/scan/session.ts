// The current scan: input, progress, the grounded analysis, edits and the chosen swap.
import { computed, signal } from '@preact/signals';
import type { Analysis, Item, Meal } from '@/core/models';
import { keys, profile, recordUsage } from '@/core/store';
import { AnalysisError, type Stage } from '@/ai/errors';
import type { Answer } from '@/ai/prompts';
import { groundAll, localCache, type GroundStatus } from '@/nutrition/lookup';
import { rankSwaps, totals } from '@/nutrition/math';
import type { Prepared } from './image';

export type Step = Stage | 'ground';

export interface Scan {
  id: string;
  photo?: Prepared;
  text?: string;
  note?: string;
  answers: Answer[];
  phase: 'running' | 'ready' | 'failed';
  step: Step;
  analysis?: Analysis;
  found: boolean;
  ground?: GroundStatus;
  error?: AnalysisError;
  selected: string | null;
  /** True while a follow-up answer re-runs the analysis over a result already on screen. */
  refining: boolean;
}

export const scan = signal<Scan | null>(null);
let ctrl: AbortController | null = null;

export const current = computed(() => {
  const s = scan.value;
  if (!s?.analysis) return null;
  const meal = totals(s.analysis.items);
  const swaps = rankSwaps(meal, s.analysis.swaps, profile.value.goal);
  return { meal, swaps, analysis: s.analysis };
});

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function patch(id: string, p: Partial<Scan>): void {
  const s = scan.value;
  if (s && s.id === id) scan.value = { ...s, ...p };
}

async function run(id: string): Promise<void> {
  const s = scan.value;
  if (!s || s.id !== id) return;
  ctrl?.abort();
  const c = new AbortController();
  ctrl = c;
  try {
    const { analyze } = await import('@/ai/analyze');
    const { analysis, usage } = await analyze(
      { image: s.photo ? { data: s.photo.data, mediaType: 'image/jpeg' } : undefined, text: s.text, note: s.note, answers: s.answers, profile: profile.value },
      keys.value.claude,
      { signal: c.signal, onStage: st => patch(id, { step: st }) },
    );
    recordUsage(usage);
    if (!analysis.found) { patch(id, { phase: 'ready', found: false, analysis, refining: false }); return; }
    patch(id, { step: 'ground' });
    const lists = [analysis.items, ...analysis.swaps.map(w => w.items)];
    const { value, status } = await groundAll(lists, { key: keys.value.usda, cache: localCache(), signal: c.signal });
    if (c.signal.aborted) return;
    const [items, ...swapItems] = value;
    const grounded: Analysis = { ...analysis, items: items!, swaps: analysis.swaps.map((w, i) => ({ ...w, items: swapItems[i]! })) };
    patch(id, { phase: 'ready', found: true, analysis: grounded, ground: status, refining: false, selected: null });
  } catch (e) {
    // Cancelled, or replaced by a newer run (an answer given while this one was still going).
    if (c.signal.aborted) return;
    const err = e instanceof AnalysisError ? e : new AnalysisError('unknown', String(e));
    if (err.kind === 'aborted') return;
    const cur = scan.value;
    // A failed refinement keeps the earlier result on screen.
    if (cur?.id === id && cur.analysis && cur.refining) patch(id, { refining: false, error: err, phase: 'ready' });
    else patch(id, { phase: 'failed', error: err, refining: false });
  } finally {
    if (ctrl === c) ctrl = null;
  }
}

export function start(input: { photo?: Prepared; text?: string; note?: string }): void {
  const id = uid();
  scan.value = { id, ...input, answers: [], phase: 'running', step: 'send', found: true, selected: null, refining: false };
  void run(id);
}

export function retry(): void {
  const s = scan.value;
  if (!s) return;
  scan.value = { ...s, phase: 'running', step: 'send', error: undefined };
  void run(s.id);
}

export function answer(question: string, value: string): void {
  const s = scan.value;
  if (!s) return;
  const answers = [...s.answers.filter(a => a.question !== question), { question, answer: value }];
  scan.value = { ...s, answers, refining: true, step: 'send', error: undefined };
  void run(s.id);
}

export function cancel(): void {
  ctrl?.abort();
  ctrl = null;
  scan.value = null;
}

/** Sets an item's grams; its range moves with it in proportion. */
export function setGrams(index: number, grams: number): void {
  const s = scan.value;
  if (!s?.analysis) return;
  const items = s.analysis.items.map((it, i) => (i === index ? withGrams(it, grams) : it));
  scan.value = { ...s, analysis: { ...s.analysis, items } };
}

export function removeItem(index: number): void {
  const s = scan.value;
  if (!s?.analysis) return;
  scan.value = { ...s, analysis: { ...s.analysis, items: s.analysis.items.filter((_, i) => i !== index) } };
}

export function withGrams(it: Item, grams: number): Item {
  const g = Math.max(1, Math.round(grams));
  const k = it.grams > 0 ? g / it.grams : 1;
  return { ...it, grams: g, gramsLow: Math.round(it.gramsLow * k), gramsHigh: Math.round(it.gramsHigh * k) };
}

export function select(id: string | null): void {
  const s = scan.value;
  if (s) scan.value = { ...s, selected: s.selected === id ? null : id };
}

/** The meal to log: the chosen swap if there is one, else the analysed meal as edited. */
export function toMeal(s: Scan, at = Date.now()): Meal | null {
  if (!s.analysis) return null;
  const sw = s.selected ? s.analysis.swaps.find(w => w.id === s.selected) : undefined;
  const items = sw ? sw.items : s.analysis.items;
  return {
    id: uid(),
    at,
    dish: sw ? sw.title : s.analysis.dish,
    kind: s.analysis.kind,
    items,
    totals: totals(items),
    swappedFrom: sw ? s.analysis.dish : undefined,
    thumb: s.photo?.thumb,
  };
}
