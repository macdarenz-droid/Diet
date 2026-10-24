// Input and output shapes of the metabolism engine (docs/METABOLISM.md). Pure data: no DOM,
// network or storage. Insights are structured; the UI words them.
import type { Goal } from '@/core/models';

export type { Goal };

export type Sex = 'male' | 'female';

/** FAO/WHO/UNU 2004 lifestyle bands (docs/METABOLISM.md, section 2). */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'vigorous';

/** 'YYYY-MM-DD' in the person's local time, as the food log keys days. */
export type DayKey = string;

interface BodyBase {
  sex: Sex;
  heightCm: number;
  /** Last known weight; weigh-ins, when present, take over. */
  weightKg: number;
  /** Measured body fat at `weightKg`, when known. */
  bodyFatPct?: number;
  activity: ActivityLevel;
  pregnant?: boolean;
  breastfeeding?: boolean;
}

export type BodyProfile = BodyBase & ({ age: number; birthYear?: undefined } | { birthYear: number; age?: undefined });

export interface WeighIn {
  /** Epoch ms. */
  at: number;
  kg: number;
}

/** One complete logged day. Days the person did not finish logging should be left out. */
export interface DayIntake {
  day: DayKey;
  kcal: number;
  /** g */
  protein: number;
}

export type ExclusionReason = 'invalid' | 'under-18' | 'pregnant' | 'breastfeeding';

export type RestingMethod = 'mifflin' | 'cunningham';

export interface Composition {
  fatKg: number;
  leanKg: number;
  source: 'measured' | 'estimated';
}

export interface Resting {
  kcal: number;
  method: RestingMethod;
  /** One standard deviation of the equation's error for an individual, kcal/day. */
  sdKcal: number;
}

export interface Total {
  kcal: number;
  sdKcal: number;
  restingKcal: number;
  method: RestingMethod;
  pal: number;
  palLow: number;
  palHigh: number;
}

/** A straight line through weigh-ins over a window. Times are in days. */
export interface TrendFit {
  slopeKgPerDay: number;
  /** Standard error of the slope, inflated for day-to-day water swings (docs/METABOLISM.md, section 6). */
  seKgPerDay: number;
  /** Fitted weight at the middle and at the end of the window. */
  midKg: number;
  endKg: number;
  n: number;
  spanDays: number;
  residualSdKg: number;
}

export interface TrendPoint {
  at: number;
  kg: number;
  trendKg: number;
}

export interface ObservedExpenditure {
  kcal: number;
  seKcal: number;
  fromDay: DayKey;
  toDay: DayKey;
  meanIntakeKcal: number;
  loggedDays: number;
  windowDays: number;
  weighIns: number;
  slopeKgPerDay: number;
  midKg: number;
  /** kcal per kg of weight change used (Hall 2008 with Forbes). */
  energyDensity: number;
  /** False when intake moved by more than the steadiness limit between the window's halves. */
  steady: boolean;
  /** False when the value is under MIN_MEASURED_PAL x resting expenditure: meals are missing from the log. */
  plausible: boolean;
  /** Resting expenditure at the window's weight, kcal/day. */
  restingKcal: number;
}

export type Confidence = 'none' | 'low' | 'medium' | 'high';

export interface ExpenditureEstimate {
  kcal: number;
  sdKcal: number;
  priorKcal: number;
  priorSdKcal: number;
  observed: ObservedExpenditure | null;
  /** Share of the estimate that comes from the person's own data, 0 to 1. */
  observedWeight: number;
  confidence: Confidence;
}

export type TargetLimit = 'max-rate' | 'max-deficit' | 'floor' | 'underweight' | 'no-surplus';

export interface DailyTargets {
  goal: Goal;
  exclusion: ExclusionReason | null;
  /** kcal/day; null when the person is excluded. */
  kcal: number | null;
  maintenanceKcal: number | null;
  floorKcal: number;
  /** Planned weight change, % of body weight per week; negative is loss. */
  ratePctPerWeek: number;
  requestedRatePctPerWeek: number;
  limits: TargetLimit[];
  /** g/day; null when the person is excluded. */
  proteinG: number | null;
}

