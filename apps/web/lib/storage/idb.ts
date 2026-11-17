/**
 * The app's one IndexedDB database. Every store is created here, so the projects repository
 * and the audio store never race each other over versions.
 *   v1: projects
 *   v2: audio (spec 05)
 *   v3: uploads (spec 11 task 7: the audio upload queue, so a failed upload survives a reload)
 *   v4: aiCache, ttsCache (spec 13b R4). Migration: only creates the two new stores; existing
 *       stores and their data are untouched.
 */
export const DB_NAME = 'motionpop';
export const DB_VERSION = 4;
export const STORES = {
  projects: 'projects',
  audio: 'audio',
  uploads: 'uploads',
  aiCache: 'ai-cache',
  ttsCache: 'tts-cache',
} as const;

/** Opens the database once per factory (`indexedDB` resolved lazily so SSR can import this). */
const opened = new WeakMap<IDBFactory, Promise<IDBDatabase>>();
export function openDb(factory?: IDBFactory): Promise<IDBDatabase> {
  const f = factory ?? indexedDB;
  let db = opened.get(f);
  if (!db) {
    db = new Promise((resolve, reject) => {
      const r = f.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        for (const name of Object.values(STORES)) {
          if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name);
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('IndexedDB open failed'));
      r.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
    });
    db.catch(() => opened.delete(f));
    opened.set(f, db);
  }
  return db;
}

export function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
  });
}
