import { computed, signal } from '@preact/signals';
import type { Meal } from '@/core/models';
import { allMeals, deleteMeal, putMeal } from '@/core/db';
import { sameDay } from '@/core/dates';
import { add, zero } from '@/nutrition/math';

export const meals = signal<Meal[]>([]);
export const loaded = signal(false);

export const todays = computed(() => meals.value.filter(m => sameDay(m.at, Date.now())));
export const todayTotals = computed(() => todays.value.reduce((acc, m) => add(acc, m.totals), zero()));

export async function loadMeals(): Promise<void> {
  try { meals.value = await allMeals(); } catch { meals.value = []; }
  loaded.value = true;
}

export async function logMeal(m: Meal): Promise<void> {
  meals.value = [m, ...meals.value].sort((a, b) => b.at - a.at);
  try { await putMeal(m); } catch { /* kept in memory for this session */ }
}

export async function removeMeal(id: string): Promise<Meal | undefined> {
  const m = meals.value.find(x => x.id === id);
  meals.value = meals.value.filter(x => x.id !== id);
  try { await deleteMeal(id); } catch { /* already gone */ }
  return m;
}
