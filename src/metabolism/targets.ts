// Daily energy and protein targets per goal, with the safety rules (docs/METABOLISM.md, section 9).
import { ADULT_AGE, FLOOR_KCAL, GAIN_RATE, LOSS_RATE, OVERWEIGHT_BMI, PAL, PROTEIN, UNDERWEIGHT_BMI } from './constants';
import { ageYears, bmi, compositionAt, deurenbergFatPct, energyDensity, referenceComposition, totalExpenditure } from './energy';
import { dayNumber } from './trend';
import type { BodyProfile, DailyTargets, DayKey, ExclusionReason, Goal, TargetLimit } from './types';

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Who the maths must not drive. Checked before anything else; any reason means no energy target. */
export function screen(p: BodyProfile, age: number): ExclusionReason | null {
  const fatOk = p.bodyFatPct === undefined || (finite(p.bodyFatPct) && p.bodyFatPct >= 3 && p.bodyFatPct <= 70);
  if ((p.sex !== 'male' && p.sex !== 'female') || !Object.prototype.hasOwnProperty.call(PAL, p.activity)) return 'invalid';
  if (!finite(p.heightCm) || p.heightCm < 100 || p.heightCm > 250 || !finite(p.weightKg) || p.weightKg < 25 || p.weightKg > 350 || !finite(age) || age > 120 || !fatOk) return 'invalid';
  if (age < ADULT_AGE) return 'under-18';
  if (p.pregnant) return 'pregnant';
  if (p.breastfeeding) return 'breastfeeding';
  return null;
}

/** Protein, g/day. `deficit` says whether the energy target is below maintenance. */
export function proteinTarget(p: BodyProfile, age: number, goal: Goal, weightKg: number, deficit: boolean): number {
  const active = p.activity === 'moderate' || p.activity === 'vigorous';
  const perKg = age >= PROTEIN.olderAge ? (active ? PROTEIN.olderActiveGPerKg : PROTEIN.olderGPerKg) : PROTEIN.baseGPerKg;
  const base = perKg * weightKg;
  if (goal === 'lose' && deficit) return Math.max(base, PROTEIN.loseGPerKgLean * compositionAt(referenceComposition(p, age), weightKg).leanKg);
  if (goal === 'muscle') return Math.max(base, PROTEIN.muscleGPerKg * weightKg);
  return base;
}

/** A surplus only below the body fat Deurenberg predicts at BMI 25 for this age and sex (measured fat counts). */
export function surplusAllowed(p: BodyProfile, age: number, weightKg: number): boolean {
  const comp = compositionAt(referenceComposition(p, age), weightKg);
  return comp.fatKg / weightKg * 100 < deurenbergFatPct(p.sex, age, OVERWEIGHT_BMI);
}

export interface TargetInput {
  profile: BodyProfile;
  goal: Goal;
  today: DayKey;
  /** Measured or estimated maintenance; defaults to the equation estimate. */
  maintenanceKcal?: number;
  /** Current (trend) weight; defaults to the profile weight. */
  weightKg?: number;
  /** % of body weight per week, positive; the goal sets the direction. */
  ratePctPerWeek?: number;
}

export function dailyTargets(i: TargetInput): DailyTargets {
  const { profile: p, goal } = i;
  const age = ageYears(p, i.today);
  const floorKcal = p.sex === 'female' ? FLOOR_KCAL.female : FLOOR_KCAL.male;
  const fallback = goal === 'lose' ? LOSS_RATE.default : goal === 'muscle' ? GAIN_RATE.default : 0;
  const requested = finite(i.ratePctPerWeek) ? Math.abs(i.ratePctPerWeek) : fallback;
  const exclusion = Number.isFinite(dayNumber(i.today)) ? screen(p, age) : 'invalid';
  const weightKg = finite(i.weightKg) && i.weightKg > 0 ? i.weightKg : p.weightKg;
  const maintenance = finite(i.maintenanceKcal) && i.maintenanceKcal > 0 ? i.maintenanceKcal : null;
  if (exclusion || (i.weightKg !== undefined && screen({ ...p, weightKg }, age))) {
    return { goal, exclusion: exclusion ?? 'invalid', kcal: null, maintenanceKcal: null, floorKcal, ratePctPerWeek: 0, requestedRatePctPerWeek: requested, limits: [], proteinG: null };
  }
  const m = maintenance ?? totalExpenditure(p, age, weightKg).kcal;
  const rho = energyDensity(compositionAt(referenceComposition(p, age), weightKg).fatKg);
  /** kcal/day that moves weight by 1% of body weight per week. */
  const perPct = weightKg / 100 / 7 * rho;
  const limits: TargetLimit[] = [];
  let kcal: number;
  let ratePctPerWeek = 0;

  if (goal === 'lose') {
    let target = m;
    if (bmi(weightKg, p.heightCm) < UNDERWEIGHT_BMI) limits.push('underweight');
    else {
      let r = requested;
      if (r > LOSS_RATE.max) { r = LOSS_RATE.max; limits.push('max-rate'); }
      target = m - r * perPct;
      if (target < floorKcal) { target = Math.min(m, floorKcal); limits.push('floor'); }
    }
    // Round up: a smaller deficit never breaks the rate cap or the floor.
    kcal = Math.ceil(target / 10) * 10;
    ratePctPerWeek = Math.min(0, (kcal - m) / perPct);
  } else if (goal === 'muscle') {
    let target = m;
    if (!surplusAllowed(p, age, weightKg)) limits.push('no-surplus');
    else {
      let r = requested;
      if (r > GAIN_RATE.max) { r = GAIN_RATE.max; limits.push('max-rate'); }
      target = m + r * perPct;
    }
    // Round down: a smaller surplus never breaks the gain cap.
    kcal = Math.floor(target / 10) * 10;
    ratePctPerWeek = Math.max(0, (kcal - m) / perPct);
  } else {
    kcal = Math.round(m / 10) * 10;
  }

  const deficit = goal === 'lose' && ratePctPerWeek < 0;
  return {
    goal,
    exclusion: null,
    kcal,
    maintenanceKcal: m,
    floorKcal,
    ratePctPerWeek,
    requestedRatePctPerWeek: requested,
    limits,
    proteinG: Math.round(proteinTarget(p, age, goal, weightKg, deficit)),
  };
}
