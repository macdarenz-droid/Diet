// Persisted state: profile, keys, display preferences and API usage, each one localStorage entry.
// Owner-gated (AGENTS.md): a new kind of stored data needs the owner's approval first.
import { effect, signal, type Signal } from '@preact/signals';
import type { Keys, Prefs, Profile, Region, UsageMonth } from './models';
import { monthKey } from './dates';

// Daily targets, all editable in Profile. Energy 2000 kcal is a round reference near the 8700 kJ
// average-adult figure on Australian labels; sugars 50 g and sodium 2000 mg follow
// WHO guidance (free sugars under 10% of energy; sodium under 2 g); fibre 30 g is the NHMRC adequate
// intake for adult men (25 g for women). Protein stays off until the person sets it.
export const DEFAULT_TARGETS = { energy: 2000, protein: 0, fibre: 30, sugars: 50, sodium: 2000 };

export function defaultProfile(region: Region = 'AU'): Profile {
  return { goal: 'lose', diet: 'any', avoid: '', region, unit: region === 'AU' ? 'kJ' : 'kcal', targets: { ...DEFAULT_TARGETS } };
}

const KEYS = { profile: 'nuance.profile', keys: 'nuance.keys', prefs: 'nuance.prefs', usage: 'nuance.usage' } as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as unknown;
    if (typeof fallback === 'object' && fallback && !Array.isArray(fallback) && v && typeof v === 'object' && !Array.isArray(v)) {
      return { ...fallback, ...(v as object) } as T;
    }
    return (v as T) ?? fallback;
  } catch { return fallback; }
}

function write(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked */ }
}

function persisted<T>(key: string, fallback: T): Signal<T> {
  const s = signal<T>(typeof localStorage === 'undefined' ? fallback : read(key, fallback));
  if (typeof localStorage !== 'undefined') effect(() => write(key, s.value));
  return s;
}

function guessRegion(): Region {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === 'Asia/Manila') return 'PH';
  } catch { /* no Intl time zone */ }
  return 'AU';
}

const base = defaultProfile(guessRegion());
const storedProfile = typeof localStorage === 'undefined' ? base : read<Profile>(KEYS.profile, base);
export const profile = persisted<Profile>(KEYS.profile, { ...storedProfile, targets: { ...DEFAULT_TARGETS, ...storedProfile.targets } });
export const keys = persisted<Keys>(KEYS.keys, { claude: '', usda: '' });
export const prefs = persisted<Prefs>(KEYS.prefs, { theme: 'night', reduceMotion: false });
export const usage = persisted<UsageMonth[]>(KEYS.usage, []);

export function recordUsage(u: { input: number; output: number; cacheRead: number; cacheWrite: number }, at = Date.now()): void {
  const month = monthKey(at);
  const list = usage.value.slice();
  const i = list.findIndex(m => m.month === month);
  const cur = i >= 0 ? list[i]! : { month, scans: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const next = { ...cur, scans: cur.scans + 1, input: cur.input + u.input, output: cur.output + u.output, cacheRead: cur.cacheRead + u.cacheRead, cacheWrite: cur.cacheWrite + u.cacheWrite };
  if (i >= 0) list[i] = next; else list.push(next);
  usage.value = list.slice(-12);
}

export function costUsd(m: Pick<UsageMonth, 'input' | 'output' | 'cacheRead' | 'cacheWrite'>, price: { input: number; output: number; cacheRead: number; cacheWrite: number }): number {
  return (m.input * price.input + m.output * price.output + m.cacheRead * price.cacheRead + m.cacheWrite * price.cacheWrite) / 1e6;
}
