// Body details, weigh-ins and the wording of the metabolism engine's insights (src/slices/body).
import { describe, expect, it } from 'vitest';
import type { Action, BodyProfile, Insight, WeighIn } from '@/metabolism';
import { assess, compositionAt, energyDensity, KIND_ORDER, mifflinStJeor, referenceComposition, trendWeights } from '@/metabolism';
import { PACE, PARTIAL_DAY_KCAL, birthYears, bodyProfile, complete, intakesFrom, logWeight, paceFor, restoreWeight, weekChange, weighIns } from '@/slices/body/body';
import { word, wordAction, wordPace, type WordContext } from '@/slices/body/words';
import { purgeLegacy } from '@/core/store';
import { parseKg } from '@/slices/body/WeightSheet';

const kj: WordContext = { unit: 'kJ', weightKg: 80, auto: true };
const kcal: WordContext = { unit: 'kcal', weightKg: 80, auto: false };
const noWeight: WordContext = { unit: 'kcal', weightKg: null, auto: true };

const none: Action = { kind: 'none' };
const train: Action = { kind: 'resistance-train', sessionsPerWeek: 3 };
const walk: Action = { kind: 'add-steps', stepsPerDay: 8000 };

/** One of every insight the engine can give (docs/METABOLISM.md, section 10). */
const ALL: Insight[] = [
  { id: 'excluded', severity: 'high', reason: 'pregnant', numbers: {}, action: none, also: [] },
  { id: 'underweight', severity: 'high', numbers: { bmi: 18.1 }, action: { kind: 'no-deficit', kcal: 2100 }, also: [] },
  { id: 'intake-below-floor', severity: 'high', numbers: { meanIntakeKcal: 1100, floorKcal: 1200, days: 12 }, action: { kind: 'raise-intake', kcal: 1500 }, also: [] },
  { id: 'rate-too-fast', severity: 'high', numbers: { ratePctPerWeek: -1.4, maxPctPerWeek: 1, days: 28 }, action: { kind: 'raise-intake', kcal: 2100 }, also: [] },
  { id: 'gain-too-fast', severity: 'medium', numbers: { ratePctPerWeek: 0.8, maxPctPerWeek: 0.5, days: 28 }, action: { kind: 'reduce-intake', kcal: 2600 }, also: [] },
  { id: 'adaptation', severity: 'high', numbers: { expectedKcal: 2690, observedKcal: 2374, gapKcal: 316, gapPct: 11.8, lossPct: 10.4, weeks: 8 }, action: { kind: 'diet-break', weeks: 2, kcal: 2370 }, also: [train, walk] },
  ...(['logging-gaps', 'intake-rise', 'adaptation', 'unexplained'] as const).map((cause): Insight => ({
    id: 'plateau', severity: 'medium', cause, numbers: { days: 28, ratePctPerWeek: -0.05, meanIntakeKcal: 2150, previousMeanIntakeKcal: 1950 },
    action: cause === 'logging-gaps' ? { kind: 'log-consistently', days: 28 } : cause === 'intake-rise' ? { kind: 'return-to-target', kcal: 1950 } : cause === 'adaptation' ? { kind: 'diet-break', weeks: 2, kcal: 2300 } : { kind: 'reduce-intake', kcal: 1900 },
    also: [walk, train],
  })),
  { id: 'partial-log', severity: 'medium', numbers: { meanIntakeKcal: 920, restingKcal: 1450, loggedDays: 24 }, action: { kind: 'log-consistently', days: 28 }, also: [] },
  { id: 'diet-break', severity: 'medium', trigger: 'milestone', numbers: { lossPct: 10.2, weeksLosing: 14 }, action: { kind: 'diet-break', weeks: 2, kcal: 2500 }, also: [train, walk] },
  { id: 'diet-break', severity: 'medium', trigger: 'duration', numbers: { lossPct: 6, weeksLosing: 12 }, action: { kind: 'diet-break', weeks: 2, kcal: 2500 }, also: [train, walk] },
  { id: 'protein-low', severity: 'medium', numbers: { averageG: 82, targetG: 140, days: 13 }, action: { kind: 'raise-protein', grams: 58, targetGrams: 140 }, also: [train] },
  { id: 'expenditure-update', severity: 'low', numbers: { formulaKcal: 2600, measuredKcal: 2300, differenceKcal: -300 }, action: { kind: 'update-target', kcal: 1900 }, also: [] },
  { id: 'rate-too-slow', severity: 'low', numbers: { ratePctPerWeek: -0.2, plannedPctPerWeek: -0.5, meanIntakeKcal: 2200, targetKcal: 1900 }, action: { kind: 'return-to-target', kcal: 1900 }, also: [walk] },
  { id: 'rate-too-slow', severity: 'low', numbers: { ratePctPerWeek: 0, plannedPctPerWeek: 0.25, meanIntakeKcal: 2700, targetKcal: 2800 }, action: { kind: 'update-target', kcal: 2800 }, also: [] },
  { id: 'drift', severity: 'low', numbers: { ratePctPerWeek: 0.3, days: 28 }, action: { kind: 'update-target', kcal: 2300 }, also: [] },
  { id: 'need-data', severity: 'low', numbers: { windowDays: 28, loggedDays: 9, weighIns: 3, minLoggedDays: 14, minWeighIns: 4 }, action: { kind: 'log-and-weigh', days: 18, weighInsPerWeek: 7 }, also: [] },
  { id: 'trend-on-track', severity: 'low', numbers: { ratePctPerWeek: -0.5, plannedPctPerWeek: -0.5 }, action: { kind: 'keep' }, also: [] },
];

