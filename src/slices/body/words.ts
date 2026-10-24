// The metabolism engine's insights, worded for the screen. The engine gives kinds and numbers
// (docs/METABOLISM.md, section 10); everything a person reads about them is written here. Titles are
// one to three words; the text under them never hedges or names a data source (owner, 2026-10-24).
import type { EnergyUnit } from '@/core/models';
import { fmt, fmtEnergy } from '@/core/units';
import type { Action, Insight } from '@/metabolism';

export type Tone = 'alert' | 'note' | 'good';

export interface Worded {
  title: string;
  body: string;
  /** What to do, or null when nothing needs to change. */
  action: string | null;
  also: string[];
  tone: Tone;
}

export interface WordContext {
  unit: EnergyUnit;
  /** Current trend weight, for rates in kg; rates fall back to % of body weight without it. */
  weightKg: number | null;
  /** Energy targets follow the engine, so an update has already been applied. */
  auto: boolean;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

function words(c: WordContext) {
  const e = (kcal: number) => fmtEnergy(kcal, c.unit);
  const perDay = (kcal: number) => `${e(kcal)} a day`;
  /** "0.6 kg a week", from a signed % of body weight a week. */
  const rate = (pct: number) => c.weightKg
    ? `${fmt(Math.max(0.1, r1(Math.abs(pct) * c.weightKg / 100)))} kg a week`
    : `${fmt(Math.max(0.1, r1(Math.abs(pct))))}% of your weight a week`;
  /** Under 0.05 kg (or 0.05%) a week reads as steady rather than "0.1 kg". */
  const steady = (pct: number) => (c.weightKg ? Math.abs(pct) * c.weightKg / 100 : Math.abs(pct)) < 0.05;
  const weeks = (days: number) => { const w = Math.max(1, Math.round(days / 7)); return w === 1 ? '1 week' : `${w} weeks`; };
  const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);
  return { e, perDay, rate, steady, weeks, days };
}

export function wordAction(a: Action, c: WordContext): string | null {
  const w = words(c);
  switch (a.kind) {
    case 'none':
    case 'keep': return null;
    case 'no-deficit': return `Eat ${w.perDay(a.kcal)} to hold your weight.`;
    case 'raise-intake': return `Raise intake to ${w.perDay(a.kcal)}.`;
    case 'reduce-intake': return `Lower intake to ${w.perDay(a.kcal)}.`;
    case 'return-to-target': return `Return to your target of ${w.perDay(a.kcal)}.`;
    case 'update-target': return c.auto ? `Your target is now ${w.perDay(a.kcal)}.` : `Set your energy target to ${w.perDay(a.kcal)}.`;
    case 'diet-break': return `Eat at maintenance, ${w.perDay(a.kcal)}, for ${w.weeks(a.weeks * 7)}, then return to your target.`;
    case 'raise-protein': return `Add ${fmt(a.grams)} g of protein a day to reach ${fmt(a.targetGrams)} g.`;
    case 'resistance-train': return `Strength train ${a.sessionsPerWeek} times a week to keep muscle.`;
    case 'add-steps': return `Walk ${fmt(a.stepsPerDay)} steps a day.`;
    case 'log-and-weigh': return `Weigh in each morning and log full days for the next ${w.days(a.days)} to set your targets from your own data.`;
    case 'log-consistently': return `Log every meal for the next ${w.weeks(a.days)}.`;
  }
}

const TONE: Record<Insight['severity'], Tone> = { high: 'alert', medium: 'note', low: 'note' };

