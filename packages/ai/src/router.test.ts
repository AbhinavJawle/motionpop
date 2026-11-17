import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { InferenceMode } from '@motionpop/schemas';
import {
  createRouter,
  extractJson,
  RouterError,
  type AIProvider,
  type ProviderRequest,
  type ProviderResponse,
  type RouterConfig,
  type TaskDef,
  type UsageEvent,
} from './router';
import { slotsDetect, slotsDetectCost, type SlotsDetectInput } from './tasks/slots-detect';

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

const task = (over: Partial<TaskDef<{ q: string }, Out>> = {}): TaskDef<{ q: string }, Out> => ({
  id: 'test.task',
  input: z.object({ q: z.string() }),
  output: OutSchema,
  mode: () => 'PREFER_ON_DEVICE',
  model: (cfg) => cfg.modelFast,
  system: 'sys',
  prompt: (i) => `q=${i.q}`,
  cloudCost: () => 2,
  cloudFallback: false,
  ...over,
});

/** Provider that answers from a script; each step sees the request. */
function scripted(
  steps: ((req: ProviderRequest) => ProviderResponse | Error)[],
): AIProvider & { calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = [];
  return {
    calls,
    generate(req) {
      calls.push(req);
      const step = steps[calls.length - 1];
      if (!step) return Promise.reject(new Error('unexpected call'));
      const r = step(req);
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
  };
}

const ranOnFor = (m: InferenceMode) =>
  m === 'ONLY_IN_CLOUD' || m === 'PREFER_IN_CLOUD' ? ('cloud' as const) : ('device' as const);
const answer = (text: string) => (req: ProviderRequest) => ({ text, ranOn: ranOnFor(req.mode) });

const make = (provider: AIProvider, cfg: Partial<RouterConfig> = {}) => {
  const usage: UsageEvent[] = [];
  let t = 0;
  const router = createRouter({
    provider,
    config: () => ({ ...CONFIG, ...cfg }),
    onUsage: (e) => usage.push(e),
    now: () => (t += 5),
  });
  return { router, usage };
};

describe('extractJson', () => {
  it('reads plain, fenced and prose-wrapped JSON', () => {
    expect(extractJson('{"n":1}')).toEqual({ n: 1 });
    expect(extractJson('```json\n{"n":2}\n```')).toEqual({ n: 2 });
    expect(extractJson('Sure! {"n":3} hope this helps')).toEqual({ n: 3 });
    expect(() => extractJson('no json here')).toThrow(SyntaxError);
  });
});

describe('createRouter', () => {
  it('returns a valid device answer for free', async () => {
    const p = scripted([answer('{"n":4}')]);
    const { router, usage } = make(p);
    const r = await router.run(task(), { q: 'a' });
    expect(r).toMatchObject({ output: { n: 4 }, ranOn: 'device', costCredits: 0, attempts: 1 });
    expect(r.model).toBe('gemini-nano'); // a device run names Chrome's model, not the cloud one
    expect(p.calls[0]?.mode).toBe('PREFER_ON_DEVICE');
    expect(p.calls[0]?.jsonSchema).toMatchObject({ type: 'object' });
    expect(usage).toEqual([
      expect.objectContaining({ ok: true, credits: 0, cloudCost: 2, ranOn: 'device' }),
    ]);
  });

  it('passes the task media to the provider', async () => {
    const p = scripted([answer('{"n":1}')]);
    const { router } = make(p);
    const media = { mimeType: 'audio/wav' as const, base64: 'UklG' };
    await router.run(task({ media: () => media }), { q: 'a' });
    expect(p.calls[0]?.media).toEqual(media);
    const p2 = scripted([answer('{"n":1}')]);
    await make(p2).router.run(task(), { q: 'a' });
    expect(p2.calls[0]).not.toHaveProperty('media');
  });

  it('charges the cloud cost only when the answer came from the cloud', async () => {
    // PREFER_ON_DEVICE can still land in the cloud (no Nano): the provider reports it.
    const p = scripted([() => ({ text: '{"n":1}', ranOn: 'cloud' })]);
    const r = await make(p).router.run(task(), { q: 'a' });
    expect(r).toMatchObject({ ranOn: 'cloud', costCredits: 2 });
  });

  it('repairs once with the validation error in the prompt', async () => {
    const p = scripted([answer('{"n":99}'), answer('{"n":9}')]);
    const r = await make(p).router.run(task(), { q: 'a' });
    expect(r).toMatchObject({ output: { n: 9 }, attempts: 2 });
    expect(p.calls[1]?.prompt).toContain('previous answer was invalid');
    expect(p.calls[1]?.mode).toBe('PREFER_ON_DEVICE');
  });

  it('repairs up to maxRepairs times, each round with the latest error', async () => {
    const p = scripted([answer('{"n":99}'), answer('{"n":-1}'), answer('{"n":3}')]);
    const r = await make(p).router.run(task({ maxRepairs: 2 }), { q: 'a' });
    expect(r).toMatchObject({ output: { n: 3 }, attempts: 3, ranOn: 'device' });
    expect(p.calls[2]?.prompt).toContain('previous answer was invalid');

    const p2 = scripted([answer('bad'), answer('bad'), answer('bad')]);
    await expect(make(p2).router.run(task({ maxRepairs: 2 }), { q: 'a' })).rejects.toMatchObject({
      reason: 'invalid-output',
    });
    expect(p2.calls).toHaveLength(3);
  });

  it('does not escalate to the cloud unless the task allows it', async () => {
    const p = scripted([answer('bad'), answer('bad')]);
    const { router, usage } = make(p);
    await expect(router.run(task(), { q: 'a' })).rejects.toMatchObject({
      reason: 'invalid-output',
    });
    expect(p.calls).toHaveLength(2);
    expect(usage).toEqual([expect.objectContaining({ ok: false, credits: 0, cloudCost: 2 })]);
  });

  it('escalates to the cloud after a failed repair when cloudFallback is set', async () => {
    const p = scripted([answer('bad'), answer('{"n":11}'), answer('{"n":1}')]);
    const r = await make(p).router.run(task({ cloudFallback: true }), { q: 'a' });
    expect(r).toMatchObject({ output: { n: 1 }, ranOn: 'cloud', costCredits: 2, attempts: 3 });
    expect(p.calls[2]?.mode).toBe('PREFER_IN_CLOUD');
  });

  it('allowCloud: false turns the cloud fallback off for that call (no attempt after a bad device answer)', async () => {
    const p = scripted([answer('bad'), answer('{"n":11}'), answer('{"n":1}')]);
    const { router, usage } = make(p);
    await expect(
      router.run(task({ cloudFallback: true }), { q: 'a' }, { allowCloud: false }),
    ).rejects.toMatchObject({ reason: 'invalid-output' });
    expect(p.calls).toHaveLength(2);
    expect(p.calls.every((c) => c.mode === 'PREFER_ON_DEVICE')).toBe(true);
    expect(usage).toEqual([
      expect.objectContaining({ ok: false, ranOn: 'device', credits: 0, cloudCost: 2 }),
    ]);
  });

  it('allowCloud: false also stops the cloud retry after a provider failure on the device', async () => {
    const p = scripted([() => new Error('model unavailable'), answer('{"n":2}')]);
    await expect(
      make(p).router.run(task({ cloudFallback: true }), { q: 'a' }, { allowCloud: false }),
    ).rejects.toMatchObject({ reason: 'provider' });
    expect(p.calls).toHaveLength(1);
  });

  it('without the option, and with allowCloud: true, the task keeps its own fallback', async () => {
    for (const opts of [undefined, { allowCloud: true }]) {
      const p = scripted([answer('bad'), answer('bad'), answer('{"n":1}')]);
      const r = await make(p).router.run(task({ cloudFallback: true }), { q: 'a' }, opts);
      expect(r).toMatchObject({ ranOn: 'cloud', attempts: 3 });
    }
  });

  it('allowCloud: false never blocks a call made in the cloud mode itself', async () => {
    const p = scripted([answer('{"n":3}')]);
    const r = await make(p).router.run(
      task({ cloudFallback: true }),
      { q: 'a' },
      { mode: 'ONLY_IN_CLOUD', allowCloud: false },
    );
    expect(r).toMatchObject({ ranOn: 'cloud', costCredits: 2 });
  });

  it('every usage event carries cloudCost, on success, failure and the cloud', async () => {
    const { router, usage } = make(
      scripted([answer('{"n":1}'), answer('bad'), answer('bad'), answer('{"n":2}')]),
    );
    await router.run(task(), { q: 'a' });
    await expect(router.run(task(), { q: 'a' })).rejects.toBeInstanceOf(RouterError);
    await router.run(task(), { q: 'a' }, { mode: 'ONLY_IN_CLOUD' });
    expect(usage.map((u) => u.cloudCost)).toEqual([2, 2, 2]);
    expect(usage.map((u) => u.ok)).toEqual([true, false, true]);
  });

  it('skips the repair after a provider failure', async () => {
    const p = scripted([() => new Error('model unavailable'), answer('{"n":2}')]);
    const r = await make(p).router.run(task({ cloudFallback: true }), { q: 'a' });
    expect(r).toMatchObject({ ranOn: 'cloud', attempts: 2 });
    expect(p.calls[1]?.prompt).toBe('q=a');

    const p2 = scripted([() => new Error('offline')]);
    await expect(make(p2).router.run(task(), { q: 'a' })).rejects.toMatchObject({
      reason: 'provider',
      message: 'offline',
    });
    expect(p2.calls).toHaveLength(1);
  });

  it('rejects invalid input without calling the provider', async () => {
    const p = scripted([]);
    const bad = { q: 5 } as unknown as { q: string };
    await expect(make(p).router.run(task(), bad)).rejects.toBeInstanceOf(RouterError);
    expect(p.calls).toHaveLength(0);
  });

  it('applies the mode precedence: call option > Remote Config override > task default', async () => {
    const p = scripted([answer('{"n":1}'), answer('{"n":1}'), answer('{"n":1}')]);
    const { router } = make(p, { routingOverrides: { 'test.task': 'ONLY_IN_CLOUD' } });
    await router.run(task(), { q: 'a' }, { mode: 'ONLY_ON_DEVICE' });
    await router.run(task(), { q: 'a' });
    await make(p).router.run(task(), { q: 'a' });
    expect(p.calls.map((c) => c.mode)).toEqual([
      'ONLY_ON_DEVICE',
      'ONLY_IN_CLOUD',
      'PREFER_ON_DEVICE',
    ]);
  });

  it('kill switch: blocks cloud-only work and pins everything else to the device', async () => {
    const p = scripted([answer('{"n":1}'), answer('{"n":1}')]);
    const { router } = make(p, { killSwitch: true });
    await expect(
      router.run(task({ mode: () => 'ONLY_IN_CLOUD' }), { q: 'a' }),
    ).rejects.toMatchObject({ reason: 'kill-switch' });
    await router.run(task({ mode: () => 'PREFER_IN_CLOUD' }), { q: 'a' });
    await router.run(task({ cloudFallback: true }), { q: 'a' });
    expect(p.calls.map((c) => c.mode)).toEqual(['ONLY_ON_DEVICE', 'ONLY_ON_DEVICE']);
  });

  it('never returns output that fails the task schema (property)', async () => {
    const text = fc.oneof(
      fc.integer({ min: -5, max: 20 }).map((n) => JSON.stringify({ n })),
      fc.string(),
      fc.constant('{"n": 1.5}'),
      fc.constant('```json\n{"n":3}\n```'),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.option(text, { nil: null }), { minLength: 3, maxLength: 3 }),
        fc.boolean(),
        async (answers, cloudFallback) => {
          const p = scripted(
            answers.map((a) => (req) => (a === null ? new Error('down') : answer(a)(req))),
          );
          const onUsage = vi.fn();
          const router = createRouter({ provider: p, config: () => CONFIG, onUsage });
          try {
            const r = await router.run(task({ cloudFallback }), { q: 'x' });
            expect(OutSchema.safeParse(r.output).success).toBe(true);
            expect(r.costCredits).toBe(r.ranOn === 'cloud' ? 2 : 0);
          } catch (err) {
            expect(err).toBeInstanceOf(RouterError);
          }
          expect(p.calls.length).toBeLessThanOrEqual(cloudFallback ? 3 : 2);
          expect(onUsage).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('slots.detect task', () => {
  const words = (n: number): SlotsDetectInput['words'] =>
    Array.from({ length: n }, (_, i) => [i, `w${i}`, i * 300, i * 300 + 250] as const).map(
      (w) => [...w] as [number, string, number, number],
    );
  const input = (n: number): SlotsDetectInput => ({
    words: words(n),
    candidates: [],
    components: [{ id: 'big-number', useWhen: 'a single number', built: true }],
    skills: [{ id: 'stat-hero', useWhen: 'one stat', worksWith: ['big-number'] }],
    maxSlots: 3,
    language: 'en',
  });

  it('runs on-device up to the word limit and in the cloud above it', () => {
    expect(slotsDetect.mode(input(400), CONFIG)).toBe('PREFER_ON_DEVICE');
    expect(slotsDetect.mode(input(401), CONFIG)).toBe('PREFER_IN_CLOUD');
    expect(slotsDetect.model(CONFIG)).toBe('strong-model');
    expect(slotsDetect.cloudFallback).toBe(false);
  });

  it('costs 1 credit per started 200 words, at least 1', () => {
    expect([0, 1, 200, 201, 400, 401].map(slotsDetectCost)).toEqual([1, 1, 1, 2, 2, 3]);
  });

  it('puts the words, components and limits in the prompt', () => {
    const p = slotsDetect.prompt(input(2));
    expect(p).toContain('maxSlots: 3');
    expect(p).toContain('[0,"w0",0,250]');
    expect(p).toContain('"big-number"');
  });

  it('end to end through the router with a valid suggestion', async () => {
    const suggestion = {
      wordStart: 0,
      wordEnd: 1,
      componentId: 'big-number',
      skillId: 'stat-hero',
      reason: "You said 'w0 w1'",
      score: 0.9,
      params: { value: 40, suffix: '%', decimals: 0, label: 'Revenue' },
    };
    const p = scripted([answer(JSON.stringify({ slots: [suggestion] }))]);
    const r = await make(p).router.run(slotsDetect, input(2));
    expect(r.output.slots).toEqual([suggestion]);
    expect(r).toMatchObject({ ranOn: 'device', costCredits: 0 });
  });
});
