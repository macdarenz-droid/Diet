// The person's body, weight log and the metabolism engine's view of them (docs/METABOLISM.md).
import { computed, signal } from '@preact/signals';
import type { Body, Pace, Profile, WeighIn } from '@/core/models';
import { profile } from '@/core/store';
import { allWeighIns, deleteWeighIn, putWeighIn } from '@/core/db';
import { dayKey } from '@/core/dates';
import { today } from '@/core/clock';
import { meals } from '@/slices/today/meals';
import { assess, trendWeights, type Assessment, type AssessInput, type BodyProfile, type DayIntake, type TrendPoint } from '@/metabolism';

const DAY_MS = 864e5;

export const weighIns = signal<WeighIn[]>([]);

export async function loadWeighIns(): Promise<void> {
  try { weighIns.value = await allWeighIns(); } catch { weighIns.value = []; }
}

/** Logs a weight now (one per day: a second entry the same day replaces the first). */
export async function logWeight(kg: number, at = Date.now()): Promise<boolean> {
  const day = dayKey(at);
  const sameDay = weighIns.value.filter(w => dayKey(w.at) === day);
  const w = { at, kg: Math.round(kg * 10) / 10 };
  weighIns.value = [...weighIns.value.filter(x => dayKey(x.at) !== day), w].sort((a, b) => a.at - b.at);
  try {
    for (const old of sameDay) await deleteWeighIn(old.at);
    await putWeighIn(w);
    return true;
  } catch { return false; }
}

/** Deletes one weigh-in and returns it for Undo, or null when it could not be deleted. */
export async function removeWeight(at: number): Promise<WeighIn | null> {
  const w = weighIns.value.find(x => x.at === at);
  if (!w) return null;
  weighIns.value = weighIns.value.filter(x => x.at !== at);
  try { await deleteWeighIn(at); return w; } catch { weighIns.value = [...weighIns.value, w].sort((a, b) => a.at - b.at); return null; }
}

/** Puts back a weigh-in removed by removeWeight, unless that day has a newer one by then. */
export async function restoreWeight(w: WeighIn): Promise<void> {
  if (weighIns.value.some(x => dayKey(x.at) === dayKey(w.at))) return;
  weighIns.value = [...weighIns.value, w].sort((a, b) => a.at - b.at);
  try { await putWeighIn(w); } catch { /* stays in memory for this session */ }
}

/** Per-week pace by goal, as a positive % of body weight (the engine caps both). */
export const PACE: Record<'lose' | 'muscle', Record<Pace, number>> = {
  lose: { gentle: 0.25, steady: 0.5, fast: 1.0 },
  muscle: { gentle: 0.1, steady: 0.25, fast: 0.5 },
};

export function paceFor(p: Pick<Profile, 'goal' | 'pace'>): number | undefined {
  return p.goal === 'lose' || p.goal === 'muscle' ? PACE[p.goal][p.pace] : undefined;
}

/** Birth years the form accepts: up to 110 years back (the engine stops at 120). */
export function birthYears(now = Date.now()): { min: number; max: number } {
  const y = new Date(now).getFullYear();
  return { min: y - 110, max: y };
}

export function complete(b: Partial<Body> | undefined): b is Body {
  const years = birthYears();
  return !!b && !!b.birthYear && b.birthYear >= years.min && b.birthYear <= years.max && !!b.heightCm && b.heightCm >= 100 && b.heightCm <= 250 && !!b.sex && !!b.activity;
}

/** A logged day under this is taken as unfinished: diets below 800 kcal a day need medical supervision
 * [Jensen 2014, docs/METABOLISM.md section 5], so such a day is far more often a half-logged one. */
export const PARTIAL_DAY_KCAL = 800;

/** Finished days only: today is still being logged, and a day under PARTIAL_DAY_KCAL would read as
 * a low-intake day and pull the measured maintenance down. Every earlier day is passed, because the
 * adaptation check compares windows months apart. */
type Logged = { at: number; totals: { kcal: number; protein: number } };

