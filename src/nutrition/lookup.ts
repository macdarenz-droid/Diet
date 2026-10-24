// Looks up every distinct USDA query once, with a 30-day cache and at most 4 requests in flight.
// A rate-limit or key error stops further requests; those items keep Claude's estimate.
import type { Item } from '@/core/models';
import { FdcError, search, type Candidate } from './fdc';
import { applyCandidate, choose } from './ground';

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PREFIX = 'nuance.fdc.';
const PARALLEL = 4;
/** The whole grounding step's time limit. */
export const GROUND_BUDGET_MS = 20000;
/** Cached queries kept on the device; the oldest go first. */
export const CACHE_MAX = 300;
/** Distinct lookups one scan may make, so text in a photo cannot spend the USDA quota or fill storage. */
export const LOOKUPS_MAX = 24;

/** A search name as a food database would spell it: letters, digits, spaces and , ( ) ' - only. */
export function cleanQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9 ,()'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Removes every cached lookup (Clear food log, Erase all data). */
export function clearLookupCache(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch { /* storage blocked */ }
}

function prune(now: number): void {
  const entries: { k: string; at: number }[] = [];
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith(PREFIX)) continue;
    let at = 0;
    try { at = (JSON.parse(localStorage.getItem(k) ?? '') as { at: number }).at ?? 0; } catch { /* unreadable: oldest */ }
    if (now - at > TTL_MS) localStorage.removeItem(k);
    else entries.push({ k, at });
  }
  entries.sort((a, b) => a.at - b.at);
  for (const e of entries.slice(0, Math.max(0, entries.length - CACHE_MAX))) localStorage.removeItem(e.k);
}

export interface Cache {
  get(query: string): Candidate[] | undefined;
  set(query: string, candidates: Candidate[]): void;
}

export function localCache(now: () => number = Date.now): Cache {
  return {
    get(query) {
      try {
        const raw = localStorage.getItem(PREFIX + query.toLowerCase());
        if (!raw) return undefined;
        const v = JSON.parse(raw) as { at: number; c: Candidate[] };
        if (now() - v.at > TTL_MS) { localStorage.removeItem(PREFIX + query.toLowerCase()); return undefined; }
        return v.c;
      } catch { return undefined; }
    },
    set(query, c) {
      // The whole result, so a cached lookup grounds exactly like the live one did.
      try {
        localStorage.setItem(PREFIX + query.toLowerCase(), JSON.stringify({ at: now(), c }));
        prune(now());
      } catch { /* storage full or blocked */ }
    },
  };
}

export type GroundStatus = 'done' | 'no-key' | 'rate' | 'auth' | 'offline';

export interface GroundResult<T> { value: T; status: GroundStatus }

type Search = (query: string, signal?: AbortSignal) => Promise<Candidate[]>;

/** Grounds every item in every list. Items from a nutrition label are left alone. */
export async function groundAll(lists: Item[][], opts: { key: string; cache: Cache; signal?: AbortSignal; search?: Search }): Promise<GroundResult<Item[][]>> {
  const run: Search = opts.search ?? ((q, s) => search(q, opts.key, s));
  // The meal's own items come first in lists[0], so the cap only ever trims swap lookups.
  const queries = [...new Set(lists.flat().filter(i => i.source !== 'label').map(i => cleanQuery(i.query)).filter(Boolean))].slice(0, LOOKUPS_MAX);
  const found = new Map<string, Candidate[]>();
  let status: GroundStatus = 'done';

  const todo: string[] = [];
  for (const q of queries) {
    const hit = opts.cache.get(q);
    if (hit) found.set(q, hit); else todo.push(q);
  }

  // No key only matters when something still had to be fetched.
  if (!opts.key && todo.length) status = 'no-key';
  if (opts.key && todo.length) {
    let stopped = false;
    // However slow USDA is, grounding gives up after this long and the rest keep Claude's estimate.
    const budget = setTimeout(() => { if (!stopped) { stopped = true; status = 'offline'; } }, GROUND_BUDGET_MS);
    const worker = async () => {
      for (;;) {
        const q = todo.shift();
        if (q === undefined || stopped || opts.signal?.aborted) return;
        try {
          const c = await run(q, opts.signal);
          found.set(q, c);
          opts.cache.set(q, c);
        } catch (e) {
          if (opts.signal?.aborted) return;
          if (e instanceof FdcError) {
            if (e.kind === 'rate' || e.kind === 'auth') { stopped = true; status = e.kind; return; }
            if (e.kind === 'network') { stopped = true; status = 'offline'; return; }
          }
          // A server error on one query leaves just that item on its estimate.
        }
      }
    };
    await Promise.race([
      Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker)),
      new Promise<void>(r => setTimeout(r, GROUND_BUDGET_MS)),
    ]);
    clearTimeout(budget);
  }

  const value = lists.map(items => items.map(it => {
    if (it.source === 'label') return it;
    const c = found.get(cleanQuery(it.query));
    return applyCandidate(it, c ? choose(it.query, it.estimate, c) : null);
  }));
  return { value, status };
}
