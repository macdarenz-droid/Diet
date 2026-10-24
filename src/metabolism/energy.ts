// Resting and total expenditure, body composition and the energy content of weight change.
import { CUNNINGHAM, DEURENBERG, FAT_KCAL_PER_KG, FORBES_KG, LEAN_KCAL_PER_KG, MIFFLIN, PAL, RESTING_SD_REL } from './constants';
import type { ActivityLevel, BodyProfile, Composition, DayKey, Resting, RestingMethod, Sex, Total } from './types';

/** Whole years on `today`; a birth year counts as reached on 1 July (the year's midpoint). */
export function ageYears(p: BodyProfile, today: DayKey): number {
  if (p.age !== undefined) return p.age;
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return year - p.birthYear - (month < 7 ? 1 : 0);
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Mifflin-St Jeor resting expenditure, kcal/day. */
export function mifflinStJeor(sex: Sex, age: number, heightCm: number, weightKg: number): number {
  return MIFFLIN.weight * weightKg + MIFFLIN.height * heightCm - MIFFLIN.age * age + (sex === 'male' ? MIFFLIN.male : MIFFLIN.female);
}

/** Cunningham resting expenditure from lean (fat-free) mass, kcal/day. */
export function cunningham(leanKg: number): number {
  return CUNNINGHAM.intercept + CUNNINGHAM.perKgLean * leanKg;
}

/** Deurenberg body fat % from BMI, age and sex (adults). */
export function deurenbergFatPct(sex: Sex, age: number, bmiValue: number): number {
  return DEURENBERG.bmi * bmiValue + DEURENBERG.age * age + (sex === 'male' ? DEURENBERG.male : 0) + DEURENBERG.intercept;
}

/** Fat and lean mass at the profile's weight: measured when body fat is given, otherwise Deurenberg. */
export function referenceComposition(p: BodyProfile, age: number): Composition {
  const measured = p.bodyFatPct !== undefined;
  const pct = p.bodyFatPct ?? deurenbergFatPct(p.sex, age, bmi(p.weightKg, p.heightCm));
  const fatKg = Math.min(Math.max(pct, 2), 75) / 100 * p.weightKg;
  return { fatKg, leanKg: p.weightKg - fatKg, source: measured ? 'measured' : 'estimated' };
}

/**
 * Composition at another weight, moving along Forbes' curve L = 10.4 ln F + c through the reference point
 * (Hall 2008). Solves F + 10.4 ln F = W - c by Newton's method.
 */
export function compositionAt(ref: Composition, weightKg: number): Composition {
  const c = ref.leanKg - FORBES_KG * Math.log(ref.fatKg);
  let f = Math.max(ref.fatKg * weightKg / (ref.fatKg + ref.leanKg), 0.5);
  for (let i = 0; i < 50; i++) {
    const g = f + FORBES_KG * Math.log(f) + c - weightKg;
    const step = g / (1 + FORBES_KG / f);
    f = Math.max(f - step, 0.1);
    if (Math.abs(step) < 1e-9) break;
  }
  return { fatKg: f, leanKg: weightKg - f, source: ref.source };
}

/** kcal stored or released per kg of weight change at fat mass F (Hall 2008, Forbes partition). */
export function energyDensity(fatKg: number): number {
  const leanShare = FORBES_KG / (FORBES_KG + Math.max(fatKg, 0.1));
  return FAT_KCAL_PER_KG * (1 - leanShare) + LEAN_KCAL_PER_KG * leanShare;
}

/**
 * Which equation to trust. Cunningham needs lean mass, so only a measured body fat qualifies, and it was
 * the accurate one in active adults where Mifflin was not (ten Haaf & Weijs 2014). Otherwise Mifflin, the
 * most reliable in non-obese and obese adults (Frankenfield 2003, 2005).
 */
export function restingMethod(p: BodyProfile): RestingMethod {
  return p.bodyFatPct !== undefined && (p.activity === 'moderate' || p.activity === 'vigorous') ? 'cunningham' : 'mifflin';
}

/** Resting expenditure at `weightKg` (defaults to the profile weight). */
export function restingExpenditure(p: BodyProfile, age: number, weightKg = p.weightKg): Resting {
  const method = restingMethod(p);
  const kcal = method === 'cunningham'
    ? cunningham(compositionAt(referenceComposition(p, age), weightKg).leanKg)
    : mifflinStJeor(p.sex, age, p.heightCm, weightKg);
  return { kcal, method, sdKcal: kcal * RESTING_SD_REL };
}

export function palFor(level: ActivityLevel): { pal: number; low: number; high: number } {
  return PAL[level];
}

/**
 * Total daily expenditure = resting x PAL. Its spread combines the equation's error with a uniform spread
 * of PAL across the chosen band, as independent relative errors.
 */
export function totalExpenditure(p: BodyProfile, age: number, weightKg = p.weightKg): Total {
  const r = restingExpenditure(p, age, weightKg);
  const band = palFor(p.activity);
  const kcal = r.kcal * band.pal;
  const palRel = (band.high - band.low) / Math.sqrt(12) / band.pal;
  const sdKcal = kcal * Math.hypot(RESTING_SD_REL, palRel);
  return { kcal, sdKcal, restingKcal: r.kcal, method: r.method, pal: band.pal, palLow: band.low, palHigh: band.high };
}