export function intakesFrom(list: readonly Logged[], todayKey: string, days = Infinity, minKcal = PARTIAL_DAY_KCAL): DayIntake[] {
  const by = new Map<string, DayIntake>();
  for (const m of list) {
    const d = dayKey(m.at);
    if (d >= todayKey) continue;
    const cur = by.get(d) ?? { day: d, kcal: 0, protein: 0 };
    cur.kcal += m.totals.kcal;
    cur.protein += m.totals.protein;
    by.set(d, cur);
  }
  const done = [...by.values()].filter(d => d.kcal >= minKcal).sort((a, b) => (a.day < b.day ? -1 : 1));
  return Number.isFinite(days) ? done.slice(-days) : done;
}

export function bodyProfile(b: Body, weights: readonly WeighIn[]): BodyProfile | null {
  const last = weights.at(-1);
  if (!last) return null;
  return {
    sex: b.sex,
    birthYear: b.birthYear,
    heightCm: b.heightCm,
    weightKg: last.kg,
    activity: b.activity,
    ...(b.bodyFatPct ? { bodyFatPct: b.bodyFatPct } : {}),
    ...(b.pregnant ? { pregnant: true } : {}),
    ...(b.breastfeeding ? { breastfeeding: true } : {}),
  };
}

/** Assesses with days under PARTIAL_DAY_KCAL left out. When at least half of the last 14 days are
 * that low and the weight agrees with them (the measured burn with them kept is believable), they
 * are what the person eats, and they are kept, so the low-intake card can show. */
export function assessLog(input: Omit<AssessInput, 'intakes'>, list: readonly Logged[]): Assessment {
  const done = assess({ ...input, intakes: intakesFrom(list, input.today) });
  const all = intakesFrom(list, input.today, Infinity, 0);
  const since = dayKey(new Date(`${input.today}T12:00:00`).getTime() - 14 * DAY_MS);
  if (all.filter(d => d.day >= since && d.kcal < PARTIAL_DAY_KCAL).length < 7) return done;
  const raw = assess({ ...input, intakes: all });
  return raw.expenditure?.observed?.plausible ? raw : done;
}

export const assessment = computed<Assessment | null>(() => {
  const p = profile.value;
  if (!complete(p.body)) return null;
  const bp = bodyProfile(p.body, weighIns.value);
  if (!bp) return null;
  try {
    return assessLog({ profile: bp, goal: p.goal, today: today.value, weighIns: weighIns.value, ratePctPerWeek: paceFor(p) }, meals.value);
  } catch { return null; }
});

/** Today's energy (kcal) and protein (g) targets: the engine's when it has them, else the manual ones. */
export const activeTargets = computed(() => {
  const p = profile.value;
  const a = assessment.value;
  const auto = p.autoTargets && a !== null && a.targets.kcal !== null;
  return {
    auto,
    energy: auto ? a!.targets.kcal! : p.targets.energy,
    protein: auto && a!.targets.proteinG !== null ? a!.targets.proteinG! : p.targets.protein,
    maintenance: a?.targets.maintenanceKcal ?? null,
  };
});

/** Trend change over the last week: from the trend point closest to 7 days before the latest one
 * (5 to 10 days back), and only while the latest weigh-in is under a week old. */
export function weekChange(points: readonly TrendPoint[], now: number): number | null {
  const last = points.at(-1);
  if (!last || now - last.at > 7 * DAY_MS) return null;
  const target = last.at - 7 * DAY_MS;
  let best: TrendPoint | null = null;
  for (const p of points) {
    if (p.at < last.at - 10 * DAY_MS || p.at > last.at - 5 * DAY_MS) continue;
    if (!best || Math.abs(p.at - target) < Math.abs(best.at - target)) best = p;
  }
  return best ? last.trendKg - best.trendKg : null;
}

export const trend = computed(() => {
  const w = weighIns.value;
  if (!w.length) return null;
  const points = trendWeights(w);
  const last = points.at(-1);
  // Recomputed when the day changes, so "this week" does not go stale overnight.
  void today.value;
  return { kg: last?.trendKg ?? w.at(-1)!.kg, last: w.at(-1)!, points, weekChange: weekChange(points, Date.now()) };
});
