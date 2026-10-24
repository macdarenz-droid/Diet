// Looks up every distinct USDA query once, with a 30-day cache and at most 4 requests in flight.
// A rate-limit or key error stops further requests; those items keep Claude's estimate.
import type { Item } from '@/core/models';
import { FdcError, search, type Candidate } from './fdc';
import { applyCandidate, choose } from './ground';

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PREFIX = 'diet.fdc.';
const PARALLEL = 4;

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
        if (now() - v.at > TTL_MS) return undefined;
        return v.c;
      } catch { return undefined; }
    },
    set(query, c) {
      try { localStorage.setItem(PREFIX + query.toLowerCase(), JSON.stringify({ at: now(), c: c.slice(0, 6) })); } catch { /* storage full or blocked */ }
    },
  };
}

export type GroundStatus = 'done' | 'no-key' | 'rate' | 'auth' | 'offline';

export interface GroundResult<T> { value: T; status: GroundStatus }

type Search = (query: string, signal?: AbortSignal) => Promise<Candidate[]>;

/** Grounds every item in every list. Items from a nutrition label are left alone. */
export async function groundAll(lists: Item[][], opts: { key: string; cache: Cache; signal?: AbortSignal; search?: Search }): Promise<GroundResult<Item[][]>> {
  const run: Search = opts.search ?? ((q, s) => search(q, opts.key, s));
  const queries = [...new Set(lists.flat().filter(i => i.source !== 'label' && i.query.trim()).map(i => i.query.trim().toLowerCase()))];
  const found = new Map<string, Candidate[]>();
  let status: GroundStatus = opts.key ? 'done' : 'no-key';

  const todo: string[] = [];
  for (const q of queries) {
    const hit = opts.cache.get(q);
    if (hit) found.set(q, hit); else todo.push(q);
  }

  if (opts.key) {
    let stopped = false;
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
    await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
  }

  const value = lists.map(items => items.map(it => {
    if (it.source === 'label') return it;
    const c = found.get(it.query.trim().toLowerCase());
    return applyCandidate(it, c ? choose(it.query, it.estimate, c) : null);
  }));
  return { value, status };
}
