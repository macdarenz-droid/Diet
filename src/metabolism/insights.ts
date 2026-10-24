// The whole assessment and its ranked insights. Insights carry kinds and numbers only; the UI words them.
import {
  DIET_BREAK_AFTER_WEEKS, DIET_BREAK_WEEKS, DRIFT, EXPENDITURE_UPDATE_REL, FLOOR_KCAL, GAIN_RATE, GLYCOGEN_SKIP_DAYS, LOSS_RATE,
  MILESTONE_LOSS_PCT, MIN_COVERAGE, MIN_SPAN_DAYS, MIN_WEIGH_INS, PROTEIN, RESISTANCE_SESSIONS_PER_WEEK, STEPS, WINDOW_DAYS,
} from './constants';
import { estimateExpenditure, firstWeighDay, intakesIn } from './adaptive';
import { detectAdaptation, detectPlateau, losingStreak, recentRate } from './detect';
import { ageYears, bmi, compositionAt, energyDensity, referenceComposition, restingExpenditure } from './energy';
import { dailyTargets, screen } from './targets';
import { currentTrendKg, dayNumber, weighInDays } from './trend';
import type { Action, Assessment, AssessInput, Insight, InsightKind, Severity } from './types';

const SEVERITY: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** Tie-break order within a severity: safety first, then what changes the plan, then feedback. */
export const KIND_ORDER: readonly InsightKind[] = [
  'excluded', 'underweight', 'intake-below-floor', 'rate-too-fast', 'gain-too-fast', 'adaptation', 'plateau',
  'diet-break', 'protein-low', 'expenditure-update', 'rate-too-slow', 'drift', 'need-data', 'trend-on-track',
];

export function rankInsights(list: readonly Insight[]): Insight[] {
  return list.slice().sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || KIND_ORDER.indexOf(a.id) - KIND_ORDER.indexOf(b.id));
}

const r10 = (x: number) => Math.round(x / 10) * 10;
const r1 = (x: number) => Math.round(x * 10) / 10;

