import { describe, expect, it } from 'vitest';
import { today, tick } from '@/core/clock';
import { meals, todays, todayTotals } from '@/slices/today/meals';
import type { Meal } from '@/core/models';
import { per100 } from './helpers';

// Review of dcfa404: a home-screen app left open overnight must show the new day.
describe('day rollover', () => {
  it('moves Today to the next local day', () => {
    const last = new Date(2026, 9, 24, 21, 0).getTime();
    const morning = new Date(2026, 9, 25, 7, 0).getTime();
    tick(last);
    meals.value = [{ id: 'a', at: last, dish: 'Dinner', kind: 'meal', items: [], totals: per100({ kcal: 900 }) } as Meal];
    expect(todays.value).toHaveLength(1);
    expect(todayTotals.value.kcal).toBe(900);
    tick(morning);
    expect(today.value).toBe('2026-10-25');
    expect(todays.value).toHaveLength(0);
    expect(todayTotals.value.kcal).toBe(0);
  });
});