const HEDGE = /\b(estimat\w*|approx\w*|roughly|about|around|likely|probably|perhaps|may|might|confidence|usda|fooddata)\b/i;
const AI = /at a glance|\bunlock|supercharg|seamless|your journey|\bmagic|guilt[- ]free|\bsparkle/i;

describe('insight wording', () => {
  it('covers every kind the engine gives', () => {
    expect(new Set(ALL.map(i => i.id))).toEqual(new Set(KIND_ORDER));
  });

  it.each([['kJ', kj], ['kcal', kcal], ['no weight', noWeight]] as const)('reads cleanly in %s', (_n, ctx) => {
    for (const i of ALL) {
      const w = word(i, ctx);
      const text = [w.title, w.body, w.action ?? '', ...w.also].join(' | ');
      expect(w.title.split(/\s+/).length, w.title).toBeLessThanOrEqual(3);
      expect(w.title, w.title).not.toMatch(/^(The|This|About|What|How)\b|[?.!]$/);
      expect(text, text).not.toMatch(HEDGE);
      expect(text, text).not.toMatch(AI);
      expect(text, text).not.toMatch(/NaN|undefined|null|Infinity|!/);
      expect(w.body, i.id).toMatch(/\.$/);
      if (w.action) expect(w.action, i.id).toMatch(/^[A-Z].*\.$/);
    }
  });

  it('turns the rate into kilograms a week from the trend weight', () => {
    // 1.4% of 80 kg = 1.12 kg.
    expect(word(ALL.find(i => i.id === 'rate-too-fast')!, kj).body).toContain('losing 1.1 kg a week');
    expect(word(ALL.find(i => i.id === 'rate-too-fast')!, noWeight).body).toContain('losing 1.4% of your weight a week');
  });

  it('words the adaptation the owner described, in the chosen unit', () => {
    const w = word(ALL.find(i => i.id === 'adaptation')!, kj);
    expect(w.title).toBe('Metabolic adaptation');
    // 316 kcal = 1322 kJ, to the nearest 10. Only the gap is stated, so the card never shows two
    // different figures for what the body burns (the action's maintenance is the blended one).
    expect(w.body).toContain('burns 1,320 kJ a day less than your new weight accounts for');
    expect(w.body).not.toContain('9,930');
    expect(w.body).toContain('10.4%');
    expect(w.action).toBe('Eat at maintenance, 9,920 kJ a day, for 2 weeks, then return to your target.');
    expect(w.also).toEqual(['Strength train 3 times a week to keep muscle.', 'Walk 8,000 steps a day.']);
    expect(w.tone).toBe('alert');
  });

  it('says the target has moved when targets are automatic, and asks for it otherwise', () => {
    const a: Action = { kind: 'update-target', kcal: 1900 };
    expect(wordAction(a, { ...kcal, auto: true })).toBe('Your target is now 1,900 kcal a day.');
    expect(wordAction(a, kcal)).toBe('Set your energy target to 1,900 kcal a day.');
  });

  it('calls a flat weight steady instead of a rounded-up change', () => {
    expect(word(ALL.find(i => i.id === 'rate-too-slow' && i.numbers.ratePctPerWeek === 0)!, kcal).body).toBe('Your weight is steady against a plan to gain 0.2 kg a week.');
  });

  it('gives each plateau cause its own explanation', () => {
    const bodies = ALL.filter(i => i.id === 'plateau').map(i => word(i, kcal).body);
    expect(new Set(bodies).size).toBe(4);
    expect(bodies[1]).toContain('up 200 kcal');
    // Unexplained: a stable weight at an intake makes that intake the maintenance, whatever the details said.
    expect(bodies[3]).toBe('Your weight has held for 4 weeks at 2,150 kcal a day, which makes that your maintenance now.');
  });

  it('says why automatic targets are off', () => {
    const off = (reason: 'under-18' | 'pregnant' | 'breastfeeding' | 'invalid') => word({ id: 'excluded', severity: 'high', reason, numbers: {}, action: none, also: [] }, kcal);
    expect(off('pregnant')).toMatchObject({ title: 'Targets off', body: 'Automatic targets are off during pregnancy.', action: null });
    expect(new Set((['under-18', 'pregnant', 'breastfeeding', 'invalid'] as const).map(r => off(r).body)).size).toBe(4);
  });

  it('marks on-track progress as good and nothing to change', () => {
    const w = word(ALL.at(-1)!, kcal);
    expect(w).toMatchObject({ title: 'On track', tone: 'good', action: null });
  });

  it('words every insight from a real assessment without gaps', () => {
    // 98 days of daily weigh-ins losing 0.1 kg a day on 1,800 kcal: steady loss, then a fast rate.
    const day = (d: number) => new Date(2026, 0, 5 + d, 7).getTime();
    const key = (d: number) => { const x = new Date(day(d)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const weights = Array.from({ length: 98 }, (_, d) => ({ at: day(d), kg: 95 - 0.15 * d }));
    const intakes = Array.from({ length: 97 }, (_, d) => ({ day: key(d), kcal: 1100, protein: 60 }));
    const a = assess({ profile: { sex: 'female', birthYear: 1990, heightCm: 168, weightKg: 95, activity: 'light' }, goal: 'lose', today: key(97), weighIns: weights, intakes });
    expect(a.insights.length).toBeGreaterThan(0);
    for (const i of a.insights) {
      const w = word(i, { unit: 'kJ', weightKg: a.weightKg, auto: true });
      expect([w.body, w.action, ...w.also].join(' '), i.id).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(a.insights.map(i => i.id)).toEqual(expect.arrayContaining(['intake-below-floor', 'rate-too-fast', 'protein-low']));
  });
});

describe('body details', () => {
  const body = { sex: 'female' as const, birthYear: 1990, heightCm: 168, activity: 'light' as const };

  it('runs the engine only on complete details', () => {
    expect(complete(undefined)).toBe(false);
    expect(complete({ sex: 'female', birthYear: 1990, heightCm: 168 })).toBe(false);
    expect(complete({ ...body, heightCm: 99 })).toBe(false);
    expect(complete({ ...body, birthYear: 1899 })).toBe(false);
    const { min, max } = birthYears();
    expect(max - min).toBe(110);
    expect(complete({ ...body, birthYear: min - 1 })).toBe(false);
    expect(complete({ ...body, birthYear: max + 1 })).toBe(false);
    expect(complete({ ...body, birthYear: max })).toBe(true);
    expect(complete(body)).toBe(true);
  });

  it('needs a weigh-in and takes the latest weight', () => {
    expect(bodyProfile(body, [])).toBeNull();
    expect(bodyProfile({ ...body, pregnant: false }, [{ at: 1, kg: 70 }, { at: 2, kg: 69.5 }])).toEqual({ ...body, weightKg: 69.5 });
    expect(bodyProfile({ ...body, bodyFatPct: 28, breastfeeding: true }, [{ at: 1, kg: 70 }])).toMatchObject({ bodyFatPct: 28, breastfeeding: true });
  });

  it('maps pace to a weekly rate for the two goals that have one', () => {
    expect(paceFor({ goal: 'lose', pace: 'steady' })).toBe(0.5);
    expect(paceFor({ goal: 'muscle', pace: 'fast' })).toBe(0.5);
    expect(paceFor({ goal: 'maintain', pace: 'fast' })).toBeUndefined();
    // The fastest pace never passes the engine's caps (1% loss, 0.5% gain).
    expect(Math.max(...Object.values(PACE.lose))).toBeLessThanOrEqual(1);
    expect(Math.max(...Object.values(PACE.muscle))).toBeLessThanOrEqual(0.5);
  });

  it('leaves out days too low to be finished', () => {
    const t = (d: string) => new Date(`${d}T12:00:00`).getTime();
    const meals = [
      { at: t('2026-10-21'), totals: { kcal: PARTIAL_DAY_KCAL - 1, protein: 30 } },
      { at: t('2026-10-22'), totals: { kcal: PARTIAL_DAY_KCAL, protein: 30 } },
    ];
    expect(intakesFrom(meals, '2026-10-24').map(d => d.day)).toEqual(['2026-10-22']);
  });

  it('counts only finished days of the food log', () => {
    const t = (d: string, h: number) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime();
    const meals = [
      { at: t('2026-10-22', 8), totals: { kcal: 500, protein: 30 } },
      { at: t('2026-10-22', 19), totals: { kcal: 700, protein: 40 } },
      { at: t('2026-10-23', 12), totals: { kcal: 900, protein: 20 } },
      { at: t('2026-10-24', 9), totals: { kcal: 400, protein: 25 } },
    ];
    expect(intakesFrom(meals, '2026-10-24')).toEqual([{ day: '2026-10-22', kcal: 1200, protein: 70 }, { day: '2026-10-23', kcal: 900, protein: 20 }]);
    expect(intakesFrom(meals, '2026-10-24', 1)).toEqual([{ day: '2026-10-23', kcal: 900, protein: 20 }]);
  });

  it('does not undo a deletion onto a day that has a newer weigh-in', async () => {
    const morning = new Date(2026, 9, 24, 7).getTime();
    weighIns.value = [{ at: morning + 3_600_000, kg: 79 }];
    await restoreWeight({ at: morning, kg: 80 });
    expect(weighIns.value).toEqual([{ at: morning + 3_600_000, kg: 79 }]);
    await restoreWeight({ at: morning - 86_400_000, kg: 80.5 });
    expect(weighIns.value.map(w => w.kg)).toEqual([80.5, 79]);
    weighIns.value = [];
  });

  it('keeps one weigh-in a day, the latest, rounded to 0.1 kg', async () => {
    weighIns.value = [];
    const morning = new Date(2026, 9, 24, 7).getTime();
    await logWeight(80.04, morning);
    await logWeight(79.66, morning + 3_600_000);
    await logWeight(79.2, morning + 86_400_000);
    expect(weighIns.value).toEqual([{ at: morning + 3_600_000, kg: 79.7 }, { at: morning + 86_400_000, kg: 79.2 }]);
    weighIns.value = [];
  });

  it('accepts weights in the engine range, with a comma or a point', () => {
    expect(parseKg('72.4')).toBe(72.4);
    expect(parseKg('72,46')).toBe(72.5);
    expect(parseKg('24.9')).toBeNull();
    expect(parseKg('351')).toBeNull();
    expect(parseKg('')).toBeNull();
    expect(parseKg('7.2.1')).toBeNull();
  });
});

describe('week change', () => {
  const D = 864e5;
  const t0 = new Date(2026, 9, 1, 7).getTime();
  const daily = (n: number, perDay: number): WeighIn[] => Array.from({ length: n }, (_, d) => ({ at: t0 + d * D, kg: 90 + perDay * d }));

  it('is the trend change over the last 7 days', () => {
    const p = trendWeights(daily(21, -0.1));
    expect(weekChange(p, t0 + 20 * D)).toBeCloseTo(-0.7, 1);
  });
  it('is not shown when weigh-ins are too far apart or the last one is old', () => {
    expect(weekChange(trendWeights([{ at: t0, kg: 94 }, { at: t0 + 30 * D, kg: 90 }]), t0 + 30 * D)).toBeNull();
    expect(weekChange(trendWeights(daily(21, -0.1)), t0 + 28 * D)).toBeNull();
  });
});

describe('pace line', () => {
  it('shows the planned rate in kg, or the chosen one before there is a plan', () => {
    expect(wordPace({ goal: 'lose', chosenPct: 1, plannedPct: -0.45, excluded: false, weightKg: 55 })).toBe('Lose 0.2 kg a week');
    expect(wordPace({ goal: 'lose', chosenPct: 0.5, plannedPct: null, excluded: false, weightKg: null })).toBe('Lose 0.5% a week');
    expect(wordPace({ goal: 'muscle', chosenPct: 0.25, plannedPct: null, excluded: false, weightKg: 80 })).toBe('Gain 0.2 kg a week');
  });
  it('says hold weight when the plan has no deficit or surplus, and nothing when there is no target', () => {
    expect(wordPace({ goal: 'lose', chosenPct: 0.5, plannedPct: 0, excluded: false, weightKg: 48 })).toBe('Hold weight');
    expect(wordPace({ goal: 'muscle', chosenPct: 0.5, plannedPct: 0, excluded: false, weightKg: 100 })).toBe('Hold weight');
    expect(wordPace({ goal: 'lose', chosenPct: 0.5, plannedPct: null, excluded: true, weightKg: 70 })).toBeNull();
  });
});

describe('the owner\'s 10% scenario through the app', () => {
  // A man of 40, 180 cm, 100 kg, eating 2,000 kcal against 2,900 kcal that falls with his mass; once he
  // reaches 90 kg a further 300 kcal/day drop ramps in over two weeks (docs/METABOLISM.md, section 8).
  const man: BodyProfile = { sex: 'male', age: 40, heightCm: 180, weightKg: 100, activity: 'light' };
  const day = (d: number) => new Date(2026, 0, 5 + d, 7).getTime();
  const key = (d: number) => { const x = new Date(day(d)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const R100 = mifflinStJeor('male', 40, 180, 100);
  const ref = referenceComposition(man, 40);
  const weights: WeighIn[] = [];
  const meals: { at: number; totals: { kcal: number; protein: number } }[] = [];
  let w = 100, crossed = -1;
  for (let d = 0; d < 161; d++) {
    weights.push({ at: day(d), kg: w + 0.3 * Math.sin(d * 1.7) });
    const eat = 2000 + 120 * Math.sin(d * 2.3);
    meals.push({ at: day(d) + 5 * 3_600_000, totals: { kcal: eat, protein: 180 } });
    if (crossed < 0 && w <= 90) crossed = d;
    const extra = crossed < 0 ? 0 : Math.min(1, (d - crossed) / 14) * 300;
    w += (eat - (2900 * mifflinStJeor('male', 40, 180, w) / R100 - extra)) / energyDensity(compositionAt(ref, w).fatKg);
  }
  const run = (intakes: ReturnType<typeof intakesFrom>) => assess({ profile: man, goal: 'lose', today: key(160), weighIns: weights, intakes });

  it('reaches the adaptation insight with every logged day passed', () => {
    const a = run(intakesFrom(meals, key(160)));
    expect(a.insights[0]?.id).toBe('adaptation');
    const card = word(a.insights[0]!, { unit: 'kcal', weightKg: a.weightKg, auto: true });
    expect(card.title).toBe('Metabolic adaptation');
    expect(card.action).toMatch(/^Eat at maintenance, [\d,]+ kcal a day, for 2 weeks/);
  });

  it('cannot see it from the last 8 weeks alone', () => {
    expect(run(intakesFrom(meals, key(160), 56)).insights.map(i => i.id)).not.toContain('adaptation');
  });
});

describe('legacy data', () => {
  it('removes the USDA key and lookup cache from earlier builds', () => {
    const m = new Map<string, string>([['nuance.keys', JSON.stringify({ claude: 'k', usda: 'u' })], ['nuance.fdc.rice', '{}'], ['nuance.fdc.egg', '{}'], ['nuance.profile', '{}']]);
    const storage = {
      get length() { return m.size; },
      key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, v); },
      removeItem: (k: string) => { m.delete(k); },
      clear: () => m.clear(),
    } as Storage;
    purgeLegacy(storage);
    expect([...m.keys()].sort()).toEqual(['nuance.keys', 'nuance.profile']);
    expect(JSON.parse(m.get('nuance.keys')!)).toEqual({ claude: 'k' });
  });
});
