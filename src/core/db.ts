// The meal log in IndexedDB (database `nuance`, store `meals`). Owner-gated (AGENTS.md).
import type { Meal } from './models';

const DB = 'nuance';
const STORE = 'meals';
const VERSION = 1;

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('at', 'at');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { opening = null; reject(req.error); };
  });
  return opening;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const allMeals = (): Promise<Meal[]> => tx('readonly', s => s.getAll() as IDBRequest<Meal[]>).then(list => list.sort((a, b) => b.at - a.at));
export const putMeal = (m: Meal): Promise<IDBValidKey> => tx('readwrite', s => s.put(m));
export const deleteMeal = (id: string): Promise<undefined> => tx('readwrite', s => s.delete(id));
export const clearMeals = (): Promise<undefined> => tx('readwrite', s => s.clear());
