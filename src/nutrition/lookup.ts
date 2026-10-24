// Grounds items in the offline food tables (docs/FOOD-DATA.md): every distinct search name once,
// on the device, with no key and no network. Items from a nutrition label are left alone.
import type { Item } from '@/core/models';
import type { Candidate } from './candidate';
import { applyCandidate, choose } from './ground';
import { nextTask, searchLocal } from './foods';

/** Distinct lookups one scan may make, so text in a photo cannot make a scan crawl. */
export const LOOKUPS_MAX = 24;

/** A search name as a food table would spell it: letters, digits, spaces and , ( ) ' - only. */
export function cleanQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9 ,()'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** 'unavailable' when the tables could not be loaded (first run offline before they were cached). */
export type GroundStatus = 'done' | 'unavailable';

export interface GroundResult<T> { value: T; status: GroundStatus }

type Search = (query: string) => Promise<Candidate[]>;

export async function groundAll(lists: Item[][], opts: { search?: Search; signal?: AbortSignal } = {}): Promise<GroundResult<Item[][]>> {
  const run: Search = opts.search ?? (q => searchLocal(q, 12));
  // The meal's own items come first in lists[0], so the cap only ever trims swap lookups.
  const queries = [...new Set(lists.flat().filter(i => i.source !== 'label').map(i => cleanQuery(i.query)).filter(Boolean))].slice(0, LOOKUPS_MAX);
  const found = new Map<string, Candidate[]>();
  let status: GroundStatus = 'done';
  for (const q of queries) {
    // Each search runs in a task of its own, so the screen paints and Back is handled in between.
    await nextTask();
    if (opts.signal?.aborted) break;
    try { found.set(q, await run(q)); } catch { status = 'unavailable'; break; }
  }
  const value = lists.map(items => items.map(it => {
    if (it.source === 'label') return it;
    const c = found.get(cleanQuery(it.query));
    return applyCandidate(it, c ? choose(it.query, it.estimate, c) : null);
  }));
  return { value, status };
}
