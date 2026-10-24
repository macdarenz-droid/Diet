// Grounding: replace Claude's per-100 g estimates with USDA values where a close match exists.
import type { Item, Nutrients } from '@/core/models';
import type { Candidate } from './candidate';

/** A candidate whose energy is more than this fraction away from the estimate is rejected. */
export const MAX_ENERGY_OFF = 0.6;
/** Below this many kcal per 100 g (water, leaves, black coffee) energy is compared in absolute terms. */
const LOW_KCAL = 25;

const STOP = new Set(['and', 'with', 'or', 'in', 'of', 'the', 'a', 'nfs', 'ns', 'raw', 'cooked', 'prepared', 'made', 'from', 'type']);

/** Plural to singular for food names: berries → berry, tomatoes → tomato, eggs → egg (not "glass", "hummus"). */
export function stem(t: string): string {
  if (/[^aeiou]ies$/.test(t)) return t.slice(0, -3) + 'y';
  if (/[^aeiou]oes$/.test(t)) return t.slice(0, -2);
  if (/(ss|us|is)$/.test(t)) return t;
  return t.replace(/(?<=[a-z]{2})s$/, '');
}

export function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOP.has(t)).map(stem);
}

/** Share of the query's words found in the description, 0..1. */
export function nameScore(query: string, description: string): number {
  const q = tokens(query);
  if (!q.length) return 0;
  const d = new Set(tokens(description));
  const hit = q.filter(t => d.has(t)).length;
  const first = q[0] !== undefined && tokens(description)[0] === q[0] ? 0.15 : 0;
  return hit / q.length + first;
}

export function energyFits(candidateKcal: number, estimateKcal: number): boolean {
  if (estimateKcal < LOW_KCAL && candidateKcal < LOW_KCAL * 2) return Math.abs(candidateKcal - estimateKcal) <= LOW_KCAL;
  if (estimateKcal <= 0) return candidateKcal <= LOW_KCAL;
  return Math.abs(candidateKcal - estimateKcal) / estimateKcal <= MAX_ENERGY_OFF;
}

/** A candidate must hold at least this share of the query's words, weighted by rarity, in one of
 * its names: one shared word ("bowl" of "acai bowl") is not a match. A wrong match is worse than
 * none, since no match keeps Claude's estimate. */
export const MIN_COVER = 0.7;

/** A name's lead: the words before its first comma, bracket or "with" ("Spaghetti with tomato
 * sauce" leads with spaghetti). */
const LEAD = /[,(]| (?:with|in|on|and) /i;
/** Words that, in the lead of a name, make it a product made from or for a food rather than the
 * food ("Sauce, butter chicken", "Salad dressing, caesar", "Orange juice"). */
const PRODUCT = new Set(['sauce', 'gravy', 'dressing', 'seasoning', 'stock', 'broth', 'juice', 'oil', 'babyfood', 'toddler', 'infant']);
/** Words that make a name a stand-in for the food: anywhere ("Crab, imitation", "Egg substitute"),
 * or with a meat in the lead ("Chicken, meatless", "Hot dog, vegetarian"; not "Lasagna, meatless"). */
const STAND_IN = new Set(['imitation', 'substitute']);
const MEATLESS = new Set(['meatless', 'vegetarian', 'vegan']);
const MEAT = new Set(['meat', 'chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'ham', 'sausage', 'frankfurter', 'dog', 'meatball', 'luncheon', 'steak', 'salami', 'burger', 'patty', 'fillet']);

/** Whether a candidate is a product made from the food or a stand-in for it, which the query does
 * not ask for. */
function otherFood(description: string, q: ReadonlySet<string>): boolean {
  const lead = tokens(description.split(LEAD)[0]!);
  const meat = lead.some(t => MEAT.has(t));
  return lead.some(t => PRODUCT.has(t) && !q.has(t)) || tokens(description).some(t => (STAND_IN.has(t) || (meat && MEATLESS.has(t))) && !q.has(t));
}

/** The best candidate for an item, or null to keep the estimate. */
export function choose(query: string, estimate: Nutrients, candidates: readonly Candidate[]): Candidate | null {
  let best: { c: Candidate; s: number } | null = null;
  const q = new Set(tokens(query));
  // Search results carry an absolute cover, which decides whether a food matches at all, and a
  // relevance score, which is relative and only ranks the matches. Plain candidates use word
  // overlap for both.
  const top = Math.max(0, ...candidates.map(c => c.score ?? 0));
  for (const c of candidates) {
    if (!energyFits(c.per100.kcal, estimate.kcal)) continue;
    const overlap = nameScore(query, c.description);
    const cover = c.cover ?? Math.min(1, overlap);
    if (cover < MIN_COVER || otherFood(c.description, q)) continue;
    const rel = c.score !== undefined && top > 0 ? Math.max(c.score / top, overlap) : overlap;
    const off = estimate.kcal > LOW_KCAL ? Math.abs(Math.log(Math.max(c.per100.kcal, 1) / estimate.kcal)) : 0;
    const s = rel + cover - 0.5 * off - 0.02 * c.rank;
    if (!best || s > best.s) best = { c, s };
  }
  return best?.c ?? null;
}

export function applyCandidate(item: Item, c: Candidate | null): Item {
  if (item.source === 'label') return item;
  if (!c) return { ...item, per100: item.estimate, source: 'estimate', food: undefined };
  // Nutrients the source does not report come from the estimate rather than reading as zero.
  const per100 = { ...c.per100 };
  for (const k of c.missing ?? []) per100[k] = item.estimate[k];
  return { ...item, per100, source: 'database', food: { id: c.fdcId, description: c.description, dataset: c.dataType } };
}
