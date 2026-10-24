// Expenditure measured from the person's own data: energy in (logged) minus the change in body energy
// stores (trend slope x energy density), blended with the equation estimate by precision.
import { CONFIDENCE_WEIGHT, DRIFT_PER_WINDOW, GLYCOGEN_SKIP_DAYS, MIN_COVERAGE, MIN_SPAN_DAYS, MIN_WEIGH_INS, STEADY_KCAL, WINDOW_DAYS, MIN_MEASURED_PAL } from './constants';
import { compositionAt, energyDensity, referenceComposition, restingExpenditure, totalExpenditure } from './energy';
import { currentTrendKg, dayKeyOf, dayNumber, trendFit, weighInDays } from './trend';
import type { BodyProfile, Confidence, DayIntake, ExpenditureEstimate, ObservedExpenditure, WeighIn } from './types';

export interface WindowInput {
  profile: BodyProfile;
  age: number;
  weighIns: readonly WeighIn[];
  intakes: readonly DayIntake[];
  /** Inclusive day numbers (trend.ts dayNumber). */
  fromDay: number;
  toDay: number;
}

/** Logged days inside [fromDay, toDay], one per day (the last entry wins), as [day number, intake]. */
export function intakesIn(intakes: readonly DayIntake[], fromDay: number, toDay: number): [number, DayIntake][] {
  const byDay = new Map<number, DayIntake>();
  for (const d of intakes) {
    const n = dayNumber(d.day);
    if (Number.isFinite(n) && n >= fromDay && n <= toDay && Number.isFinite(d.kcal) && d.kcal > 0) byDay.set(n, d);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]);
}

