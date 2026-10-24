// Trend weight from noisy weigh-ins. Times are counted in days: a local calendar day number plus the
// local time of day, so a window of days lines up with the food log's day keys in any time zone.
import { DAY_MS, SLOPE_SE_INFLATION, TREND_HALF_LIFE_DAYS, WEIGH_NOISE_SD_KG } from './constants';
import type { DayKey, TrendFit, TrendPoint, WeighIn } from './types';

/** Day number of a 'YYYY-MM-DD' key (days since 1970-01-01); NaN when malformed. */
export function dayNumber(day: DayKey): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return NaN;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return NaN;
  return Math.round(ms / DAY_MS);
}

export function dayKeyOf(n: number): DayKey {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** A weigh-in's time in days: its local calendar day number plus the local time as a fraction. */
export function weighInDays(at: number): number {
  const d = new Date(at);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS) + (d.getHours() * 60 + d.getMinutes()) / 1440;
}

interface Pt { t: number; y: number; w?: number }

interface Line { slope: number; intercept: number; n: number; sxx: number; tMean: number; residualSd: number }

function weightedLine(pts: readonly Pt[]): Line | null {
  let sw = 0, st = 0, sy = 0;
  for (const p of pts) { const w = p.w ?? 1; sw += w; st += w * p.t; sy += w * p.y; }
  if (pts.length < 2 || sw <= 0) return null;
  const tMean = st / sw, yMean = sy / sw;
  let sxx = 0, sxy = 0;
  for (const p of pts) { const w = p.w ?? 1; sxx += w * (p.t - tMean) ** 2; sxy += w * (p.t - tMean) * (p.y - yMean); }
  if (sxx <= 1e-9) return null;
  const slope = sxy / sxx;
  const intercept = yMean - slope * tMean;
  let ssr = 0;
  for (const p of pts) ssr += (p.w ?? 1) * (p.y - (intercept + slope * p.t)) ** 2;
  const residualSd = pts.length > 2 ? Math.sqrt(ssr / sw * pts.length / (pts.length - 2)) : 0;
  return { slope, intercept, n: pts.length, sxx, tMean, residualSd };
}

/** Least squares with one pass of outlier removal (points beyond 3 SD, the SD floored at the noise level). */
function robustLine(pts: readonly Pt[]): Line | null {
  const first = weightedLine(pts);
  if (!first) return null;
  const limit = 3 * Math.max(first.residualSd, WEIGH_NOISE_SD_KG);
  const kept = pts.filter(p => Math.abs(p.y - (first.intercept + first.slope * p.t)) <= limit);
  if (kept.length === pts.length || kept.length < 3) return first;
  return weightedLine(kept) ?? first;
}

function sorted(weighIns: readonly WeighIn[]): Pt[] {
  return weighIns
    .filter(w => Number.isFinite(w.at) && Number.isFinite(w.kg) && w.kg > 0)
    .map(w => ({ t: weighInDays(w.at), y: w.kg }))
    .sort((a, b) => a.t - b.t);
}

/** Straight-line trend through the weigh-ins whose local day lies in [fromDay, toDay] (day numbers). */
export function trendFit(weighIns: readonly WeighIn[], fromDay: number, toDay: number): TrendFit | null {
  const pts = sorted(weighIns).filter(p => Math.floor(p.t) >= fromDay && Math.floor(p.t) <= toDay);
  const line = robustLine(pts);
  if (!line) return null;
  const sd = Math.max(line.residualSd, WEIGH_NOISE_SD_KG);
  const mid = (fromDay + toDay + 1) / 2;
  const end = toDay + 1;
  return {
    slopeKgPerDay: line.slope,
    seKgPerDay: sd / Math.sqrt(line.sxx) * SLOPE_SE_INFLATION,
    midKg: line.intercept + line.slope * mid,
    endKg: line.intercept + line.slope * end,
    n: line.n,
    spanDays: pts[pts.length - 1]!.t - pts[0]!.t,
    residualSdKg: line.residualSd,
  };
}

/**
 * Smoothed weight at each weigh-in: a local straight line weighted by 2^(-|dt| / halfLife), so it follows a
 * steady loss without lag and uses later weigh-ins when they exist. Points more than 3 noise SDs from the
 * first fit count one tenth as much.
 */
export function trendWeights(weighIns: readonly WeighIn[], halfLifeDays = TREND_HALF_LIFE_DAYS): TrendPoint[] {
  const raw = weighIns.filter(w => Number.isFinite(w.at) && Number.isFinite(w.kg) && w.kg > 0).slice().sort((a, b) => a.at - b.at);
  const pts = raw.map(w => ({ t: weighInDays(w.at), y: w.kg }));
  const reach = halfLifeDays * 6;
  const at = (i: number, down: readonly number[]): number => {
    const ti = pts[i]!.t;
    const local: Pt[] = [];
    pts.forEach((p, j) => {
      const dt = Math.abs(p.t - ti);
      if (dt <= reach) local.push({ t: p.t - ti, y: p.y, w: Math.pow(2, -dt / halfLifeDays) * down[j]! });
    });
    const line = weightedLine(local);
    if (line) return line.intercept;
    let sw = 0, sy = 0;
    for (const p of local) { const w = p.w ?? 1; sw += w; sy += w * p.y; }
    return sy / sw;
  };
  const ones = pts.map(() => 1);
  const first = pts.map((_, i) => at(i, ones));
  const limit = 3 * WEIGH_NOISE_SD_KG;
  const down = pts.map((p, i) => (Math.abs(p.y - first[i]!) > limit ? 0.1 : 1));
  const trend = down.some(d => d < 1) ? pts.map((_, i) => at(i, down)) : first;
  return raw.map((w, i) => ({ at: w.at, kg: w.kg, trendKg: trend[i]! }));
}

/** Trend weight at the latest weigh-in, or null without weigh-ins. */
export function currentTrendKg(weighIns: readonly WeighIn[]): number | null {
  const t = trendWeights(weighIns);
  return t.length ? t[t.length - 1]!.trendKg : null;
}
