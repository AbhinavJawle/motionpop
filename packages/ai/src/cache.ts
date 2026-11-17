import { sha256Hex, stableJson, type RanOn } from '@motionpop/schemas';

/**
 * The answer cache for free routed tasks (spec 13b R4.1). The router stores only zod-valid
 * outputs, keyed by task, prompt version, model and the input. Entries expire after `ttlMs`.
 * The app supplies an IndexedDB implementation (apps/web/lib/ai); tests use the in-memory one.
 */
export interface CachedAnswer {
  output: unknown;
  /** Where the stored answer ran; a hit reports it unchanged. */
  ranOn: RanOn;
  model: string;
}

export interface RouterCache {
  get(key: string): Promise<CachedAnswer | undefined>;
  set(key: string, value: CachedAnswer, ttlMs: number): Promise<void>;
}

/** 7 days (spec 13b R4.1). */
export const ROUTER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The cache key: sha256 over the task, its prompt version, the model and the stable input text. */
export function cacheKeyOf(parts: {
  task: string;
  promptVersion: string;
  model: string;
  input: unknown;
}): string {
  return sha256Hex(
    [parts.task, parts.promptVersion, parts.model, stableJson(parts.input)].join('\n'),
  );
}

/** A cache in memory. Expired entries are removed when they are read. */
export function createMemoryRouterCache(now: () => number = () => Date.now()): RouterCache {
  const entries = new Map<string, { value: CachedAnswer; expiresAt: number }>();
  return {
    async get(key) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now() >= hit.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      return hit.value;
    },
    async set(key, value, ttlMs) {
      entries.set(key, { value, expiresAt: now() + ttlMs });
    },
  };
}