function mean(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function sd(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function firstWeighDay(weighIns: readonly WeighIn[]): number | null {
  let min = Infinity;
  for (const w of weighIns) if (Number.isFinite(w.at) && w.kg > 0) min = Math.min(min, Math.floor(weighInDays(w.at)));
  return Number.isFinite(min) ? min : null;
}

/** Back-calculated expenditure over one window, or null when the data cannot support it. */
export function observedExpenditure(i: WindowInput): ObservedExpenditure | null {
  const windowDays = i.toDay - i.fromDay + 1;
  if (!(windowDays >= MIN_SPAN_DAYS)) return null;
  const fit = trendFit(i.weighIns, i.fromDay, i.toDay);
  if (!fit || fit.n < MIN_WEIGH_INS || fit.spanDays < MIN_SPAN_DAYS) return null;
  const days = intakesIn(i.intakes, i.fromDay, i.toDay);
  if (days.length < Math.max(7, MIN_COVERAGE * windowDays)) return null;
  const kcals = days.map(([, d]) => d.kcal);
  const meanIntakeKcal = mean(kcals);
  const comp = compositionAt(referenceComposition(i.profile, i.age), fit.midKg);
  const rho = energyDensity(comp.fatKg);
  const kcal = meanIntakeKcal - rho * fit.slopeKgPerDay;
  const seKcal = Math.hypot(rho * fit.seKgPerDay, sd(kcals) / Math.sqrt(kcals.length));
  const split = i.fromDay + Math.floor(windowDays / 2);
  const early = days.filter(([n]) => n < split).map(([, d]) => d.kcal);
  const late = days.filter(([n]) => n >= split).map(([, d]) => d.kcal);
  const steady = early.length >= 3 && late.length >= 3 && Math.abs(mean(early) - mean(late)) <= STEADY_KCAL;
  const restingKcal = restingExpenditure(i.profile, i.age, fit.midKg).kcal;
  return {
    kcal,
    seKcal,
    fromDay: dayKeyOf(i.fromDay),
    toDay: dayKeyOf(i.toDay),
    meanIntakeKcal,
    loggedDays: days.length,
    windowDays,
    weighIns: fit.n,
    slopeKgPerDay: fit.slopeKgPerDay,
    midKg: fit.midKg,
    energyDensity: rho,
    steady,
    plausible: kcal >= MIN_MEASURED_PAL * restingKcal,
    restingKcal,
  };
}

export interface EstimateInput {
  profile: BodyProfile;
  age: number;
  weighIns: readonly WeighIn[];
  intakes: readonly DayIntake[];
  /** Day number of today. */
  today: number;
  windowDays?: number;
}

/** The last `windowDays` days, starting no earlier than the end of the glycogen skip. */
export function recentWindow(weighIns: readonly WeighIn[], today: number, windowDays: number): { fromDay: number; toDay: number } {
  const first = firstWeighDay(weighIns);
  const fromDay = Math.max(today - windowDays + 1, first === null ? -Infinity : first + GLYCOGEN_SKIP_DAYS);
  return { fromDay, toDay: today };
}

/** Consecutive windows ending today, oldest first; the oldest may be shorter but never under the minimum span. */
export function windows(weighIns: readonly WeighIn[], today: number, windowDays: number): { fromDay: number; toDay: number }[] {
  const first = firstWeighDay(weighIns);
  if (first === null) return [];
  const start = first + GLYCOGEN_SKIP_DAYS;
  const out: { fromDay: number; toDay: number }[] = [];
  for (let to = today; to - start + 1 >= MIN_SPAN_DAYS; to -= windowDays) out.unshift({ fromDay: Math.max(to - windowDays + 1, start), toDay: to });
  return out;
}

/**
 * Maintenance expenditure as a running estimate (a one-state Kalman filter). It starts from the equation
 * estimate and its spread. Each window then (1) carries the estimate to the window's trend weight by the
 * resting equation's ratio, (2) widens it by DRIFT_PER_WINDOW for real change in activity or adaptation, and
 * (3) combines it with the back-calculated value, each weighted by 1 / variance. Unsteady windows, and
 * windows too low to be real (meals missing from the log), only carry.
 * With one window this is the plain precision-weighted blend of prior and observation.
 */
export function estimateExpenditure(i: EstimateInput): ExpenditureEstimate {
  const weight = currentTrendKg(i.weighIns) ?? i.profile.weightKg;
  const prior = totalExpenditure(i.profile, i.age, weight);
  const list = windows(i.weighIns, i.today, i.windowDays ?? WINDOW_DAYS);
  let x = NaN, p = NaN, atKg = weight, used = 0, lastK = 0;
  let observed: ObservedExpenditure | null = null;
  for (const [k, w] of list.entries()) {
    const obs = observedExpenditure({ ...i, fromDay: w.fromDay, toDay: w.toDay });
    if (k === list.length - 1) observed = obs;
    if (!obs) continue;
    if (Number.isNaN(x)) {
      const start = totalExpenditure(i.profile, i.age, obs.midKg);
      x = start.kcal; p = start.sdKcal ** 2;
    } else {
      const ratio = restingExpenditure(i.profile, i.age, obs.midKg).kcal / restingExpenditure(i.profile, i.age, atKg).kcal;
      x *= ratio; p = p * ratio * ratio + (k - lastK) * (DRIFT_PER_WINDOW * x) ** 2;
    }
    atKg = obs.midKg;
    lastK = k;
    if (!obs.steady || !obs.plausible) continue;
    const r = obs.seKcal ** 2;
    const gain = p / (p + r);
    x += gain * (obs.kcal - x);
    p *= 1 - gain;
    used++;
  }
  if (!used) {
    return { kcal: prior.kcal, sdKcal: prior.sdKcal, priorKcal: prior.kcal, priorSdKcal: prior.sdKcal, observed, observedWeight: 0, confidence: 'none' };
  }
  const ratio = restingExpenditure(i.profile, i.age, weight).kcal / restingExpenditure(i.profile, i.age, atKg).kcal;
  const kcal = x * ratio;
  const sdKcal = Math.sqrt(p) * ratio;
  // Share of the prior's variance the person's data has removed (with one window, the blend weight).
  const w = Math.max(0, Math.min(1, 1 - (sdKcal * sdKcal) / (prior.sdKcal * prior.sdKcal)));
  const confidence: Confidence = w >= CONFIDENCE_WEIGHT.high ? 'high' : w >= CONFIDENCE_WEIGHT.medium ? 'medium' : 'low';
  return { kcal, sdKcal, priorKcal: prior.kcal, priorSdKcal: prior.sdKcal, observed, observedWeight: w, confidence };
}
