import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { idbPartCache } from './part-cache';

const audio = (fill: number, samples = 500) => ({
  pcm: new Int16Array(samples).fill(fill),
  sampleRate: 24_000,
});

describe('idbPartCache', () => {
  it('returns a stored part with its samples and rate, and null for a miss', async () => {
    const cache = idbPartCache({ factory: new IDBFactory(), now: () => 0 });
    expect(await cache.get('a')).toBeNull();
    await cache.put('a', audio(7));
    const hit = await cache.get('a');
    expect(hit?.sampleRate).toBe(24_000);
    expect(Array.from(hit?.pcm ?? []).every((v) => v === 7)).toBe(true);
    expect(hit?.pcm.length).toBe(500);
  });

  it('drops a part after its 30 days', async () => {
    let clock = 0;
    const ttlMs = 1000;
    const cache = idbPartCache({ factory: new IDBFactory(), now: () => clock, ttlMs });
    await cache.put('a', audio(1));
    clock = 999;
    expect(await cache.get('a')).not.toBeNull();
    clock = 1000;
    expect(await cache.get('a')).toBeNull();
  });

  it('over the cap, the oldest parts go first and the new one stays', async () => {
    let clock = 1;
    // Each part is 1000 bytes; the cap fits two.
    const cache = idbPartCache({
      factory: new IDBFactory(),
      now: () => clock,
      maxBytes: 2000,
    });
    await cache.put('old', audio(1, 500));
    clock = 2;
    await cache.put('mid', audio(2, 500));
    clock = 3;
    await cache.put('new', audio(3, 500));
    expect(await cache.get('old')).toBeNull();
    expect(await cache.get('mid')).not.toBeNull();
    expect(await cache.get('new')).not.toBeNull();
  });

  it('a part larger than the cap is still kept for its own use', async () => {
    const cache = idbPartCache({ factory: new IDBFactory(), now: () => 0, maxBytes: 100 });
    await cache.put('big', audio(4, 500));
    expect(await cache.get('big')).not.toBeNull();
  });
});