export function word(i: Insight, c: WordContext): Worded {
  const w = words(c);
  const out = (title: string, body: string, tone: Tone = TONE[i.severity]): Worded => ({
    title,
    body,
    action: wordAction(i.action, c),
    also: i.also.map(a => wordAction(a, c)).filter((s): s is string => !!s),
    tone,
  });
  switch (i.id) {
    case 'excluded':
      return out('Targets off', 'Energy and protein targets are set by hand.');
    case 'underweight':
      return out('Underweight', `Your BMI is ${fmt(i.numbers.bmi)}, so your target has no deficit.`);
    case 'intake-below-floor':
      return out('Low intake', `You averaged ${w.perDay(i.numbers.meanIntakeKcal)} over ${w.days(i.numbers.days)}, under the guideline minimum of ${w.perDay(i.numbers.floorKcal)}.`);
    case 'rate-too-fast':
      return out('Fast loss', `You are losing ${w.rate(i.numbers.ratePctPerWeek)}, more than ${fmt(i.numbers.maxPctPerWeek)}% of your weight. Slower loss keeps more muscle.`);
    case 'gain-too-fast':
      return out('Fast gain', `You are gaining ${w.rate(i.numbers.ratePctPerWeek)}, more than ${fmt(i.numbers.maxPctPerWeek)}% of your weight. Faster gain adds fat, not muscle.`);
    case 'adaptation': {
      const n = i.numbers;
      return out('Metabolic adaptation', `You have lost ${fmt(n.lossPct)}% of your weight, and your body now burns ${w.perDay(n.observedKcal)}: ${w.e(n.gapKcal)} less than your new weight accounts for. After a large loss the body defends its fat stores: hunger rises, everyday movement drops and muscles do the same work on less energy.`);
    }
    case 'plateau': {
      const n = i.numbers;
      const held = `Your weight has held for ${w.weeks(n.days)}`;
      const body =
        i.cause === 'logging-gaps' ? `${held}, with fewer than 6 in 10 of those days logged.`
        : i.cause === 'intake-rise' ? `${held}. You averaged ${w.perDay(n.meanIntakeKcal)}, up ${w.e(n.meanIntakeKcal - n.previousMeanIntakeKcal)} on the ${w.weeks(n.days)} before.`
        : i.cause === 'adaptation' ? `${held}, and your body is burning less than your weight accounts for.`
        : `${held} at ${w.perDay(n.meanIntakeKcal)}, so your maintenance is lower than your details suggest.`;
      return out('Plateau', body);
    }
    case 'diet-break': {
      const n = i.numbers;
      const lead = i.trigger === 'milestone' ? `You have lost ${fmt(n.lossPct)}% of your weight.` : `You have been losing for ${w.weeks(n.weeksLosing * 7)}.`;
      return out('Diet break', `${lead} In trials, two weeks at maintenance between blocks of dieting kept more weight off.`);
    }
    case 'protein-low':
      return out('Low protein', `You averaged ${fmt(i.numbers.averageG)} g a day over ${w.days(i.numbers.days)}, against a target of ${fmt(i.numbers.targetG)} g.`);
    case 'expenditure-update': {
      const n = i.numbers;
      const dir = n.differenceKcal > 0 ? 'higher' : 'lower';
      return out('New maintenance', `Your log and weigh-ins put your maintenance at ${w.perDay(n.measuredKcal)}, ${w.e(Math.abs(n.differenceKcal))} ${dir} than your body details alone give.`);
    }
    case 'rate-too-slow': {
      const n = i.numbers;
      const now = w.steady(n.ratePctPerWeek) ? 'Your weight is steady' : `You are ${n.ratePctPerWeek < 0 ? 'losing' : 'gaining'} ${w.rate(n.ratePctPerWeek)}`;
      const plan = n.plannedPctPerWeek < 0 ? 'lose' : 'gain';
      return out('Slow progress', `${now} against a plan to ${plan} ${w.rate(n.plannedPctPerWeek)}.`);
    }
    case 'drift': {
      const n = i.numbers;
      return out('Weight drift', `Your weight is ${n.ratePctPerWeek > 0 ? 'rising' : 'falling'} ${w.rate(n.ratePctPerWeek)} over the last ${w.weeks(n.days)}.`);
    }
    case 'need-data': {
      const n = i.numbers;
      return out('Personal baseline', `${n.loggedDays} of the last ${n.windowDays} days logged, ${n.weighIns === 1 ? '1 weigh-in' : `${n.weighIns} weigh-ins`}.`);
    }
    case 'trend-on-track': {
      const n = i.numbers;
      return out('On track', `You are ${n.ratePctPerWeek < 0 ? 'losing' : 'gaining'} ${w.rate(n.ratePctPerWeek)}, as planned.`, 'good');
    }
  }
}
