// Totals, ranges and differences. Plain arithmetic: the model never computes a number we show.
import { NUTRIENT_KEYS, type Goal, type Item, type Match, type Nutrients, type NutrientKey, type Swap } from '@/core/models';

export const zero = (): Nutrients => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, fibre: 0, sugars: 0, sodium: 0 });

export function scale(per100: Nutrients, grams: number): Nutrients {
  const f = Math.max(0, grams) / 100;
  const out = zero();
  for (const k of NUTRIENT_KEYS) out[k] = per100[k] * f;
  return out;
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  const out = zero();
  for (const k of NUTRIENT_KEYS) out[k] = a[k] + b[k];
  return out;
}

export function sub(a: Nutrients, b: Nutrients): Nutrients {
  const out = zero();
  for (const k of NUTRIENT_KEYS) out[k] = a[k] - b[k];
  return out;
}

export function totals(items: readonly Item[], pick: 'grams' | 'gramsLow' | 'gramsHigh' = 'grams'): Nutrients {
  return items.reduce((acc, it) => add(acc, scale(it.per100, it[pick])), zero());
}

export interface Range { low: Nutrients; mid: Nutrients; high: Nutrients }

export function range(items: readonly Item[]): Range {
  return { low: totals(items, 'gramsLow'), mid: totals(items), high: totals(items, 'gramsHigh') };
}

export const KJ_PER_KCAL = 4.184;

/** Energy from macros (Atwater general factors), used when a source gives no energy value. */
export function atwater(n: Pick<Nutrients, 'protein' | 'carbs' | 'fat'>): number {
  return 4 * n.protein + 4 * n.carbs + 9 * n.fat;
}

/** Share of energy from protein, carbs and fat (sums to 1, or all 0 when there is no energy). */
export function macroSplit(n: Nutrients): { protein: number; carbs: number; fat: number } {
  const p = 4 * n.protein, c = 4 * n.carbs, f = 9 * n.fat;
  const sum = p + c + f;
  if (sum <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return { protein: p / sum, carbs: c / sum, fat: f / sum };
}

/** Which direction is better for each nutrient under a goal, and how much it counts. */
const WEIGHTS: Record<Goal, Partial<Record<NutrientKey, number>>> = {
  lose: { kcal: -1, protein: 0.5, fibre: 0.25, sugars: -0.25 },
  maintain: { kcal: -0.25, fibre: 0.5, sugars: -0.5, satFat: -0.5, sodium: -0.25 },
  muscle: { protein: 1, kcal: -0.15, sugars: -0.15 },
  sugar: { sugars: -1, carbs: -0.35, fibre: 0.35, kcal: -0.2 },
  heart: { satFat: -1, sodium: -0.8, fibre: 0.4, kcal: -0.2 },
};

/** Scale for comparing changes across nutrients: a change of this size counts as 1. */
const UNIT: Record<NutrientKey, number> = { kcal: 200, protein: 15, carbs: 30, fat: 12, satFat: 5, fibre: 5, sugars: 12, sodium: 500 };

const MATCH_BONUS: Record<Match, number> = { close: 0.6, similar: 0.3, loose: 0 };

/** How much better a swap is for this goal than the original (higher is better). */
export function swapScore(original: Nutrients, swap: Nutrients, goal: Goal, match: Match): number {
  const w = WEIGHTS[goal];
  let s = 0;
  for (const k of NUTRIENT_KEYS) {
    const weight = w[k];
    if (!weight) continue;
    s += weight * ((swap[k] - original[k]) / UNIT[k]);
  }
  // A close match only breaks ties among real improvements; it never lifts a worse option.
  return s > 0 ? s + MATCH_BONUS[match] : s;
}

/** Swaps that improve the goal, best first. One that makes the goal worse is not a swap. */
export function rankSwaps(original: Nutrients, swaps: readonly Swap[], goal: Goal): Swap[] {
  return swaps
    .map((sw, i) => ({ sw, i, score: swapScore(original, totals(sw.items), goal, sw.match) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(x => x.sw);
}

/** Nutrients worth showing as a swap's difference, most relevant to the goal first. */
export function deltaKeys(goal: Goal): NutrientKey[] {
  const order: NutrientKey[] = Object.entries(WEIGHTS[goal])
    .sort((a, b) => Math.abs(b[1]!) - Math.abs(a[1]!))
    .map(([k]) => k as NutrientKey);
  for (const k of ['kcal', 'protein', 'sugars', 'satFat'] as NutrientKey[]) if (!order.includes(k)) order.push(k);
  return order.slice(0, 4);
}

/** True when a change in this nutrient is an improvement for the goal; null when the goal is indifferent. */
export function isBetter(goal: Goal, key: NutrientKey, delta: number): boolean | null {
  const w = WEIGHTS[goal][key] ?? DEFAULT_DIRECTION[key];
  if (!w || delta === 0) return null;
  return Math.sign(w) === Math.sign(delta);
}

const DEFAULT_DIRECTION: Partial<Record<NutrientKey, number>> = { kcal: -1, satFat: -1, sugars: -1, sodium: -1, fibre: 1, protein: 1 };