export type PlateauCause = 'logging-gaps' | 'intake-rise' | 'adaptation' | 'unexplained';

export interface Plateau {
  days: number;
  ratePctPerWeek: number;
  meanIntakeKcal: number;
  previousMeanIntakeKcal: number | null;
  coverage: number;
  cause: PlateauCause;
}

export interface Adaptation {
  probable: boolean;
  baselineKcal: number;
  expectedKcal: number;
  observedKcal: number;
  gapKcal: number;
  gapPct: number;
  seKcal: number;
  baselineKg: number;
  currentKg: number;
  lossPct: number;
  weeksBetween: number;
}

export type Severity = 'high' | 'medium' | 'low';

export type Action =
  | { kind: 'none' }
  | { kind: 'keep' }
  | { kind: 'no-deficit'; kcal: number }
  | { kind: 'raise-intake'; kcal: number }
  | { kind: 'reduce-intake'; kcal: number }
  | { kind: 'return-to-target'; kcal: number }
  | { kind: 'update-target'; kcal: number }
  | { kind: 'diet-break'; weeks: number; kcal: number }
  | { kind: 'raise-protein'; grams: number; targetGrams: number }
  | { kind: 'resistance-train'; sessionsPerWeek: number }
  | { kind: 'add-steps'; stepsPerDay: number }
  | { kind: 'log-and-weigh'; days: number; weighInsPerWeek: number }
  | { kind: 'log-consistently'; days: number };

export type ActionKind = Action['kind'];

interface Base<K extends string, N> {
  id: K;
  severity: Severity;
  numbers: N;
  action: Action;
  /** Further evidence-based steps, most useful first. */
  also: Action[];
}

export type Insight =
  | (Base<'excluded', Record<string, never>> & { reason: ExclusionReason })
  | Base<'underweight', { bmi: number }>
  | Base<'partial-log', { measuredKcal: number; minimumKcal: number; loggedDays: number }>
  | Base<'need-data', { windowDays: number; loggedDays: number; weighIns: number; minLoggedDays: number; minWeighIns: number }>
  | Base<'intake-below-floor', { meanIntakeKcal: number; floorKcal: number; days: number }>
  | Base<'rate-too-fast', { ratePctPerWeek: number; maxPctPerWeek: number; days: number }>
  | Base<'gain-too-fast', { ratePctPerWeek: number; maxPctPerWeek: number; days: number }>
  | Base<'adaptation', { expectedKcal: number; observedKcal: number; gapKcal: number; gapPct: number; lossPct: number; weeks: number }>
  | (Base<'plateau', { days: number; ratePctPerWeek: number; meanIntakeKcal: number; previousMeanIntakeKcal: number }> & { cause: PlateauCause })
  | (Base<'diet-break', { lossPct: number; weeksLosing: number }> & { trigger: 'milestone' | 'duration' })
  | Base<'protein-low', { averageG: number; targetG: number; days: number }>
  | Base<'expenditure-update', { formulaKcal: number; measuredKcal: number; differenceKcal: number }>
  | Base<'rate-too-slow', { ratePctPerWeek: number; plannedPctPerWeek: number; meanIntakeKcal: number; targetKcal: number }>
  | Base<'drift', { ratePctPerWeek: number; days: number }>
  | Base<'trend-on-track', { ratePctPerWeek: number; plannedPctPerWeek: number }>;

export type InsightKind = Insight['id'];

export interface AssessInput {
  profile: BodyProfile;
  goal: Goal;
  today: DayKey;
  weighIns: readonly WeighIn[];
  intakes: readonly DayIntake[];
  /** Chosen rate, % of body weight per week (a positive number); the goal sets the direction. */
  ratePctPerWeek?: number;
}

export interface Assessment {
  exclusion: ExclusionReason | null;
  ageYears: number | null;
  bmi: number | null;
  weightKg: number | null;
  resting: Resting | null;
  expenditure: ExpenditureEstimate | null;
  targets: DailyTargets;
  plateau: Plateau | null;
  adaptation: Adaptation | null;
  insights: Insight[];
}
