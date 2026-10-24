// Rate of change, plateaus, losing streaks and probable metabolic adaptation.
import { ADAPTATION, GLYCOGEN_SKIP_DAYS, MIN_SPAN_DAYS, PLATEAU, RATE_WINDOW_DAYS } from './constants';
import { firstWeighDay, intakesIn, observedExpenditure, recentWindow } from './adaptive';
import { restingExpenditure } from './energy';
import { trendFit, trendWeights, weighInDays } from './trend';
import type { Adaptation, BodyProfile, DayIntake, Plateau, PlateauCause, TrendFit, WeighIn } from './types';

export interface Rate {
  ratePctPerWeek: number;
  /** Standard error of the rate (inflated as the slope's). */
  sePctPerWeek: number;
  days: number;
  fit: TrendFit;
}

/** Trend rate over the last `days` days (after the glycogen skip), % of body weight per week. */
export function recentRate(weighIns: readonly WeighIn[], today: number, days = RATE_WINDOW_DAYS, minWeighIns: number = PLATEAU.minWeighIns): Rate | null {
  const { fromDay, toDay } = recentWindow(weighIns, today, days);
  if (toDay - fromDay + 1 < MIN_SPAN_DAYS) return null;
  const fit = trendFit(weighIns, fromDay, toDay);
  if (!fit || fit.n < minWeighIns || fit.spanDays < MIN_SPAN_DAYS) return null;
  const perKg = 7 / fit.midKg * 100;
  return { ratePctPerWeek: fit.slopeKgPerDay * perKg, sePctPerWeek: fit.seKgPerDay * perKg, days: toDay - fromDay + 1, fit };
}

export interface Streak {
  /** Consecutive whole weeks, counted back from the latest weigh-in, in which the trend weight fell. */
  weeks: number;
  /** Loss over those weeks, % of the weight at their start. */
  lossPct: number;
}

export function losingStreak(weighIns: readonly WeighIn[]): Streak {
  const pts = trendWeights(weighIns).map(p => ({ t: weighInDays(p.at), kg: p.trendKg }));
  if (pts.length < 2) return { weeks: 0, lossPct: 0 };
  const last = pts[pts.length - 1]!;
  const before = (t: number) => {
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i]!.t <= t + 1e-9) return pts[i]!.t >= t - 7 ? pts[i]! : null;
    return null;
  };
  let weeks = 0;
  let prev = last;
  for (;;) {
    const p = before(last.t - 7 * (weeks + 1));
    if (!p || p.kg <= prev.kg) break;
    weeks++;
    prev = p;
  }
  return { weeks, lossPct: weeks ? (prev.kg - last.kg) / prev.kg * 100 : 0 };
}

function mean(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export interface DetectInput {
  profile: BodyProfile;
  age: number;
  weighIns: readonly WeighIn[];
  intakes: readonly DayIntake[];
  today: number;
}

/**
 * Probable adaptation: expenditure measured now is below what the baseline measurement predicts for the
 * lower weight. Baseline = the first 42 days after the glycogen skip; now = the last 42 days. The expected
 * value scales the baseline by the resting equation at each window's trend weight (activity held equal).
 */
export function detectAdaptation(i: DetectInput): Adaptation | null {
  const first = firstWeighDay(i.weighIns);
  if (first === null) return null;
  const L = ADAPTATION.windowDays;
  const bFrom = first + GLYCOGEN_SKIP_DAYS;
  const bTo = bFrom + L - 1;
  const cTo = i.today;
  const cFrom = i.today - L + 1;
  if (cFrom <= bTo) return null;
  const base = observedExpenditure({ ...i, fromDay: bFrom, toDay: bTo });
  const cur = observedExpenditure({ ...i, fromDay: cFrom, toDay: cTo });
  if (!base || !cur || !base.steady || !cur.steady || !base.plausible || !cur.plausible) return null;
  const ratio = restingExpenditure(i.profile, i.age, cur.midKg).kcal / restingExpenditure(i.profile, i.age, base.midKg).kcal;
  const expectedKcal = base.kcal * ratio;
  const gapKcal = expectedKcal - cur.kcal;
  const seKcal = Math.hypot(base.seKcal * ratio, cur.seKcal);
  const lossPct = (base.midKg - cur.midKg) / base.midKg * 100;
  const probable = lossPct >= ADAPTATION.minLossPct && gapKcal >= ADAPTATION.minGapRel * expectedKcal && gapKcal >= ADAPTATION.z * seKcal;
  return {
    probable,
    baselineKcal: base.kcal,
    expectedKcal,
    observedKcal: cur.kcal,
    gapKcal,
    gapPct: gapKcal / expectedKcal * 100,
    seKcal,
    baselineKg: base.midKg,
    currentKg: cur.midKg,
    lossPct,
    weeksBetween: ((cFrom + cTo) / 2 - (bFrom + bTo) / 2) / 7,
  };
}

/** A stall: over the last 21 days the trend lost less than 0.1% of body weight per week. */
export function detectPlateau(i: DetectInput & { adaptation: Adaptation | null }): Plateau | null {
  const rate = recentRate(i.weighIns, i.today, PLATEAU.days);
  if (!rate || rate.days < PLATEAU.days || rate.ratePctPerWeek < -PLATEAU.maxLossPctPerWeek) return null;
  const cur = intakesIn(i.intakes, i.today - PLATEAU.days + 1, i.today).map(([, d]) => d.kcal);
  const prev = intakesIn(i.intakes, i.today - 2 * PLATEAU.days + 1, i.today - PLATEAU.days).map(([, d]) => d.kcal);
  const coverage = cur.length / PLATEAU.days;
  const meanIntakeKcal = cur.length ? mean(cur) : 0;
  const previousMeanIntakeKcal = prev.length >= 7 ? mean(prev) : null;
  let cause: PlateauCause = 'unexplained';
  if (coverage < PLATEAU.minCoverage) cause = 'logging-gaps';
  else if (previousMeanIntakeKcal !== null && meanIntakeKcal - previousMeanIntakeKcal >= PLATEAU.intakeRiseKcal) cause = 'intake-rise';
  else if (i.adaptation?.probable) cause = 'adaptation';
  return { days: rate.days, ratePctPerWeek: rate.ratePctPerWeek, meanIntakeKcal, previousMeanIntakeKcal, coverage, cause };
}