export function assess(input: AssessInput): Assessment {
  const { profile, goal } = input;
  const today = dayNumber(input.today);
  const age = Number.isFinite(today) ? ageYears(profile, input.today) : NaN;
  const exclusion = Number.isFinite(today) ? screen(profile, age) : 'invalid';
  if (exclusion) {
    const targets = dailyTargets({ profile, goal, today: input.today, ratePctPerWeek: input.ratePctPerWeek });
    const insight: Insight = { id: 'excluded', severity: 'high', reason: exclusion, numbers: {}, action: { kind: 'none' }, also: [] };
    return { exclusion, ageYears: Number.isFinite(age) ? age : null, bmi: null, weightKg: null, resting: null, expenditure: null, targets, plateau: null, adaptation: null, insights: [insight] };
  }

  const trendKg = currentTrendKg(input.weighIns);
  const weightKg = trendKg !== null && screen({ ...profile, weightKg: trendKg }, age) === null ? trendKg : profile.weightKg;
  const bmiNow = bmi(weightKg, profile.heightCm);
  const resting = restingExpenditure(profile, age, weightKg);
  const data = { profile, age, weighIns: input.weighIns, intakes: input.intakes, today };
  const expenditure = estimateExpenditure(data);
  const targets = dailyTargets({ profile, goal, today: input.today, maintenanceKcal: expenditure.kcal, weightKg, ratePctPerWeek: input.ratePctPerWeek });
  const adaptation = detectAdaptation(data);
  const plateau = goal === 'lose' && targets.ratePctPerWeek < 0 ? detectPlateau({ ...data, adaptation }) : null;
  const rate = recentRate(input.weighIns, today);
  const kcal = targets.kcal ?? expenditure.kcal;
  const maintenance = r10(expenditure.kcal);
  const rho = energyDensity(compositionAt(referenceComposition(profile, age), weightKg).fatKg);
  const perPct = weightKg / 100 / 7 * rho;
  const steps = age >= STEPS.olderAge ? STEPS.from60 : STEPS.under60;
  const train: Action = { kind: 'resistance-train', sessionsPerWeek: RESISTANCE_SESSIONS_PER_WEEK };
  const walk: Action = { kind: 'add-steps', stepsPerDay: steps };
  const out: Insight[] = [];

  const last14 = intakesIn(input.intakes, today - 13, today).map(([, d]) => d);
  const mean14 = last14.length ? last14.reduce((s, d) => s + d.kcal, 0) / last14.length : 0;
  const floor = FLOOR_KCAL[profile.sex];

  if (goal === 'lose' && targets.limits.includes('underweight')) {
    out.push({ id: 'underweight', severity: 'high', numbers: { bmi: r1(bmiNow) }, action: { kind: 'no-deficit', kcal }, also: [] });
  }

  // Below the floor and below the target (a person whose maintenance is under the floor is not flagged for eating it).
  if (last14.length >= 7 && mean14 < floor && mean14 < kcal) {
    out.push({ id: 'intake-below-floor', severity: 'high', numbers: { meanIntakeKcal: Math.round(mean14), floorKcal: floor, days: last14.length }, action: { kind: 'raise-intake', kcal }, also: [] });
  }

  const fast = rate !== null && goal === 'lose' && rate.ratePctPerWeek + rate.sePctPerWeek < -LOSS_RATE.max;
  const fastGain = rate !== null && goal === 'muscle' && rate.ratePctPerWeek - rate.sePctPerWeek > GAIN_RATE.max;

  if (rate && fast) {
    // Intake that would bring the loss back to the cap: add the excess rate's energy to what is eaten now.
    const excess = (-rate.ratePctPerWeek - LOSS_RATE.max) * perPct;
    const base = last14.length >= 7 ? mean14 : kcal;
    out.push({ id: 'rate-too-fast', severity: 'high', numbers: { ratePctPerWeek: r1(rate.ratePctPerWeek), maxPctPerWeek: LOSS_RATE.max, days: rate.days }, action: { kind: 'raise-intake', kcal: Math.max(r10(base + excess), kcal) }, also: [] });
  }

  if (rate && fastGain) {
    const excess = (rate.ratePctPerWeek - GAIN_RATE.max) * perPct;
    const base = last14.length >= 7 ? mean14 : kcal;
    out.push({ id: 'gain-too-fast', severity: 'medium', numbers: { ratePctPerWeek: r1(rate.ratePctPerWeek), maxPctPerWeek: GAIN_RATE.max, days: rate.days }, action: { kind: 'reduce-intake', kcal: Math.min(r10(base - excess), kcal) }, also: [] });
  }

  const adapted = adaptation?.probable === true && (goal === 'lose' || goal === 'maintain');
  if (adapted && adaptation) {
    out.push({
      id: 'adaptation',
      severity: 'high',
      numbers: {
        expectedKcal: Math.round(adaptation.expectedKcal),
        observedKcal: Math.round(adaptation.observedKcal),
        gapKcal: Math.round(adaptation.gapKcal),
        gapPct: r1(adaptation.gapPct),
        lossPct: r1(adaptation.lossPct),
        weeks: r1(adaptation.weeksBetween),
      },
      action: goal === 'lose' ? { kind: 'diet-break', weeks: DIET_BREAK_WEEKS, kcal: maintenance } : { kind: 'update-target', kcal },
      also: [train, walk],
    });
  }

  if (plateau) {
    const action: Action =
      plateau.cause === 'logging-gaps' ? { kind: 'log-consistently', days: plateau.days }
      : plateau.cause === 'intake-rise' ? { kind: 'return-to-target', kcal }
      : plateau.cause === 'adaptation' ? { kind: 'diet-break', weeks: DIET_BREAK_WEEKS, kcal: maintenance }
      : kcal < plateau.meanIntakeKcal - 50 ? { kind: 'reduce-intake', kcal }
      : walk;
    out.push({
      id: 'plateau',
      severity: 'medium',
      cause: plateau.cause,
      numbers: { days: plateau.days, ratePctPerWeek: r1(plateau.ratePctPerWeek), meanIntakeKcal: Math.round(plateau.meanIntakeKcal), previousMeanIntakeKcal: Math.round(plateau.previousMeanIntakeKcal ?? 0) },
      action,
      also: action.kind === 'add-steps' ? [train] : [walk, train],
    });
  }

  if (goal === 'lose' && !adapted && targets.ratePctPerWeek < 0) {
    const streak = losingStreak(input.weighIns);
    const trigger = streak.lossPct >= MILESTONE_LOSS_PCT ? 'milestone' : streak.weeks >= DIET_BREAK_AFTER_WEEKS ? 'duration' : null;
    if (trigger) {
      out.push({ id: 'diet-break', severity: 'medium', trigger, numbers: { lossPct: r1(streak.lossPct), weeksLosing: streak.weeks }, action: { kind: 'diet-break', weeks: DIET_BREAK_WEEKS, kcal: maintenance }, also: [train, walk] });
    }
  }

  if (targets.proteinG !== null && last14.length >= 7) {
    const avg = last14.reduce((s, d) => s + (Number.isFinite(d.protein) ? d.protein : 0), 0) / last14.length;
    if (avg < PROTEIN.lowShare * targets.proteinG) {
      const also: Action[] = goal === 'lose' || goal === 'muscle' ? [train] : [];
      out.push({ id: 'protein-low', severity: 'medium', numbers: { averageG: Math.round(avg), targetG: targets.proteinG, days: last14.length }, action: { kind: 'raise-protein', grams: Math.round(targets.proteinG - avg), targetGrams: targets.proteinG }, also });
    }
  }

  if (expenditure.confidence === 'medium' || expenditure.confidence === 'high') {
    const diff = expenditure.kcal - expenditure.priorKcal;
    if (Math.abs(diff) >= EXPENDITURE_UPDATE_REL * expenditure.priorKcal) {
      out.push({ id: 'expenditure-update', severity: 'low', numbers: { formulaKcal: Math.round(expenditure.priorKcal), measuredKcal: Math.round(expenditure.kcal), differenceKcal: Math.round(diff) }, action: { kind: 'update-target', kcal }, also: [] });
    }
  }

  if (rate && !plateau && (goal === 'lose' || goal === 'muscle') && targets.ratePctPerWeek !== 0) {
    const planned = targets.ratePctPerWeek;
    const observed = rate.ratePctPerWeek;
    const tooFast = fast || fastGain || (goal === 'lose' ? observed < -LOSS_RATE.max : observed > GAIN_RATE.max);
    const slow = goal === 'lose' ? observed > planned / 2 : observed < planned / 2;
    if (!tooFast && slow && !(goal === 'lose' && observed >= -0.1)) {
      const meanIntake = last14.length >= 7 ? mean14 : kcal;
      const action: Action = goal === 'lose' && meanIntake > kcal + 50 ? { kind: 'return-to-target', kcal } : { kind: 'update-target', kcal };
      out.push({ id: 'rate-too-slow', severity: 'low', numbers: { ratePctPerWeek: r1(observed), plannedPctPerWeek: r1(planned), meanIntakeKcal: Math.round(meanIntake), targetKcal: kcal }, action, also: goal === 'lose' ? [walk] : [] });
    } else if (!tooFast && !slow) {
      out.push({ id: 'trend-on-track', severity: 'low', numbers: { ratePctPerWeek: r1(observed), plannedPctPerWeek: r1(planned) }, action: { kind: 'keep' }, also: [] });
    }
  }

  if (goal === 'maintain' || goal === 'sugar' || goal === 'heart' || (goal === 'muscle' && targets.ratePctPerWeek === 0)) {
    const d = recentRate(input.weighIns, today, DRIFT.days);
    if (d && d.days >= DRIFT.days && Math.abs(d.ratePctPerWeek) >= DRIFT.pctPerWeek) {
      out.push({ id: 'drift', severity: 'low', numbers: { ratePctPerWeek: r1(d.ratePctPerWeek), days: d.days }, action: { kind: 'update-target', kcal }, also: [] });
    }
  }

  if (expenditure.confidence === 'none' || expenditure.confidence === 'low') {
    const from = today - WINDOW_DAYS + 1;
    const logged = intakesIn(input.intakes, from, today).length;
    const weighed = input.weighIns.filter(w => w.kg > 0 && Number.isFinite(w.at) && Math.floor(weighInDays(w.at)) >= from && Math.floor(weighInDays(w.at)) <= today).length;
    // The earliest day a usable window can end: two weeks of glycogen skip, then two weeks of data.
    const first = firstWeighDay(input.weighIns) ?? today;
    const ready = first + GLYCOGEN_SKIP_DAYS + MIN_SPAN_DAYS - 1;
    out.push({
      id: 'need-data',
      severity: 'low',
      numbers: { windowDays: WINDOW_DAYS, loggedDays: logged, weighIns: weighed, minLoggedDays: Math.ceil(MIN_COVERAGE * WINDOW_DAYS), minWeighIns: MIN_WEIGH_INS },
      action: { kind: 'log-and-weigh', days: ready > today ? ready - today : MIN_SPAN_DAYS, weighInsPerWeek: 7 },
      also: [],
    });
  }

  return { exclusion: null, ageYears: age, bmi: bmiNow, weightKg, resting, expenditure, targets, plateau, adaptation, insights: rankInsights(out) };
}
