// USDA FoodData Central: search and per-100 g parsing. Nutrient ids checked against a live
// response on 2026-10-24 (docs/ARCHITECTURE.md §5).
import type { NutrientKey, Nutrients } from '@/core/models';
import { atwater } from './math';
import { withTimeout } from '@/core/abort';

export const FDC_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
export const DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];

export interface FdcNutrient { nutrientId?: number; value?: number; unitName?: string }
export interface FdcFood { fdcId: number; description: string; dataType?: string; foodNutrients?: FdcNutrient[] }
export interface FdcSearch { foods?: FdcFood[] }

/** missing lists nutrients the source does not report; grounding fills those from the estimate. */
export interface Candidate { fdcId: number; description: string; dataType: string; per100: Nutrients; rank: number; missing?: NutrientKey[] }

const ID = {
  energy: [1008, 2048, 2047],
  protein: [1003],
  carbs: [1005],
  fat: [1004],
  satFat: [1258],
  fibre: [1079],
  sugars: [2000, 1063],
  sodium: [1093],
} as const;

function pick(map: Map<number, FdcNutrient>, ids: readonly number[], unit: 'G' | 'MG' | 'KCAL'): number | undefined {
  for (const id of ids) {
    const n = map.get(id);
    if (!n || typeof n.value !== 'number' || !Number.isFinite(n.value)) continue;
    const u = (n.unitName ?? '').toUpperCase();
    if (unit === 'KCAL') { if (u === 'KCAL') return n.value; if (u === 'KJ') return n.value / 4.184; continue; }
    if (unit === 'MG') { if (u === 'MG') return n.value; if (u === 'G') return n.value * 1000; if (u === 'UG') return n.value / 1000; continue; }
    if (u === 'G') return n.value;
    if (u === 'MG') return n.value / 1000;
  }
  return undefined;
}

/** Per-100 g values for one food, or null when protein, carbs and fat are not all present. */
export function parseFood(f: FdcFood): Nutrients | null {
  return parseFoodWithGaps(f)?.per100 ?? null;
}

/** As parseFood, plus which optional nutrients the food does not report (they read 0 in per100). */
export function parseFoodWithGaps(f: FdcFood): { per100: Nutrients; missing: NutrientKey[] } | null {
  const map = new Map<number, FdcNutrient>();
  for (const n of f.foodNutrients ?? []) if (typeof n.nutrientId === 'number' && !map.has(n.nutrientId)) map.set(n.nutrientId, n);
  const protein = pick(map, ID.protein, 'G');
  const carbs = pick(map, ID.carbs, 'G');
  const fat = pick(map, ID.fat, 'G');
  if (protein === undefined || carbs === undefined || fat === undefined) return null;
  const kcal = pick(map, ID.energy, 'KCAL') ?? atwater({ protein, carbs, fat });
  const optional = { satFat: pick(map, ID.satFat, 'G'), fibre: pick(map, ID.fibre, 'G'), sugars: pick(map, ID.sugars, 'G'), sodium: pick(map, ID.sodium, 'MG') };
  const missing = (Object.keys(optional) as (keyof typeof optional)[]).filter(k => optional[k] === undefined);
  return {
    per100: { kcal, protein, carbs, fat, satFat: optional.satFat ?? 0, fibre: optional.fibre ?? 0, sugars: optional.sugars ?? 0, sodium: optional.sodium ?? 0 },
    missing,
  };
}

export function parseSearch(json: FdcSearch): Candidate[] {
  const out: Candidate[] = [];
  (json.foods ?? []).forEach((f, rank) => {
    const parsed = parseFoodWithGaps(f);
    if (parsed && typeof f.fdcId === 'number') out.push({ fdcId: f.fdcId, description: f.description ?? '', dataType: f.dataType ?? '', per100: parsed.per100, rank, ...(parsed.missing.length ? { missing: parsed.missing } : {}) });
  });
  return out;
}

export class FdcError extends Error {
  constructor(public readonly kind: 'rate' | 'auth' | 'network' | 'server', message: string) { super(message); }
}

export function searchUrl(query: string, key: string, pageSize = 10): string {
  const p = new URLSearchParams({ api_key: key, query, pageSize: String(pageSize), dataType: DATA_TYPES.join(',') });
  return `${FDC_URL}?${p.toString()}`;
}

/** One request may take this long before it counts as unreachable. */
export const SEARCH_TIMEOUT_MS = 8000;

export async function search(query: string, key: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Candidate[]> {
  let res: Response;
  const t = withTimeout(signal, SEARCH_TIMEOUT_MS);
  try {
    res = await fetchImpl(searchUrl(query, key), { signal: t.signal });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new FdcError('network', t.timedOut() ? 'USDA timed out' : 'USDA could not be reached');
  } finally {
    t.clear();
  }
  if (res.status === 429) throw new FdcError('rate', 'USDA rate limit');
  if (res.status === 401 || res.status === 403) throw new FdcError('auth', 'USDA key not accepted');
  if (!res.ok) throw new FdcError('server', `USDA status ${res.status}`);
  return parseSearch((await res.json()) as FdcSearch);
}
