import { computed, signal } from '@preact/signals';
import type { Meal } from '@/core/models';
import { allMeals, deleteMeal, putMeal } from '@/core/db';
import { dayKey } from '@/core/dates';
import { today } from '@/core/clock';
import { add, zero } from '@/nutrition/math';

export const meals = signal<Meal[]>([]);
export const loaded = signal(false);

export const todays = computed(() => { const d = today.value; return meals.value.filter(m => dayKey(m.at) === d); });
export const todayTotals = computed(() => todays.value.reduce((acc, m) => add(acc, m.totals), zero()));

export async function loadMeals(): Promise<void> {
  try { meals.value = await allMeals(); } catch { meals.value = []; }
  loaded.value = true;
}

/** Saves a meal; resolves false when the device would not store it (it stays on screen until reload). */
export async function logMeal(m: Meal): Promise<boolean> {
  meals.value = [m, ...meals.value.filter(x => x.id !== m.id)].sort((a, b) => b.at - a.at);
  try { await putMeal(m); return true; } catch { return false; }
}

export async function removeMeal(id: string): Promise<Meal | undefined> {
  const m = meals.value.find(x => x.id === id);
  meals.value = meals.value.filter(x => x.id !== id);
  try { await deleteMeal(id); } catch { /* already gone */ }
  return m;
}
