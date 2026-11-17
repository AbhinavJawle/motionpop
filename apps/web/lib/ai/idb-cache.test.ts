import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { idbRouterCache } from './idb-cache';

const answer = { output: { n: 2 }, ranOn: 'device' as const, model: 'gemini-nano' };

describe('idbRouterCache', () => {
  it('stores an answer and returns it until it expires', async () => {
    let clock = 1_000;
    const cache = idbRouterCache(new IDBFactory(), () => clock);
    await cache.set('k', answer, 500);
    expect(await cache.get('k')).toEqual(answer);
    clock = 1_499;
    expect(await cache.get('k')).toEqual(answer);
    clock = 1_500;
    expect(await cache.get('k')).toBeUndefined();
  });

  it('answers a missing key with undefined', async () => {
    const cache = idbRouterCache(new IDBFactory(), () => 0);
    expect(await cache.get('nope')).toBeUndefined();
  });

  it('keeps the entries of two factories apart', async () => {
    const a = idbRouterCache(new IDBFactory(), () => 0);
    const b = idbRouterCache(new IDBFactory(), () => 0);
    await a.set('k', answer, 1000);
    expect(await b.get('k')).toBeUndefined();
  });
});
