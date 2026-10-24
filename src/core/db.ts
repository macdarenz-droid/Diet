// The meal log in IndexedDB (database `nuance`, store `meals`). Owner-gated (AGENTS.md).
import type { Meal, WeighIn } from './models';

const DB = 'nuance';
const STORE = 'meals';
const WEIGHINS = 'weighins';
/** 2 adds the weigh-in log (owner, 2026-10-24). */
const VERSION = 2;

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('at', 'at');
      if (!db.objectStoreNames.contains(WEIGHINS)) db.createObjectStore(WEIGHINS, { keyPath: 'at' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // A connection the browser closes (or a newer version replaces) must not be reused.
      db.onclose = () => { opening = null; };
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    req.onerror = () => { opening = null; reject(req.error); };
  });
  return opening;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/** Asks the browser not to evict the log under storage pressure (granted silently on most phones). */
export function persistStorage(): void {
  try { void navigator.storage?.persist?.(); } catch { /* not supported */ }
}

export const allMeals = (): Promise<Meal[]> => tx('readonly', s => s.getAll() as IDBRequest<Meal[]>).then(list => list.sort((a, b) => b.at - a.at));
export const putMeal = (m: Meal): Promise<IDBValidKey> => tx('readwrite', s => s.put(m));
export const deleteMeal = (id: string): Promise<undefined> => tx('readwrite', s => s.delete(id));
export const clearMeals = (): Promise<undefined> => tx('readwrite', s => s.clear());

export const allWeighIns = (): Promise<WeighIn[]> => tx('readonly', s => s.getAll() as IDBRequest<WeighIn[]>, WEIGHINS).then(l => l.sort((a, b) => a.at - b.at));
export const putWeighIn = (w: WeighIn): Promise<IDBValidKey> => tx('readwrite', s => s.put(w), WEIGHINS);
export const deleteWeighIn = (at: number): Promise<undefined> => tx('readwrite', s => s.delete(at), WEIGHINS);
export const clearWeighIns = (): Promise<undefined> => tx('readwrite', s => s.clear(), WEIGHINS);

/** Removes everything Nuance stores on this device (meals, weigh-ins, profile with body details, key,
 * usage, offline copy), then reloads into a fresh app. Each store is cleared on its own, so one failure
 * does not leave the others behind. */
export async function eraseAll(): Promise<void> {
  try { await clearMeals(); } catch { /* database blocked */ }
  try { await clearWeighIns(); } catch { /* database blocked */ }
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('nuance.')) localStorage.removeItem(k); } catch { /* storage blocked */ }
  try { for (const k of await caches.keys()) if (k.startsWith('nuance-')) await caches.delete(k); } catch { /* no Cache Storage */ }
  location.reload();
}
