import { describe, expect, it } from 'vitest';
import { energy, fmtDelta, fmtEnergy, fmtNutrient, fromEnergy, roundEnergy, roundNutrient } from '@/core/units';
import { dayKey, partOfDay, sameDay, startOfDay } from '@/core/dates';
import { costUsd, defaultProfile } from '@/core/store';
import { PRICE } from '@/ai/config';

describe('energy units', () => {
  it('converts kcal and kJ both ways', () => {
    expect(energy(100, 'kJ')).toBeCloseTo(418.4);
    expect(fromEnergy(418.4, 'kJ')).toBeCloseTo(100);
    expect(energy(100, 'kcal')).toBe(100);
  });
  it('rounds like a food label', () => {
    expect(roundEnergy(100, 'kJ')).toBe(420);
    expect(roundEnergy(103, 'kcal')).toBe(105);
    expect(fmtEnergy(500, 'kJ')).toBe('2,090 kJ');
  });
  it('rounds grams by size and sodium to 10 mg', () => {
    expect(roundNutrient('protein', 3.84)).toBe(3.8);
    expect(roundNutrient('carbs', 32.5)).toBe(33);
    expect(roundNutrient('sodium', 361)).toBe(360);
    expect(fmtNutrient('sodium', 1234, 'kJ')).toBe('1,230 mg');
  });
  it('formats signed differences with a true minus sign', () => {
    expect(fmtDelta('kcal', -57.4, 'kJ')).toBe('−240 kJ');
    expect(fmtDelta('protein', 12.2, 'kJ')).toBe('+12 g');
    expect(fmtDelta('sugars', 0.02, 'kJ')).toBe('0 g');
  });
});

describe('profile defaults', () => {
  it('uses kJ in Australia and kcal in the Philippines', () => {
    expect(defaultProfile('AU').unit).toBe('kJ');
    expect(defaultProfile('PH').unit).toBe('kcal');
  });
});

describe('cost', () => {
  it('prices each token kind', () => {
    expect(costUsd({ input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 }, PRICE)).toBeCloseTo(PRICE.input + PRICE.output + PRICE.cacheRead + PRICE.cacheWrite);
  });
});

describe('local days', () => {
  it('splits days at local midnight', () => {
    const late = new Date(2026, 9, 24, 23, 59).getTime();
    const early = new Date(2026, 9, 25, 0, 1).getTime();
    expect(sameDay(late, early)).toBe(false);
    expect(dayKey(late)).toBe('2026-10-24');
    expect(dayKey(early)).toBe('2026-10-25');
    expect(startOfDay(early)).toBe(new Date(2026, 9, 25).getTime());
  });
  it('names the part of the day', () => {
    expect(partOfDay(new Date(2026, 9, 24, 7).getTime())).toBe('Morning');
    expect(partOfDay(new Date(2026, 9, 24, 13).getTime())).toBe('Afternoon');
    expect(partOfDay(new Date(2026, 9, 24, 19).getTime())).toBe('Evening');
    expect(partOfDay(new Date(2026, 9, 24, 23).getTime())).toBe('Night');
  });
});
