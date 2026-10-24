// Types for the parts of build.mjs that tests/foods.test.ts calls.

export interface BuiltFood {
  id: string | number;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  satFat: number | null;
  fibre: number | null;
  sugars: number | null;
  sodium: number | null;
  alcohol: number | null;
  aliases: string[];
  ndb?: string;
}

export interface UsdaInput {
  fdcId: number;
  description: string;
  ndbNumber?: number | string;
  foodNutrients?: { nutrient?: { id?: number }; amount?: number }[];
  foodAttributes?: { value?: string; foodAttributeType?: { id?: number; name?: string } }[];
}

export type CofidInput = Record<'CHO' | 'STAR' | 'TOTSUG' | 'GLUC' | 'FRUCT' | 'GALACT' | 'SUCR' | 'MALT' | 'LACT', number | null>;

export const KJ_PER_KCAL: number;
export const MAX_UNREPORTED_FIBRE: number;
export const COFID_STARCH: number;
export const COFID_DISACCHARIDE: number;
export const FIELDS: string[];
export const DOWNLOADS: Record<string, { url: string; sha256: string }>;
export const META: Record<'usda' | 'afcd' | 'cofid', { title: string; publisher: string; licence: string; licenceUrl: string; attribution: string; notices: string[] }>;
export function usdaFood(f: UsdaInput, source: string): BuiltFood | null;
export function cofidCarbs(c: CofidInput): { carbs: number | null; sugars: number | null };
export function cofidValue(v: unknown, where: string): number | null;
export function afcdAliases(description: string): string[];
export function num(v: unknown, where: string): number | null;
export function problems(f: BuiltFood): string[];
export function dedupe<T extends Record<string, BuiltFood[]>>(groups: T): T;
