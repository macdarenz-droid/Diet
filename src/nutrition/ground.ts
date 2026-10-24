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

/** The best candidate for an item, or null to keep the estimate. */
export function choose(query: string, estimate: Nutrients, candidates: readonly Candidate[]): Candidate | null {
  let best: { c: Candidate; s: number } | null = null;
  // Offline search results carry a relevance score that weighs rare words and local aliases; it is
  // relative, so it is read against the best result. Plain candidates fall back to word overlap.
  const top = Math.max(0, ...candidates.map(c => c.score ?? 0));
  for (const c of candidates) {
    if (!energyFits(c.per100.kcal, estimate.kcal)) continue;
    const name = c.score !== undefined && top > 0 ? Math.max(c.score / top, nameScore(query, c.description)) : nameScore(query, c.description);
    if (name < 0.5) continue;
    const off = estimate.kcal > LOW_KCAL ? Math.abs(Math.log(Math.max(c.per100.kcal, 1) / estimate.kcal)) : 0;
    const s = name - 0.5 * off - 0.02 * c.rank;
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
