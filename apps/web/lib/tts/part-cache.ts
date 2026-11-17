import type { PartAudio, PartCache } from '@motionpop/ai';
import { STORES, done, openDb, req } from '@/lib/storage/idb';

/**
 * Voice parts kept in the browser (spec 13b R4.2): IndexedDB store `tts-cache`. Each part is a
 * `pcm:<key>` record. One `index` record lists every part's size and store time, so the cap can be
 * enforced without reading the audio. Parts older than 30 days are dropped; above 50 MB the oldest
 * parts go first. A new part is never evicted by its own store.
 */
export const TTS_PART_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const TTS_PART_MAX_BYTES = 50 * 1024 * 1024;

const INDEX = 'index';
const dataKey = (key: string) => `pcm:${key}`;

interface IndexEntry {
  key: string;
  storedAt: number;
  bytes: number;
}
interface Index {
  entries: IndexEntry[];
}
interface Stored {
  pcm: ArrayBuffer;
  sampleRate: number;
}

export interface IdbPartCacheOptions {
  factory?: IDBFactory;
  now?: () => number;
  ttlMs?: number;
  maxBytes?: number;
}

export function idbPartCache(opts: IdbPartCacheOptions = {}): PartCache {
  const factory = opts.factory;
  const now = opts.now ?? (() => Date.now());
  const ttlMs = opts.ttlMs ?? TTS_PART_TTL_MS;
  const maxBytes = opts.maxBytes ?? TTS_PART_MAX_BYTES;
  const fresh = (e: IndexEntry) => now() - e.storedAt < ttlMs;

  return {
    async get(key) {
      const tx = (await openDb(factory)).transaction(STORES.ttsCache, 'readwrite');
      const store = tx.objectStore(STORES.ttsCache);
      const index = ((await req(store.get(INDEX))) as Index | undefined) ?? { entries: [] };
      const entry = index.entries.find((e) => e.key === key);
      let audio: PartAudio | null = null;
      if (entry) {
        const rec = (await req(store.get(dataKey(key)))) as Stored | undefined;
        if (rec && fresh(entry)) {
          audio = { pcm: new Int16Array(rec.pcm), sampleRate: rec.sampleRate };
        } else {
          // Expired, or the audio is missing: forget it.
          store.delete(dataKey(key));
          store.put({ entries: index.entries.filter((e) => e.key !== key) }, INDEX);
        }
      }
      await done(tx);
      return audio;
    },

    async put(key, audio) {
      const tx = (await openDb(factory)).transaction(STORES.ttsCache, 'readwrite');
      const store = tx.objectStore(STORES.ttsCache);
      const index = ((await req(store.get(INDEX))) as Index | undefined) ?? { entries: [] };
      const storedAt = now();
      const rest = index.entries.filter((e) => e.key !== key && fresh(e));
      const expired = index.entries.filter((e) => e.key !== key && !fresh(e));
      for (const e of expired) store.delete(dataKey(e.key));

      const entries = [...rest, { key, storedAt, bytes: audio.pcm.byteLength }].sort(
        (a, b) => a.storedAt - b.storedAt,
      );
      let total = entries.reduce((n, e) => n + e.bytes, 0);
      // Oldest first, but never the part just stored.
      while (total > maxBytes && entries.length > 1 && entries[0]?.key !== key) {
        const oldest = entries.shift();
        if (!oldest) break;
        total -= oldest.bytes;
        store.delete(dataKey(oldest.key));
      }
      const pcm = audio.pcm.slice().buffer;
      const record: Stored = { pcm, sampleRate: audio.sampleRate };
      store.put(record, dataKey(key));
      store.put({ entries }, INDEX);
      await done(tx);
    },
  };
}
