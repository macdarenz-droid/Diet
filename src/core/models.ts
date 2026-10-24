// Saved and in-memory data shapes. Owner-gated (AGENTS.md): a new kind of stored or sent data
// needs the owner's approval first.

/** Per-100 g (or per-meal, for totals) nutrient values. Energy is kcal; sodium is mg; the rest g. */
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  satFat: number;
  fibre: number;
  sugars: number;
  sodium: number;
}

export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'satFat', 'fibre', 'sugars', 'sodium'] as const satisfies readonly (keyof Nutrients)[];
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export type Source = 'label' | 'usda' | 'estimate';

export interface Item {
  name: string;
  detail: string;
  grams: number;
  gramsLow: number;
  gramsHigh: number;
  per100: Nutrients;
  source: Source;
  /** Present when source is 'usda'. */
  usda?: { fdcId: number; description: string };
  /** Claude's own per-100 g values, kept when another source wins, so a regrounding can compare. */
  estimate: Nutrients;
  query: string;
}

export type SwapKind = 'ingredient' | 'method' | 'dish' | 'product' | 'portion';
export type Keep = 'taste' | 'texture' | 'ingredient' | 'occasion';
export type Match = 'close' | 'similar' | 'loose';
export type Effort = 'none' | 'low' | 'medium';

export interface Swap {
  id: string;
  title: string;
  why: string;
  kind: SwapKind;
  keeps: Keep[];
  match: Match;
  effort: Effort;
  items: Item[];
}

export interface Question {
  id: string;
  text: string;
  options: string[];
}

export type MealKind = 'meal' | 'snack' | 'drink' | 'packaged';
export type Confidence = 'high' | 'medium' | 'low';

/** One analysed meal, grounded and ready to show. */
export interface Analysis {
  dish: string;
  kind: MealKind;
  confidence: Confidence;
  note: string;
  items: Item[];
  questions: Question[];
  swaps: Swap[];
}

/** A logged meal (IndexedDB `meals`). */
export interface Meal {
  id: string;
  /** Epoch ms when it was logged. */
  at: number;
  dish: string;
  kind: MealKind;
  items: Item[];
  totals: Nutrients;
  /** The original dish's name when the person logged a swap instead of it. */
  swappedFrom?: string;
  /** Small JPEG data URL. */
  thumb?: string;
}

export type Goal = 'lose' | 'maintain' | 'muscle' | 'sugar' | 'heart';
export type Diet = 'any' | 'vegetarian' | 'vegan' | 'pescatarian' | 'halal';
export type Region = 'AU' | 'PH';
export type EnergyUnit = 'kJ' | 'kcal';

export interface Targets {
  /** kcal */
  energy: number;
  /** g; 0 hides the target. */
  protein: number;
  fibre: number;
  sugars: number;
  /** mg */
  sodium: number;
}

export interface Profile {
  goal: Goal;
  diet: Diet;
  avoid: string;
  region: Region;
  unit: EnergyUnit;
  targets: Targets;
}

export interface Keys {
  claude: string;
  usda: string;
}

export interface Prefs {
  theme: 'night' | 'day';
  reduceMotion: boolean;
}

export interface UsageMonth {
  /** YYYY-MM */
  month: string;
  scans: number;
  /** Follow-up answers that re-ran an analysis. Missing in data saved before 2026-10-24. */
  refines?: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
