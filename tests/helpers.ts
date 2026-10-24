import type { Item, Nutrients } from '@/core/models';

export const per100 = (p: Partial<Nutrients> = {}): Nutrients => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, fibre: 0, sugars: 0, sodium: 0, ...p });

export function item(p: Partial<Item> & { per100?: Nutrients } = {}): Item {
  const n = p.per100 ?? per100({ kcal: 200, protein: 10, carbs: 20, fat: 8 });
  return {
    name: 'Food',
    detail: '',
    grams: 100,
    gramsLow: 80,
    gramsHigh: 120,
    source: 'estimate',
    query: 'food',
    estimate: n,
    ...p,
    per100: n,
  };
}
