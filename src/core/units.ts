import type { EnergyUnit, NutrientKey } from './models';
import { KJ_PER_KCAL } from '@/nutrition/math';

export function energy(kcal: number, unit: EnergyUnit): number {
  return unit === 'kJ' ? kcal * KJ_PER_KCAL : kcal;
}

export function fromEnergy(value: number, unit: EnergyUnit): number {
  return unit === 'kJ' ? value / KJ_PER_KCAL : value;
}

/** Rounds energy the way food labels do: kJ to the nearest 10, kcal to the nearest 5. */
export function roundEnergy(kcal: number, unit: EnergyUnit): number {
  const v = energy(kcal, unit);
  const step = unit === 'kJ' ? 10 : 5;
  return Math.round(v / step) * step;
}

/** Grams: one decimal under 10 g, whole numbers above. Sodium (mg) to the nearest 10. */
export function roundNutrient(key: NutrientKey, v: number): number {
  if (key === 'sodium') return Math.round(v / 10) * 10;
  if (Math.abs(v) < 10) return Math.round(v * 10) / 10;
  return Math.round(v);
}

export function unitOf(key: NutrientKey, energyUnit: EnergyUnit): string {
  if (key === 'kcal') return energyUnit;
  if (key === 'sodium') return 'mg';
  return 'g';
}

export const LABEL: Record<NutrientKey, string> = {
  kcal: 'Energy',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  satFat: 'Saturated fat',
  fibre: 'Fibre',
  sugars: 'Sugars',
  sodium: 'Sodium',
};

const nf = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 });
export const fmt = (n: number): string => nf.format(n);

/** "1,240 kJ" style, already rounded. */
export function fmtEnergy(kcal: number, unit: EnergyUnit): string {
  return `${fmt(roundEnergy(kcal, unit))} ${unit}`;
}

export function fmtNutrient(key: NutrientKey, v: number, energyUnit: EnergyUnit): string {
  if (key === 'kcal') return fmtEnergy(v, energyUnit);
  return `${fmt(roundNutrient(key, v))} ${unitOf(key, energyUnit)}`;
}

/** Signed difference, e.g. "−240 kJ", "+12 g". Uses a true minus sign. */
export function fmtDelta(key: NutrientKey, v: number, energyUnit: EnergyUnit): string {
  const r = key === 'kcal' ? roundEnergy(v, energyUnit) : roundNutrient(key, v);
  if (r === 0) return `0 ${unitOf(key, energyUnit)}`;
  const sign = r > 0 ? '+' : '−';
  return `${sign}${fmt(Math.abs(r))} ${unitOf(key, energyUnit)}`;
}
