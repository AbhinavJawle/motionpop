import type { CachedAnswer, RouterCache } from '@motionpop/ai';
import { STORES, done, openDb, req } from '@/lib/storage/idb';

/**
 * The router's answer cache in the browser (spec 13b R4.1): IndexedDB store `ai-cache`, one record
 * per key holding the answer and its expiry time. Expired records are removed when they are read.
 * `factory` and `now` are injected in tests.
 */
interface Record {
  value: CachedAnswer;
  expiresAt: number;
}

export function idbRouterCache(
  factory?: IDBFactory,
  now: () => number = () => Date.now(),
): RouterCache {
  return {
    async get(key) {
      const tx = (await openDb(factory)).transaction(STORES.aiCache, 'readwrite');
      const store = tx.objectStore(STORES.aiCache);
      const rec = (await req(store.get(key))) as Record | undefined;
      if (rec && now() >= rec.expiresAt) store.delete(key);
      await done(tx);
      return rec && now() < rec.expiresAt ? rec.value : undefined;
    },
    async set(key, value, ttlMs) {
      const tx = (await openDb(factory)).transaction(STORES.aiCache, 'readwrite');
      const record: Record = { value, expiresAt: now() + ttlMs };
      tx.objectStore(STORES.aiCache).put(record, key);
      await done(tx);
    },
  };
}
