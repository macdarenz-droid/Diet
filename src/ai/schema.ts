// The model's output contract (structured outputs, JSON schema) and its client-side check.
// The prompt in prompts.ts and this schema change together (AGENTS.md, file ownership).
import type { Analysis, Confidence, Effort, Item, Keep, Match, MealKind, Nutrients, Question, Swap, SwapKind } from '@/core/models';

const num = { type: 'number' } as const;
const str = { type: 'string' } as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const enumOf = (values: readonly string[]) => ({ type: 'string', enum: [...values] });

export const MEAL_KINDS = ['meal', 'snack', 'drink', 'packaged'] as const satisfies readonly MealKind[];
export const CONFIDENCE = ['high', 'medium', 'low'] as const satisfies readonly Confidence[];
export const SWAP_KINDS = ['ingredient', 'method', 'dish', 'product', 'portion'] as const satisfies readonly SwapKind[];
export const KEEPS = ['taste', 'texture', 'ingredient', 'occasion'] as const satisfies readonly Keep[];
export const MATCHES = ['close', 'similar', 'loose'] as const satisfies readonly Match[];
export const EFFORTS = ['none', 'low', 'medium'] as const satisfies readonly Effort[];

const nutrients = obj({ kcal: num, protein: num, carbs: num, fat: num, sat_fat: num, fibre: num, sugars: num, sodium_mg: num });
// A nutrition panel exactly as printed; the code does the unit and per-serving conversion.
const panel = obj({
  present: { type: 'boolean' },
  basis: enumOf(['per100g', 'serving']),
  serving_g: num,
  energy: num,
  energy_unit: enumOf(['kJ', 'kcal']),
  protein: num, carbs: num, fat: num, sat_fat: num, fibre: num, sugars: num, sodium_mg: num,
});

// Property order is the order the model writes in: items first, swaps last, so the stream
// shows real progress.
export const SCHEMA = obj({
  found: { type: 'boolean' },
  dish: str,
  kind: enumOf(MEAL_KINDS),
  confidence: enumOf(CONFIDENCE),
  note: str,
  items: {
    type: 'array',
    items: obj({ name: str, detail: str, grams: num, grams_low: num, grams_high: num, usda_query: str, panel, per100: nutrients }),
  },
  questions: { type: 'array', items: obj({ id: str, text: str, options: { type: 'array', items: str } }) },
  swaps: {
    type: 'array',
    items: obj({
      title: str,
      why: str,
      kind: enumOf(SWAP_KINDS),
      keeps: { type: 'array', items: enumOf(KEEPS) },
      match: enumOf(MATCHES),
      effort: enumOf(EFFORTS),
      items: { type: 'array', items: obj({ name: str, grams: num, usda_query: str, per100: nutrients }) },
    }),
  },
});

export class InvalidOutput extends Error {}

const LIMIT = { items: 20, questions: 2, options: 4, swaps: 5, swapItems: 20 };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const s = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const n = (v: unknown, max = 100000): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0);
const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback: T): T => (values as readonly unknown[]).includes(v) ? (v as T) : fallback;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function nutrientsOf(v: unknown): Nutrients {
  const o = isObj(v) ? v : {};
  // Per 100 g, nothing exceeds 900 kcal or 100 g of a macro; sodium tops out near 40,000 mg (salt).
  return {
    kcal: n(o.kcal, 900),
    protein: n(o.protein, 100),
    carbs: n(o.carbs, 100),
    fat: n(o.fat, 100),
    satFat: n(o.sat_fat, 100),
    fibre: n(o.fibre, 100),
    sugars: n(o.sugars, 100),
    sodium: n(o.sodium_mg, 40000),
  };
}

/** Per-100 g kcal values from a panel as printed, or null when there is none or it cannot be converted. */
export function panelPer100(v: unknown): Nutrients | null {
  if (!isObj(v) || v.present !== true) return null;
  const perServing = v.basis === 'serving';
  const serving = n(v.serving_g, 5000);
  if (perServing && serving <= 0) return null;
  const f = perServing ? 100 / serving : 1;
  const energy = n(v.energy, 100000) * (v.energy_unit === 'kJ' ? 1 / 4.184 : 1);
  return nutrientsOf({
    kcal: energy * f,
    protein: n(v.protein) * f,
    carbs: n(v.carbs) * f,
    fat: n(v.fat) * f,
    sat_fat: n(v.sat_fat) * f,
    fibre: n(v.fibre) * f,
    sugars: n(v.sugars) * f,
    sodium_mg: n(v.sodium_mg, 1e6) * f,
  });
}

function itemOf(v: unknown, fixed: boolean): Item | null {
  if (!isObj(v)) return null;
  const name = s(v.name, 80);
  const grams = n(v.grams, 5000);
  if (!name || grams <= 0) return null;
  // A lower bound of 0 is honest (oil that may not be there); only a missing bound falls back.
  const has = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  let low = fixed || !has(v.grams_low) ? grams : n(v.grams_low, 5000);
  let high = fixed || !has(v.grams_high) ? grams : n(v.grams_high, 5000);
  if (low > grams) low = grams;
  if (high < grams) high = grams;
  const estimate = nutrientsOf(v.per100);
  const label = fixed ? null : panelPer100(v.panel);
  return {
    name,
    detail: s(v.detail, 120),
    grams,
    gramsLow: low,
    gramsHigh: high,
    per100: label ?? estimate,
    estimate,
    source: label ? 'label' : 'estimate',
    query: s(v.usda_query, 80) || name,
  };
}

export function parseAnalysis(json: unknown): Analysis & { found: boolean } {
  if (!isObj(json)) throw new InvalidOutput('not an object');
  const items = arr(json.items).slice(0, LIMIT.items).map(i => itemOf(i, false)).filter((i): i is Item => i !== null);
  const questions: Question[] = arr(json.questions).slice(0, LIMIT.questions).flatMap((q, i) => {
    if (!isObj(q)) return [];
    const text = s(q.text, 120);
    const options = arr(q.options).map(o => s(o, 40)).filter(Boolean).slice(0, LIMIT.options);
    return text && options.length >= 2 ? [{ id: s(q.id, 40) || `q${i}`, text, options }] : [];
  });
  const swaps: Swap[] = arr(json.swaps).slice(0, LIMIT.swaps).flatMap((w, i) => {
    if (!isObj(w)) return [];
    const title = s(w.title, 60);
    const swapItems = arr(w.items).slice(0, LIMIT.swapItems).map(x => itemOf(x, true)).filter((x): x is Item => x !== null);
    if (!title || !swapItems.length) return [];
    const keeps = [...new Set(arr(w.keeps).filter((k): k is Keep => (KEEPS as readonly unknown[]).includes(k)))];
    return [{
      id: `s${i}`,
      title,
      why: s(w.why, 220),
      kind: oneOf(w.kind, SWAP_KINDS, 'dish'),
      keeps,
      match: oneOf(w.match, MATCHES, 'similar'),
      effort: oneOf(w.effort, EFFORTS, 'low'),
      items: swapItems,
    }];
  });
  const found = json.found !== false && items.length > 0;
  return {
    found,
    dish: s(json.dish, 80) || items[0]?.name || '',
    kind: oneOf(json.kind, MEAL_KINDS, 'meal'),
    confidence: oneOf(json.confidence, CONFIDENCE, 'medium'),
    note: s(json.note, 200),
    items,
    questions,
    swaps,
  };
}
