// The current scan: input, progress, the grounded analysis, edits and the chosen swap.
import { computed, signal } from '@preact/signals';
import type { Analysis, Item, Meal } from '@/core/models';
import { keys, profile, recordUsage } from '@/core/store';
import { AnalysisError, type Stage } from '@/ai/errors';
import type { Answer, Edits } from '@/ai/prompts';
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
  /** Energy of the meal exactly as analysed, before the person's edits; swaps scale against it. */
  baseKcal: number;
  /** The person's corrections, by item name, so a refinement keeps them. */
  edits: Edits;
  found: boolean;
  ground?: GroundStatus;
  error?: AnalysisError;
  selected: string | null;
  /** True while a follow-up answer re-runs the analysis over a result already on screen. */
  refining: boolean;
}

export const scan = signal<Scan | null>(null);
let ctrl: AbortController | null = null;

const key = (name: string) => name.trim().toLowerCase();

/** Swaps describe the meal the model saw. When the person corrects portions, each swap is scaled by
 * the same energy ratio, so "Smaller serve" stays smaller than what they actually ate. */
export function scaleItems(items: Item[], ratio: number): Item[] {
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 1e-9) return items;
  return items.map(it => ({ ...it, grams: it.grams * ratio, gramsLow: it.gramsLow * ratio, gramsHigh: it.gramsHigh * ratio }));
}

export const current = computed(() => {
  const s = scan.value;
  if (!s?.analysis) return null;
  const meal = totals(s.analysis.items);
  const ratio = s.baseKcal > 0 ? meal.kcal / s.baseKcal : 1;
  const scaled = s.analysis.swaps.map(w => ({ ...w, items: scaleItems(w.items, ratio) }));
  const swaps = rankSwaps(meal, scaled, profile.value.goal);
  return { meal, swaps, analysis: s.analysis };
});

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function patch(id: string, p: Partial<Scan>): void {
  const s = scan.value;
  if (s && s.id === id) scan.value = { ...s, ...p };
}

/** Re-applies the person's corrections to a fresh analysis, matching items by name. */
export function applyEdits(items: Item[], edits: Edits): Item[] {
  const removed = new Set(edits.removed.map(key));
  return items.filter(it => !removed.has(key(it.name))).map(it => {
    const g = edits.grams[key(it.name)];
    return g === undefined ? it : withGrams(it, g);
  });
}

async function run(id: string, previousAnswers?: Answer[]): Promise<void> {
  const s = scan.value;
  if (!s || s.id !== id) return;
  ctrl?.abort();
  const c = new AbortController();
  ctrl = c;
  const refining = s.refining;
  try {
    const { analyze } = await import('@/ai/analyze');
    const { analysis, usage } = await analyze(
      { image: s.photo ? { data: s.photo.data, mediaType: 'image/jpeg' } : undefined, text: s.text, note: s.note, answers: s.answers, edits: s.edits, profile: profile.value },
      keys.value.claude,
      { signal: c.signal, onStage: st => patch(id, { step: st }) },
    );
    recordUsage(usage, refining ? 'refine' : 'scan');
    if (!analysis.found) { patch(id, { phase: 'ready', found: false, analysis, refining: false }); return; }
    patch(id, { step: 'ground' });
    const lists = [analysis.items, ...analysis.swaps.map(w => w.items)];
    const { value, status } = await groundAll(lists, { key: keys.value.usda, cache: localCache(), signal: c.signal });
    if (c.signal.aborted) return;
    const [items, ...swapItems] = value;
    const edits = scan.value?.edits ?? s.edits;
    const grounded: Analysis = { ...analysis, items: applyEdits(items!, edits), swaps: analysis.swaps.map((w, i) => ({ ...w, items: swapItems[i]! })) };
    patch(id, { phase: 'ready', found: true, analysis: grounded, baseKcal: totals(items!).kcal, ground: status, refining: false, selected: null });
  } catch (e) {
    // Cancelled, or replaced by a newer run (an answer given while this one was still going).
    if (c.signal.aborted) return;
    const err = e instanceof AnalysisError ? e : new AnalysisError('unknown', String(e));
    if (err.usage) recordUsage(err.usage, refining ? 'refine' : 'scan');
    if (err.kind === 'aborted') return;
    const cur = scan.value;
    // A failed refinement keeps the earlier result and reopens the question it was answering.
    if (cur?.id === id && cur.analysis && refining) patch(id, { refining: false, error: err, phase: 'ready', answers: previousAnswers ?? cur.answers });
    else patch(id, { phase: 'failed', error: err, refining: false });
  } finally {
    if (ctrl === c) ctrl = null;
  }
}

export function start(input: { photo?: Prepared; text?: string; note?: string }): void {
  const id = uid();
  scan.value = { id, ...input, answers: [], edits: { grams: {}, removed: [] }, baseKcal: 0, phase: 'running', step: 'send', found: true, selected: null, refining: false };
  void run(id);
}

export function retry(): void {
  const s = scan.value;
  if (!s) return;
  scan.value = { ...s, phase: 'running', step: 'send', error: undefined, refining: false };
  void run(s.id);
}

export function answer(question: string, value: string): void {
  const s = scan.value;
  if (!s || s.refining) return;
  const answers = [...s.answers.filter(a => a.question !== question), { question, answer: value }];
  scan.value = { ...s, answers, refining: true, step: 'send', error: undefined };
  void run(s.id, s.answers);
}

export function cancel(): void {
  ctrl?.abort();
  ctrl = null;
  scan.value = null;
}

/** Sets an item's grams; its range moves with it in proportion. Ignored while a refinement runs. */
export function setGrams(index: number, grams: number): void {
  const s = scan.value;
  if (!s?.analysis || s.refining) return;
  const target = s.analysis.items[index];
  if (!target) return;
  const items = s.analysis.items.map((it, i) => (i === index ? withGrams(it, grams) : it));
  const edits = { ...s.edits, grams: { ...s.edits.grams, [key(target.name)]: Math.max(1, Math.round(grams)) } };
  scan.value = { ...s, edits, analysis: { ...s.analysis, items } };
}

export function removeItem(index: number): void {
  const s = scan.value;
  if (!s?.analysis || s.refining) return;
  const target = s.analysis.items[index];
  if (!target) return;
  const edits = { ...s.edits, removed: [...s.edits.removed, target.name] };
  scan.value = { ...s, edits, analysis: { ...s.analysis, items: s.analysis.items.filter((_, i) => i !== index) } };
}

/** Unrounded ranges, so moving the weight away and back restores the range exactly. */
export function withGrams(it: Item, grams: number): Item {
  const g = Math.max(1, Math.round(grams));
  const k = it.grams > 0 ? g / it.grams : 1;
  return { ...it, grams: g, gramsLow: it.gramsLow * k, gramsHigh: it.gramsHigh * k };
}

export function select(id: string | null): void {
  const s = scan.value;
  if (s) scan.value = { ...s, selected: s.selected === id ? null : id };
}

/** The meal to log: the chosen swap (scaled to the corrected portion) if there is one, else the meal as edited. */
export function toMeal(s: Scan, at = Date.now()): Meal | null {
  if (!s.analysis) return null;
  const meal = totals(s.analysis.items);
  const ratio = s.baseKcal > 0 ? meal.kcal / s.baseKcal : 1;
  const sw = s.selected ? s.analysis.swaps.find(w => w.id === s.selected) : undefined;
  const items = sw ? scaleItems(sw.items, ratio) : s.analysis.items;
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
