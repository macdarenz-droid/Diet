// Metabolism engine (docs/METABOLISM.md). Worked examples are computed by hand in the comments; the
// synthetic scenarios use a seeded generator, so every run sees the same numbers.
import { describe, expect, it } from 'vitest';
import {
  assess, compositionAt, cunningham, dailyTargets, dayNumber, detectAdaptation, deurenbergFatPct, energyDensity, estimateExpenditure,
  mifflinStJeor, observedExpenditure, rankInsights, referenceComposition, restingExpenditure, restingMethod, totalExpenditure, trendFit,
  trendWeights,
} from '@/metabolism';
import type { ActivityLevel, BodyProfile, DayIntake, Goal, Insight, Sex, WeighIn } from '@/metabolism';
import { RULE_OF_THUMB_KCAL_PER_KG } from '@/metabolism/constants';

// The documented limits (docs/METABOLISM.md, section 9), written out so a changed constant fails here.
const MAX_LOSS = 1.0;
const MAX_GAIN = 0.5;
const FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };

// ---- Synthetic data -------------------------------------------------------------------------------

/** Standard normal numbers from a seeded mulberry32 generator. */
function normal(seed: number): () => number {
  let a = seed >>> 0;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(Math.max(u(), 1e-12))) * Math.cos(2 * Math.PI * u());
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Local 7 am on day d of the study (day 0 = Monday 5 January 2026), so day keys match in any time zone. */
const at = (d: number) => new Date(2026, 0, 5 + d, 7, 0);
const key = (d: number) => { const x = at(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

interface Sim {
  days: number;
  seed: number;
  /** Intake actually eaten (and logged) on day d, before noise. */
  intake: (d: number) => number;
  /** True expenditure on day d at weight w. */
  tdee: (d: number, w: number) => number;
  noiseKg?: number;
  noiseKcal?: number;
  protein?: number;
  /** Logged on day d (default every day). */
  logged?: (d: number) => boolean;
  /** Extra weight on the scale (water) on day d. */
  water?: (d: number) => number;
}

/** Day-by-day energy balance: weight moves by (intake - expenditure) / energy density (Hall 2008, Forbes). */
function simulate(p: BodyProfile, s: Sim) {
  const g = normal(s.seed);
  const age = typeof p.age === 'number' ? p.age : 40;
  const ref = referenceComposition(p, age);
  let w = p.weightKg;
  const weighIns: WeighIn[] = [];
  const intakes: DayIntake[] = [];
  const truth: number[] = [];
  for (let d = 0; d < s.days; d++) {
    weighIns.push({ at: at(d).getTime(), kg: w + (s.water?.(d) ?? 0) + g() * (s.noiseKg ?? 0.5) });
    const eat = s.intake(d) + g() * (s.noiseKcal ?? 250);
    if (s.logged?.(d) ?? true) intakes.push({ day: key(d), kcal: eat, protein: s.protein ?? 200 });
    const tdee = s.tdee(d, w);
    truth.push(tdee);
    w += (eat - tdee) / energyDensity(compositionAt(ref, w).fatKg);
  }
  return { weighIns, intakes, truth, today: key(s.days - 1), todayN: dayNumber(key(s.days - 1)), finalKg: w };
}

const man: BodyProfile = { sex: 'male', age: 40, heightCm: 180, weightKg: 100, activity: 'light' };
const R100 = mifflinStJeor('male', 40, 180, 100);

/** The owner's scenario: 2000 kcal a day against 2900 kcal of expenditure at 100 kg, which falls with mass
 * by the resting equation; once 10% is lost (90 kg) a further `adapt` kcal/day drop ramps in over 14 days. */
function tenPercent(adapt: number, seed: number, days = 160) {
  let crossed = -1;
  return simulate(man, {
    days, seed, intake: () => 2000,
    tdee: (d, w) => {
      if (crossed < 0 && w <= 90) crossed = d;
      const extra = crossed < 0 ? 0 : Math.min(1, (d - crossed) / 14) * adapt;
      return 2900 * mifflinStJeor('male', 40, 180, w) / R100 - extra;
    },
  });
}

const ids = (list: readonly Insight[]) => list.map(i => i.id);

// ---- Resting and total expenditure ----------------------------------------------------------------

describe('resting expenditure', () => {
  it('Mifflin-St Jeor, man 30 y, 180 cm, 80 kg: 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780', () => {
    expect(mifflinStJeor('male', 30, 180, 80)).toBe(1780);
  });
  it('Mifflin-St Jeor, woman 40 y, 165 cm, 70 kg: 700 + 1031.25 - 200 - 161 = 1370.25', () => {
    expect(mifflinStJeor('female', 40, 165, 70)).toBeCloseTo(1370.25, 6);
  });
  it('Cunningham, 60 kg lean mass: 500 + 22*60 = 1820', () => {
    expect(cunningham(60)).toBe(1820);
  });
  it('uses Cunningham only with measured body fat in an active person', () => {
    expect(restingMethod({ ...man })).toBe('mifflin');
    expect(restingMethod({ ...man, bodyFatPct: 20 })).toBe('mifflin');
    expect(restingMethod({ ...man, bodyFatPct: 20, activity: 'moderate' })).toBe('cunningham');
    // 100 kg at 20% fat = 80 kg lean: 500 + 22*80 = 2260.
    expect(restingExpenditure({ ...man, bodyFatPct: 20, activity: 'vigorous' }, 40).kcal).toBeCloseTo(2260, 6);
  });
  it('total = resting x PAL with its spread: 1780 * 1.55 = 2759; SD = 2759 * hypot(0.082, 0.29/sqrt(12)/1.55) = 270.9', () => {
    const t = totalExpenditure({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: 'light' }, 30);
    expect(t.kcal).toBeCloseTo(2759, 6);
    expect(t.sdKcal).toBeCloseTo(270.9, 0);
    expect([t.palLow, t.palHigh]).toEqual([1.4, 1.69]);
  });
});

describe('body composition and energy density', () => {
  it('Deurenberg, man 40 y, 100 kg, 180 cm: BMI 30.864; 1.2*30.864 + 0.23*40 - 10.8 - 5.4 = 30.04%', () => {
    expect(deurenbergFatPct('male', 40, 100 / 1.8 ** 2)).toBeCloseTo(30.04, 2);
  });
  it('energy density at 30 kg fat: lean share 10.4/40.4 = 0.2574; 9440.7*0.7426 + 1816.4*0.2574 = 7478 kcal/kg', () => {
    expect(energyDensity(30)).toBeCloseTo(7478, 0);
    // At 10 kg fat the lean share is 0.5098: 9440.7*0.4902 + 1816.4*0.5098 = 5554 kcal/kg.
    expect(energyDensity(10)).toBeCloseTo(5554, 0);
    // The 3500 kcal/lb rule (7716 kcal/kg) is only near the dynamic value for people with a lot of fat.
    expect(RULE_OF_THUMB_KCAL_PER_KG).toBeCloseTo(7716, 0);
    expect(energyDensity(60)).toBeGreaterThan(7900);
  });
  it('moves along the Forbes curve: 100 kg (30 fat, 70 lean) down to 90 kg keeps 22.84 kg fat', () => {
    // F + 10.4 ln F = 90 - (70 - 10.4 ln 30) = 55.37, solved by F = 22.84.
    const c = compositionAt({ fatKg: 30, leanKg: 70, source: 'measured' }, 90);
    expect(c.fatKg).toBeCloseTo(22.84, 2);
    expect(c.leanKg - 10.4 * Math.log(c.fatKg)).toBeCloseTo(70 - 10.4 * Math.log(30), 9);
  });
});

// ---- Trend weight ---------------------------------------------------------------------------------

describe('trend weight', () => {
  const g = normal(9);
  const truth = (d: number) => 90 - 0.1 * d;
  const noisy: WeighIn[] = Array.from({ length: 60 }, (_, d) => ({ at: at(d).getTime(), kg: truth(d) + g() * 0.5 }));

  it('smooths 0.5 kg noise to well under half its size while following a steady loss', () => {
    const t = trendWeights(noisy);
    const rms = (f: (i: number) => number) => Math.sqrt(t.reduce((s, _, i) => s + f(i) ** 2, 0) / t.length);
    const raw = rms(i => t[i]!.kg - truth(i));
    const smooth = rms(i => t[i]!.trendKg - truth(i));
    expect(smooth).toBeLessThan(0.5 * raw);
    // No lag: the middle of the series sits on the true line on average.
    const mid = t.slice(20, 40).reduce((s, p, i) => s + (p.trendKg - truth(i + 20)), 0) / 20;
    expect(Math.abs(mid)).toBeLessThan(0.15);
  });
  it('fits the slope over a window: -0.1 kg/day recovered within 0.02', () => {
    const fit = trendFit(noisy, dayNumber(key(0)), dayNumber(key(59)))!;
    expect(fit.slopeKgPerDay).toBeCloseTo(-0.1, 1);
    expect(Math.abs(fit.slopeKgPerDay + 0.1)).toBeLessThan(0.02);
  });
  it('is not dragged by a mistyped weigh-in', () => {
    const typo = noisy.map((w, i) => (i === 30 ? { ...w, kg: w.kg + 8 } : w));
    const clean = trendWeights(noisy);
    const t = trendWeights(typo);
    expect(Math.abs(t[30]!.trendKg - clean[30]!.trendKg)).toBeLessThan(0.3);
    expect(Math.abs(t[31]!.trendKg - clean[31]!.trendKg)).toBeLessThan(0.3);
    const fit = trendFit(typo, dayNumber(key(0)), dayNumber(key(59)))!;
    expect(Math.abs(fit.slopeKgPerDay + 0.1)).toBeLessThan(0.02);
    // At the end of a 28-day window a typo has the most pull: kept, +8 kg would tilt the slope by about
    // 8 * 13.5 / 1827 = 0.059 kg/day. Removed, the fit equals the fit without that weigh-in.
    const last = noisy.map((w, i) => (i === 59 ? { ...w, kg: w.kg + 8 } : w));
    const end = trendFit(last, dayNumber(key(32)), dayNumber(key(59)))!;
    const without = trendFit(noisy.slice(0, 59), dayNumber(key(32)), dayNumber(key(59)))!;
    expect(end.slopeKgPerDay).toBeCloseTo(without.slopeKgPerDay, 9);
    expect(end.n).toBe(27);
  });
  it('rejects malformed day keys', () => {
    expect(dayNumber('2026-02-30')).toBeNaN();
    expect(dayNumber('26-1-5')).toBeNaN();
    expect(dayNumber('2026-01-05') - dayNumber('2026-01-04')).toBe(1);
  });
});

// ---- Adaptive expenditure -------------------------------------------------------------------------

describe('expenditure from intake and the weight trend', () => {
  const known = (seed: number, days: number) => simulate(man, { days, seed, intake: () => 2100, tdee: () => 2600 });

  it('recovers a known 2600 kcal/day within 150 kcal after 12 weeks, though the equation says about 2940', () => {
    const s = known(7, 84);
    const e = estimateExpenditure({ profile: man, age: 40, weighIns: s.weighIns, intakes: s.intakes, today: s.todayN });
    expect(e.priorKcal).toBeGreaterThan(2900);
    expect(Math.abs(e.kcal - 2600)).toBeLessThan(150);
    expect(Math.abs(e.kcal - 2600)).toBeLessThan(2 * e.sdKcal);
    expect(e.confidence).toBe('high');
    // The latest window alone is within two of its standard errors.
    expect(Math.abs(e.observed!.kcal - 2600)).toBeLessThan(2 * e.observed!.seKcal);
  });
  it('reports a 95% interval near +-350 kcal/day for 28 daily weights, as Hall & Chow 2011 found', () => {
    const s = known(13, 42);
    const o = observedExpenditure({ profile: man, age: 40, weighIns: s.weighIns, intakes: s.intakes, fromDay: dayNumber(key(14)), toDay: dayNumber(key(41)) })!;
    expect(1.96 * o.seKcal).toBeGreaterThan(300);
    expect(1.96 * o.seKcal).toBeLessThan(420);
  });
  it('has no material bias across 20 seeds (mean error under 60 kcal)', () => {
    const errs = Array.from({ length: 20 }, (_, i) => {
      const s = known(300 + i, 84);
      return estimateExpenditure({ profile: man, age: 40, weighIns: s.weighIns, intakes: s.intakes, today: s.todayN }).kcal - 2600;
    });
    expect(Math.abs(errs.reduce((a, b) => a + b, 0) / errs.length)).toBeLessThan(60);
  });
  it('gains confidence as data accumulates', () => {
    const s = known(11, 84);
    const upTo = (d: number) => estimateExpenditure({ profile: man, age: 40, weighIns: s.weighIns.slice(0, d + 1), intakes: s.intakes.slice(0, d + 1), today: dayNumber(key(d)) });
    const early = upTo(20), month = upTo(35), quarter = upTo(83);
    expect(early.confidence).toBe('none');
    expect(early.observedWeight).toBe(0);
    expect(early.kcal).toBeCloseTo(early.priorKcal, 6);
    expect(month.observedWeight).toBeGreaterThan(0);
    expect(quarter.observedWeight).toBeGreaterThan(month.observedWeight);
    expect(quarter.sdKcal).toBeLessThan(month.sdKcal);
  });
  it('skips the first two weeks, when glycogen water drops the scale', () => {
    // At maintenance, but 1.5 kg of water leaves over the first week.
    const s = simulate(man, { days: 42, seed: 5, intake: () => 2600, tdee: () => 2600, water: d => (d < 7 ? 1.5 * (1 - d / 7) : 0) });
    const e = estimateExpenditure({ profile: man, age: 40, weighIns: s.weighIns, intakes: s.intakes, today: s.todayN });
    expect(Math.abs(e.observed!.kcal - 2600)).toBeLessThan(200);
  });
  it('sets aside a window where intake jumped (glycogen and water refill)', () => {
    const s = simulate(man, { days: 42, seed: 6, intake: d => (d < 28 ? 2000 : 2900), tdee: () => 2600 });
    const e = estimateExpenditure({ profile: man, age: 40, weighIns: s.weighIns, intakes: s.intakes, today: s.todayN });
    expect(e.observed!.steady).toBe(false);
    expect(e.confidence).toBe('none');
  });
  it('needs four weigh-ins and half the days logged', () => {
    const s = known(12, 42);
    const w = { profile: man, age: 40, fromDay: dayNumber(key(14)), toDay: dayNumber(key(41)) };
    expect(observedExpenditure({ ...w, weighIns: s.weighIns.filter((_, i) => i % 10 === 0), intakes: s.intakes })).toBeNull();
    expect(observedExpenditure({ ...w, weighIns: s.weighIns, intakes: s.intakes.filter((_, i) => i % 3 === 0) })).toBeNull();
    expect(observedExpenditure({ ...w, weighIns: s.weighIns, intakes: s.intakes })).not.toBeNull();
  });
});

// ---- Targets --------------------------------------------------------------------------------------

describe('daily targets', () => {
  const today = '2026-06-01';
  const fat30 = { ...man, bodyFatPct: 30 };

  it('loss at 0.5%/week: 100 kg x 0.5% = 0.5 kg/week = 0.0714 kg/day x 7478 = 534 kcal; 2900 - 534 = 2366, rounded up to 2370', () => {
    const t = dailyTargets({ profile: fat30, goal: 'lose', today, maintenanceKcal: 2900 });
    expect(t.kcal).toBe(2370);
    expect(t.ratePctPerWeek).toBeCloseTo(-(2900 - 2370) / (7478 / 7), 2);
    expect(t.limits).toEqual([]);
    // Protein: 2.3 g x 70 kg lean = 161 g.
    expect(t.proteinG).toBe(161);
  });
  it('caps the rate at 1%/week: 2900 - 1068 = 1832, rounded up to 1840', () => {
    const t = dailyTargets({ profile: fat30, goal: 'lose', today, maintenanceKcal: 2900, ratePctPerWeek: 2 });
    expect(t.kcal).toBe(1840);
    expect(t.limits).toContain('max-rate');
    expect(t.ratePctPerWeek).toBeGreaterThanOrEqual(-MAX_LOSS);
  });
  it('holds the floor: woman 60 kg at 1%/week would need 1500 - 570 = 930 kcal; the target stays at 1200', () => {
    const woman: BodyProfile = { sex: 'female', age: 30, heightCm: 165, weightKg: 60, bodyFatPct: 30, activity: 'light' };
    const t = dailyTargets({ profile: woman, goal: 'lose', today, maintenanceKcal: 1500, ratePctPerWeek: 1 });
    expect(t.kcal).toBe(1200);
    expect(t.limits).toContain('floor');
  });
  it('builds muscle at 0.25%/week: 75 kg, 15% fat; 0.1875 kg/week x 5778 kcal/kg / 7 = 155; 2800 + 155 = 2955, rounded down to 2950', () => {
    const lean: BodyProfile = { sex: 'male', age: 30, heightCm: 180, weightKg: 75, bodyFatPct: 15, activity: 'moderate' };
    const t = dailyTargets({ profile: lean, goal: 'muscle', today, maintenanceKcal: 2800 });
    expect(t.kcal).toBe(2950);
    expect(t.proteinG).toBe(120);
    const fast = dailyTargets({ profile: lean, goal: 'muscle', today, maintenanceKcal: 2800, ratePctPerWeek: 3 });
    expect(fast.ratePctPerWeek).toBeLessThanOrEqual(MAX_GAIN);
    expect(fast.limits).toContain('max-rate');
  });
  it('gives no surplus for muscle above BMI 25 (estimated fat)', () => {
    const t = dailyTargets({ profile: man, goal: 'muscle', today, maintenanceKcal: 2900 });
    expect(t.limits).toContain('no-surplus');
    expect(t.kcal).toBe(2900);
    expect(t.ratePctPerWeek).toBe(0);
  });
  it('keeps maintenance for maintain, sugar and heart, with RDA-level protein (0.83 g/kg)', () => {
    for (const goal of ['maintain', 'sugar', 'heart'] as Goal[]) {
      const t = dailyTargets({ profile: { ...man, weightKg: 80 }, goal, today, maintenanceKcal: 2504 });
      expect(t.kcal).toBe(2500);
      expect(t.proteinG).toBe(66);
    }
  });
  it('raises protein after 65: 1.0 g/kg, or 1.2 when active', () => {
    const older: BodyProfile = { ...man, age: 70, weightKg: 80, activity: 'sedentary' };
    expect(dailyTargets({ profile: older, goal: 'maintain', today }).proteinG).toBe(80);
    expect(dailyTargets({ profile: { ...older, activity: 'moderate' }, goal: 'maintain', today }).proteinG).toBe(96);
  });
});

// ---- Safety ---------------------------------------------------------------------------------------

describe('safety', () => {
  const today = '2026-03-01';

  it('gives no energy target to anyone under 18, pregnant or breastfeeding, or with invalid input', () => {
    const cases: [BodyProfile, string][] = [
      [{ ...man, age: 17 }, 'under-18'],
      [{ sex: 'female', birthYear: 2008, heightCm: 165, weightKg: 60, activity: 'light' }, 'under-18'],
      [{ sex: 'female', age: 30, heightCm: 165, weightKg: 70, activity: 'light', pregnant: true }, 'pregnant'],
      [{ sex: 'female', age: 30, heightCm: 165, weightKg: 70, activity: 'light', breastfeeding: true }, 'breastfeeding'],
      [{ ...man, weightKg: Number.NaN }, 'invalid'],
      [{ ...man, heightCm: 0 }, 'invalid'],
      [{ ...man, activity: 'toString' as ActivityLevel }, 'invalid'],
    ];
    for (const [profile, reason] of cases) {
      for (const goal of ['lose', 'maintain', 'muscle', 'sugar', 'heart'] as Goal[]) {
        const t = dailyTargets({ profile, goal, today, maintenanceKcal: 2500 });
        expect(t.exclusion).toBe(reason);
        expect(t.kcal).toBeNull();
        expect(t.proteinG).toBeNull();
        const a = assess({ profile, goal, today, weighIns: [], intakes: [] });
        expect(ids(a.insights)).toEqual(['excluded']);
        expect(a.targets.kcal).toBeNull();
      }
    }
  });
  it('counts a birth year as reached at mid-year: born 2008 is 17 in March 2026 and 18 in August', () => {
    const teen: BodyProfile = { sex: 'female', birthYear: 2008, heightCm: 165, weightKg: 60, activity: 'light' };
    expect(dailyTargets({ profile: teen, goal: 'lose', today: '2026-03-01' }).exclusion).toBe('under-18');
    expect(dailyTargets({ profile: teen, goal: 'lose', today: '2026-08-01' }).exclusion).toBeNull();
  });
  it('gives no deficit below BMI 18.5', () => {
    const thin: BodyProfile = { sex: 'female', age: 25, heightCm: 170, weightKg: 52, activity: 'light' };
    const t = dailyTargets({ profile: thin, goal: 'lose', today, maintenanceKcal: 2000, ratePctPerWeek: 1 });
    expect(t.limits).toContain('underweight');
    expect(t.kcal).toBeGreaterThanOrEqual(2000);
    expect(t.ratePctPerWeek).toBe(0);
    const a = assess({ profile: thin, goal: 'lose', today, weighIns: [], intakes: [] });
    expect(a.insights[0]).toMatchObject({ id: 'underweight', severity: 'high', action: { kind: 'no-deficit' } });
  });
  it('never sets a deficit below the floor or faster than 1%/week, and never a gain above 0.5%/week', () => {
    for (const sex of ['male', 'female'] as Sex[]) for (const age of [18, 35, 60, 85]) for (const weightKg of [48, 70, 95, 140, 200])
      for (const heightCm of [150, 175, 195]) for (const activity of ['sedentary', 'light', 'moderate', 'vigorous'] as ActivityLevel[])
        for (const ratePctPerWeek of [0.1, 0.5, 1, 1.5, 5]) for (const maintenanceKcal of [undefined, 1100, 1900, 3400]) {
          const profile: BodyProfile = { sex, age, heightCm, weightKg, activity };
          const lose = dailyTargets({ profile, goal: 'lose', today, maintenanceKcal, ratePctPerWeek });
          const m = lose.maintenanceKcal!;
          expect(lose.ratePctPerWeek).toBeGreaterThanOrEqual(-MAX_LOSS - 1e-9);
          if (lose.kcal! < m) expect(lose.kcal!).toBeGreaterThanOrEqual(FLOOR[sex]);
          const gain = dailyTargets({ profile, goal: 'muscle', today, maintenanceKcal, ratePctPerWeek });
          expect(gain.ratePctPerWeek).toBeLessThanOrEqual(MAX_GAIN + 1e-9);
        }
  });
  it('flags logged intake under the floor and asks for at least the floor', () => {
    const woman: BodyProfile = { sex: 'female', age: 30, heightCm: 165, weightKg: 70, activity: 'light' };
    const s = simulate(woman, { days: 30, seed: 3, intake: () => 950, tdee: () => 2100, noiseKcal: 80 });
    const a = assess({ profile: woman, goal: 'lose', today: s.today, weighIns: s.weighIns, intakes: s.intakes });
    const hit = a.insights.find(i => i.id === 'intake-below-floor');
    expect(hit).toMatchObject({ severity: 'high', numbers: { floorKcal: 1200 }, action: { kind: 'raise-intake' } });
    expect(hit!.action.kind === 'raise-intake' && hit!.action.kcal).toBeGreaterThanOrEqual(1200);
  });
  it('flags loss faster than 1%/week and asks for more food', () => {
    // 1200 kcal against 2900: 1700 / 7478 = 0.23 kg/day, about 1.6% of 100 kg a week.
    const s = simulate(man, { days: 50, seed: 4, intake: () => 1200, tdee: (_, w) => 2900 * mifflinStJeor('male', 40, 180, w) / R100 });
    const a = assess({ profile: man, goal: 'lose', today: s.today, weighIns: s.weighIns, intakes: s.intakes });
    const hit = a.insights.find(i => i.id === 'rate-too-fast');
    expect(hit).toBeDefined();
    expect(hit!.numbers.ratePctPerWeek).toBeLessThan(-1);
    expect(hit!.action.kind === 'raise-intake' && hit!.action.kcal).toBeGreaterThan(1300);
  });
});

// ---- The owner's 10% scenario ---------------------------------------------------------------------

describe('adaptation after 10% loss', () => {
  it('flags probable adaptation and suggests a two-week maintenance break, resistance training and steps', () => {
    const s = tenPercent(300, 1);
    const a = assess({ profile: man, goal: 'lose', today: s.today, weighIns: s.weighIns, intakes: s.intakes });
    expect(a.adaptation?.probable).toBe(true);
    const first = a.insights[0]!;
    expect(first.id).toBe('adaptation');
    expect(first.severity).toBe('high');
    if (first.id !== 'adaptation') throw new Error('unreachable');
    // A 300 kcal/day drop beyond mass, measured from noisy data.
    expect(first.numbers.gapKcal).toBeGreaterThan(150);
    expect(first.numbers.gapKcal).toBeLessThan(450);
    expect(first.numbers.expectedKcal).toBeGreaterThan(first.numbers.observedKcal);
    expect(first.numbers.lossPct).toBeGreaterThan(8);
    expect(first.action).toMatchObject({ kind: 'diet-break', weeks: 2 });
    expect(first.action.kind === 'diet-break' && Math.abs(first.action.kcal - s.truth[s.truth.length - 1]!)).toBeLessThan(250);
    expect(first.also.map(x => x.kind)).toEqual(['resistance-train', 'add-steps']);
    // The measured maintenance is now well below the equation's.
    expect(a.expenditure!.kcal).toBeLessThan(a.expenditure!.priorKcal - 150);
  });
  it('does not flag adaptation when expenditure only follows mass, but still offers the break at 10%', () => {
    const s = tenPercent(0, 1);
    const a = assess({ profile: man, goal: 'lose', today: s.today, weighIns: s.weighIns, intakes: s.intakes });
    expect(a.adaptation?.probable).toBe(false);
    expect(ids(a.insights)).not.toContain('adaptation');
    // Losing about 0.8%/week: inside the cap, so no warning from noise.
    expect(ids(a.insights)).not.toContain('rate-too-fast');
    expect(a.insights.find(i => i.id === 'diet-break')).toMatchObject({ trigger: 'milestone', action: { kind: 'diet-break', weeks: 2 } });
  });
  it('detects it in most seeds and never in the control', () => {
    let hits = 0, false_ = 0;
    for (let seed = 40; seed < 52; seed++) {
      const on = tenPercent(300, seed), off = tenPercent(0, seed);
      if (detectAdaptation({ profile: man, age: 40, weighIns: on.weighIns, intakes: on.intakes, today: on.todayN })?.probable) hits++;
      if (detectAdaptation({ profile: man, age: 40, weighIns: off.weighIns, intakes: off.intakes, today: off.todayN })?.probable) false_++;
    }
    expect(hits).toBeGreaterThanOrEqual(10);
    expect(false_).toBe(0);
  });
  it('does not mistake noise for adaptation: 1 kg scale noise, weighed every third day', () => {
    // Here gaps above 5% of expected happen by chance in about a third of runs; the standard-error test stops them.
    for (let seed = 1; seed <= 12; seed++) {
      const s = simulate(man, { days: 160, seed, noiseKg: 1, intake: () => 2000, tdee: (_, w) => 2900 * mifflinStJeor('male', 40, 180, w) / R100 });
      const a = detectAdaptation({ profile: man, age: 40, weighIns: s.weighIns.filter((_, i) => i % 3 === 0), intakes: s.intakes, today: s.todayN });
      expect(a?.probable ?? false).toBe(false);
    }
  });
  it('waits for a baseline and a separate recent window (14 + 42 + 42 days)', () => {
    const s = tenPercent(300, 1, 97);
    expect(detectAdaptation({ profile: man, age: 40, weighIns: s.weighIns, intakes: s.intakes, today: s.todayN })).toBeNull();
  });
});

// ---- Plateaus -------------------------------------------------------------------------------------

describe('plateau', () => {
  const tdee = (_: number, w: number) => 2900 * mifflinStJeor('male', 40, 180, w) / R100;

  it('blames rising intake when the log shows it', () => {
    // Loses on 2000 kcal for ten weeks, then eats about maintenance.
    const s = simulate(man, { days: 105, seed: 21, intake: d => (d < 70 ? 2000 : 2850), tdee });
    const a = assess({ profile: man, goal: 'lose', today: s.today, weighIns: s.weighIns, intakes: s.intakes });
    expect(a.plateau?.cause).toBe('intake-rise');
    expect(a.insights.find(i => i.id === 'plateau')).toMatchObject({ cause: 'intake-rise', action: { kind: 'return-to-target' } });
  });
  it('asks for consistent logging when most days are missing', () => {
    const s = simulate(man, { days: 105, seed: 22, intake: d => (d < 70 ? 2000 : 2850), tdee, logged: d => d < 84 || d % 3 === 0 });
    const a = assess({ profile: man, goal: 'lose', today: s.today, weighIns: s.weighIns, intakes: s.intakes });
    expect(a.insights.find(i => i.id === 'plateau')).toMatchObject({ cause: 'logging-gaps', action: { kind: 'log-consistently' } });
  });
  it('lowers the target when the person eats what was thought a deficit but is really maintenance', () => {
    // The equation says about 2940; the body spends 2400 and eats 2400, so nothing moves.
    const s = simulate(man, { days: 70, seed: 23, intake: () => 2400, tdee: () => 2400 });
    const a = assess({ profile: man, goal: 'lose', today: s.today, weighIns: s.weighIns, intakes: s.intakes });
    expect(a.plateau?.cause).toBe('unexplained');
    const p = a.insights.find(i => i.id === 'plateau')!;
    expect(p.action.kind).toBe('reduce-intake');
    expect(p.action.kind === 'reduce-intake' && p.action.kcal).toBeLessThan(2300);
    expect(ids(a.insights)).toContain('expenditure-update');
  });
  it('is not reported while the trend still falls', () => {
    const s = simulate(man, { days: 70, seed: 24, intake: () => 2200, tdee });
    expect(assess({ profile: man, goal: 'lose', today: s.today, weighIns: s.weighIns, intakes: s.intakes }).plateau).toBeNull();
  });
});

// ---- Insights -------------------------------------------------------------------------------------

describe('insights', () => {
  it('asks a new person for data and starts from the equation', () => {
    const a = assess({ profile: man, goal: 'lose', today: '2026-01-05', weighIns: [], intakes: [] });
    expect(a.expenditure!.confidence).toBe('none');
    expect(a.targets.maintenanceKcal).toBeCloseTo(totalExpenditure(man, 40).kcal, 6);
    expect(a.insights.find(i => i.id === 'need-data')).toMatchObject({ action: { kind: 'log-and-weigh', days: 27, weighInsPerWeek: 7 } });
  });
  it('flags protein below 90% of target with the grams missing', () => {
    const s = simulate(man, { days: 30, seed: 31, intake: () => 2200, tdee: () => 2700, protein: 90 });
    const a = assess({ profile: man, goal: 'lose', today: s.today, weighIns: s.weighIns, intakes: s.intakes });
    const p = a.insights.find(i => i.id === 'protein-low')!;
    expect(p).toMatchObject({ numbers: { averageG: 90 }, action: { kind: 'raise-protein' } });
    expect(p.action.kind === 'raise-protein' && p.action.grams).toBe(a.targets.proteinG! - 90);
  });
  it('reports a steady loss as on track', () => {
    const s = simulate(man, { days: 60, seed: 32, intake: () => 2350, tdee: () => 2900, protein: 200 });
    const a = assess({ profile: man, goal: 'lose', today: s.today, weighIns: s.weighIns, intakes: s.intakes });
    expect(ids(a.insights)).toContain('trend-on-track');
  });
  it('reports weight drift on a maintenance goal', () => {
    const s = simulate(man, { days: 60, seed: 33, intake: () => 3300, tdee: () => 2700 });
    const a = assess({ profile: man, goal: 'maintain', today: s.today, weighIns: s.weighIns, intakes: s.intakes });
    const d = a.insights.find(i => i.id === 'drift')!;
    expect(d.numbers.ratePctPerWeek).toBeGreaterThan(0.25);
    expect(d.action.kind).toBe('update-target');
  });
  it('is structured data only: kinds are kebab-case and every number is finite', () => {
    const runs = [tenPercent(300, 1), tenPercent(0, 2), simulate(man, { days: 40, seed: 34, intake: () => 1200, tdee: () => 2900, protein: 50 })];
    for (const s of runs) for (const goal of ['lose', 'maintain', 'muscle', 'sugar', 'heart'] as Goal[]) {
      for (const i of assess({ profile: man, goal, today: s.today, weighIns: s.weighIns, intakes: s.intakes }).insights) {
        expect(i.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
        expect(i.action.kind).toMatch(/^[a-z]+(-[a-z]+)*$/);
        for (const v of Object.values(i.numbers)) expect(Number.isFinite(v)).toBe(true);
        for (const x of [i.action, ...i.also]) for (const [k, v] of Object.entries(x)) if (k !== 'kind') expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
  it('ranks by severity, then by kind', () => {
    const mk = (id: Insight['id'], severity: Insight['severity']) => ({ id, severity, numbers: {}, action: { kind: 'keep' }, also: [] }) as unknown as Insight;
    const ranked = rankInsights([mk('trend-on-track', 'low'), mk('protein-low', 'medium'), mk('plateau', 'medium'), mk('rate-too-fast', 'high')]);
    expect(ids(ranked)).toEqual(['rate-too-fast', 'plateau', 'protein-low', 'trend-on-track']);
  });
});
