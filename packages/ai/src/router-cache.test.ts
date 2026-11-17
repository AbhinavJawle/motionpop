import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { cacheKeyOf, createMemoryRouterCache, ROUTER_CACHE_TTL_MS } from './cache';
import {
  createRouter,
  type AIProvider,
  type ProviderRequest,
  type ProviderResponse,
  type RouterConfig,
  type TaskDef,
  type UsageEvent,
} from './router';

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast-model',
  modelStrong: 'strong-model',
  modelFilmBuild: 'strong-model',
  killSwitch: false,
};

const OutSchema = z.object({ n: z.number().int().min(0).max(10) });
type Out = z.infer<typeof OutSchema>;

const cacheable = (
  over: Partial<TaskDef<{ q: string }, Out>> = {},
): TaskDef<{ q: string }, Out> => ({
  id: 'test.cached',
  input: z.object({ q: z.string() }),
  output: OutSchema,
  mode: () => 'ONLY_IN_CLOUD',
  model: () => 'fast-model',
  system: 'sys',
  prompt: (i) => `q=${i.q}`,
  cloudCost: () => 1,
  cloudFallback: false,
  cacheable: true,
  promptVersion: 'v1',
  ...over,
});

/** A provider that answers from a queue and counts its calls. */
function fakeProvider(answers: ProviderResponse[]) {
  const calls: ProviderRequest[] = [];
  const provider: AIProvider = {
    async generate(req) {
      calls.push(req);
      const next = answers.shift();
      if (!next) throw new Error('no answer queued');
      return next;
    },
  };
  return { provider, calls };
}

const ok = (n: number, extra: Partial<ProviderResponse> = {}): ProviderResponse => ({
  text: JSON.stringify({ n }),
  ranOn: 'cloud',
  ...extra,
});

function setup(answers: ProviderResponse[], now = () => 0) {
  const { provider, calls } = fakeProvider(answers);
  const events: UsageEvent[] = [];
  const cache = createMemoryRouterCache(now);
  const router = createRouter({
    provider,
    config: () => CONFIG,
    onUsage: (e) => events.push(e),
    cache,
    now: () => 0,
  });
  return { router, calls, events, cache };
}

describe('router cache (spec 13b R4.1)', () => {
  it('a miss calls the model and stores the answer; the next identical call is a hit with no model call', async () => {
    const { router, calls, events } = setup([ok(3)]);
    const t = cacheable();
    const first = await router.run(t, { q: 'a' });
    expect(first).toMatchObject({ output: { n: 3 }, cached: false, costCredits: 1 });

    const second = await router.run(t, { q: 'a' });
    expect(second).toMatchObject({
      output: { n: 3 },
      cached: true,
      costCredits: 0,
      ranOn: 'cloud',
    });
    expect(calls).toHaveLength(1);
    expect(events[1]).toMatchObject({ cached: true, credits: 0, ok: true });
  });

  it('a hit keeps the ranOn of the stored answer', async () => {
    const { router } = setup([ok(2, { ranOn: 'device' })]);
    const t = cacheable({ mode: () => 'ONLY_ON_DEVICE' });
    await router.run(t, { q: 'x' });
    const hit = await router.run(t, { q: 'x' });
    expect(hit.ranOn).toBe('device');
    expect(hit.model).toBe('gemini-nano');
  });

  it('expires after the 7-day TTL', async () => {
    let clock = 0;
    const { provider, calls } = fakeProvider([ok(1), ok(5)]);
    const cache = createMemoryRouterCache(() => clock);
    const router = createRouter({ provider, config: () => CONFIG, cache });
    await router.run(cacheable(), { q: 'a' });
    clock = ROUTER_CACHE_TTL_MS - 1;
    expect((await router.run(cacheable(), { q: 'a' })).cached).toBe(true);
    clock = ROUTER_CACHE_TTL_MS;
    const fresh = await router.run(cacheable(), { q: 'a' });
    expect(fresh).toMatchObject({ cached: false, output: { n: 5 } });
    expect(calls).toHaveLength(2);
  });

  it('never stores an answer that fails the schema', async () => {
    const { router, calls, cache } = setup([
      { text: 'not json at all', ranOn: 'cloud' },
      { text: '{"n": 99}', ranOn: 'cloud' },
    ]);
    const t = cacheable();
    await expect(router.run(t, { q: 'a' })).rejects.toThrow();
    const key = cacheKeyOf({
      task: t.id,
      promptVersion: 'v1',
      model: 'fast-model',
      input: { q: 'a' },
    });
    expect(await cache.get(key)).toBeUndefined();
    expect(calls.length).toBeGreaterThan(0);
  });

  it('a task that is not cacheable is never cached', async () => {
    const { router, calls } = setup([ok(1), ok(1)]);
    const t = cacheable({ cacheable: false });
    await router.run(t, { q: 'a' });
    const again = await router.run(t, { q: 'a' });
    expect(again.cached).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('a different model is a different key, so no hit across models', async () => {
    const { router, calls } = setup([ok(1), ok(2)]);
    await router.run(cacheable({ model: () => 'fast-model' }), { q: 'a' });
    const other = await router.run(cacheable({ model: () => 'strong-model' }), { q: 'a' });
    expect(other.cached).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('a different prompt version or input is a different key', () => {
    const base = { task: 't', promptVersion: 'v1', model: 'm', input: { a: 1, b: [2] } };
    const key = cacheKeyOf(base);
    expect(cacheKeyOf({ ...base, promptVersion: 'v2' })).not.toBe(key);
    expect(cacheKeyOf({ ...base, input: { b: [2], a: 1 } })).toBe(key);
    expect(cacheKeyOf({ ...base, input: { a: 1, b: [3] } })).not.toBe(key);
  });

  it('allowCache: false skips the lookup and the store', async () => {
    const { router, calls } = setup([ok(1), ok(1)]);
    await router.run(cacheable(), { q: 'a' }, { allowCache: false });
    const again = await router.run(cacheable(), { q: 'a' }, { allowCache: false });
    expect(again.cached).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('reports cachedTokens from the provider on the result and the usage event', async () => {
    const { router, events } = setup([ok(4, { cachedTokens: 1200 })]);
    const r = await router.run(cacheable(), { q: 'a' });
    expect(r.cachedTokens).toBe(1200);
    expect(events[0]).toMatchObject({ cached: false, cachedTokens: 1200 });
  });

  it('a cache that throws does not fail the call', async () => {
    const { provider } = fakeProvider([ok(6)]);
    const cache = {
      get: vi.fn(async () => {
        throw new Error('idb down');
      }),
      set: vi.fn(async () => {
        throw new Error('idb down');
      }),
    };
    const router = createRouter({ provider, config: () => CONFIG, cache });
    expect(await router.run(cacheable(), { q: 'a' })).toMatchObject({
      output: { n: 6 },
      cached: false,
    });
  });
});
