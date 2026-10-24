// Body details, weigh-ins and the wording of the metabolism engine's insights (src/slices/body).
import { describe, expect, it } from 'vitest';
import type { Action, Insight } from '@/metabolism';
import { assess, KIND_ORDER } from '@/metabolism';
import { PACE, bodyProfile, complete, intakesFrom, logWeight, paceFor, weighIns } from '@/slices/body/body';
import { word, wordAction, type WordContext } from '@/slices/body/words';
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
    expect(word(ALL[3]!, kj).body).toContain('losing 1.1 kg a week');
    expect(word(ALL[3]!, noWeight).body).toContain('losing 1.4% of your weight a week');
  });

  it('words the adaptation the owner described, in the chosen unit', () => {
    const w = word(ALL[5]!, kj);
    expect(w.title).toBe('Metabolic adaptation');
    // 316 kcal = 1322 kJ, to the nearest 10; 2374 kcal = 9933 kJ.
    expect(w.body).toContain('1,320 kJ less than your new weight accounts for');
    expect(w.body).toContain('9,930 kJ a day');
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
    expect(word(ALL[15]!, kcal).body).toBe('Your weight is steady against a plan to gain 0.2 kg a week.');
  });

  it('gives each plateau cause its own explanation', () => {
    const bodies = ALL.filter(i => i.id === 'plateau').map(i => word(i, kcal).body);
    expect(new Set(bodies).size).toBe(4);
    expect(bodies[1]).toContain('up 200 kcal');
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
