import fc from 'fast-check';
import { components } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { createRouter, type AIProvider, type ProviderRequest, type RouterConfig } from '../router';
import { applyParamsPatch, editPatchTask, paramsSchemaSummary } from './edit-patch';

const registry = components as Record<string, { params: z.ZodType }>;
const bigNumber = registry['big-number']!.params;
const task = editPatchTask((id) => registry[id]?.params);

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  killSwitch: false,
};
const PARAMS = { value: 40, suffix: '%', decimals: 0, label: 'Revenue grew', countFrom: 0 };
const input = (instruction: string) => ({
  componentId: 'big-number',
  paramsSchemaSummary: paramsSchemaSummary(bigNumber),
  currentParams: PARAMS,
  instruction,
});

function scripted(answers: string[]): AIProvider & { calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = [];
  return {
    calls,
    generate(req) {
      calls.push(req);
      const text = answers[calls.length - 1];
      if (text === undefined) return Promise.reject(new Error('unexpected call'));
      const ranOn = req.mode.includes('CLOUD') ? ('cloud' as const) : ('device' as const);
      return Promise.resolve({ text, ranOn });
    },
  };
}
const run = (answers: string[], instruction = 'change 40 to 45') => {
  const provider = scripted(answers);
  const router = createRouter({ provider, config: () => CONFIG });
  return { provider, result: router.run(task, input(instruction)) };
};

describe('applyParamsPatch', () => {
  it('applies replace, add and remove to a copy', () => {
    const r = applyParamsPatch(PARAMS, [
      { op: 'replace', path: '/value', value: 45 },
      { op: 'add', path: '/prefix', value: '$' },
      { op: 'remove', path: '/suffix' },
    ]);
    expect(r).toEqual({
      ok: true,
      params: { value: 45, prefix: '$', decimals: 0, label: 'Revenue grew', countFrom: 0 },
    });
    expect(PARAMS.value).toBe(40);
  });

  it('rejects missing paths and non-object results', () => {
    expect(applyParamsPatch(PARAMS, [{ op: 'replace', path: '/nope/x', value: 1 }]).ok).toBe(false);
    expect(applyParamsPatch(PARAMS, [{ op: 'remove', path: '/missing' }]).ok).toBe(false);
    expect(applyParamsPatch(PARAMS, [{ op: 'replace', path: '', value: 3 }])).toEqual({
      ok: false,
      error: 'params must stay an object',
    });
  });
});

describe('paramsSchemaSummary', () => {
  it('is compact JSON Schema with the field descriptions', () => {
    const s = paramsSchemaSummary(bigNumber);
    expect(s).not.toContain('$schema');
    expect(JSON.parse(s)).toMatchObject({ type: 'object', properties: { value: {}, label: {} } });
    expect(s).toContain('exactly as spoken');
  });
});

describe('edit.patch through the router', () => {
  it('returns a valid on-device patch for free', async () => {
    const { result, provider } = run(['{"patch":[{"op":"replace","path":"/value","value":45}]}']);
    expect(await result).toMatchObject({
      output: { patch: [{ op: 'replace', path: '/value', value: 45 }] },
      ranOn: 'device',
      costCredits: 0,
      attempts: 1,
    });
    expect(provider.calls[0]?.mode).toBe('PREFER_ON_DEVICE');
    expect(provider.calls[0]?.thinking).toBe('MINIMAL');
  });

  it('repairs a patch that breaks the component schema, feeding back the error', async () => {
    const tooLong = 'x'.repeat(60);
    const { result, provider } = run([
      `{"patch":[{"op":"replace","path":"/label","value":"${tooLong}"}]}`,
      '{"patch":[{"op":"replace","path":"/label","value":"Sales"}]}',
    ]);
    expect((await result).attempts).toBe(2);
    expect(provider.calls[1]?.prompt).toContain('the patched params are invalid');
  });

  it('repairs a patch on a missing path, then falls back to the cloud (1 credit)', async () => {
    const bad = '{"patch":[{"op":"remove","path":"/nope"}]}';
    const { result, provider } = run([bad, bad, '{"patch":[{"op":"remove","path":"/suffix"}]}']);
    expect(await result).toMatchObject({ ranOn: 'cloud', costCredits: 1, attempts: 3 });
    expect(provider.calls.map((c) => c.mode)).toEqual([
      'PREFER_ON_DEVICE',
      'PREFER_ON_DEVICE',
      'PREFER_IN_CLOUD',
    ]);
  });

  it('accepts an escalation without a patch, and repairs an empty patch', async () => {
    const esc = run(['{"patch":[],"escalate":true,"message":"Needs a new graphic"}'], 'make a map');
    expect((await esc.result).output).toMatchObject({ escalate: true });
    const empty = run(['{"patch":[]}', '{"patch":[{"op":"replace","path":"/value","value":45}]}']);
    expect((await empty.result).attempts).toBe(2);
  });

  it('never returns a patch that leaves big-number params invalid (property)', async () => {
    const op = fc.oneof(
      fc.record({
        op: fc.constant('replace'),
        path: fc.constantFrom('/value', '/label', '/decimals', '/suffix', '/nope'),
        value: fc.oneof(fc.integer({ min: -5, max: 100 }), fc.string({ maxLength: 60 })),
      }),
      fc.record({ op: fc.constant('remove'), path: fc.constantFrom('/suffix', '/label', '/x') }),
      fc.record({
        op: fc.constant('add'),
        path: fc.constantFrom('/prefix', '/context'),
        value: fc.string({ maxLength: 70 }),
      }),
    );
    const answer = fc.array(op, { maxLength: 3 }).map((patch) => JSON.stringify({ patch }));
    await fc.assert(
      fc.asyncProperty(fc.array(answer, { minLength: 3, maxLength: 3 }), async (answers) => {
        const { result } = run(answers);
        try {
          const r = await result;
          const applied = applyParamsPatch(PARAMS, r.output.patch);
          expect(applied.ok).toBe(true);
          if (applied.ok) expect(bigNumber.safeParse(applied.params).success).toBe(true);
        } catch (err) {
          expect((err as { reason?: string }).reason).toBe('invalid-output');
        }
      }),
      { numRuns: 200 },
    );
  });
});
