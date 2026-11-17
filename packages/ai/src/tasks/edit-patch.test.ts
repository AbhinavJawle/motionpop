import fc from 'fast-check';
import { components, schemaFor } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { editContext, splitEditDoc, type TimingDefaults } from '../edit/edit-doc';
import { createRouter, type AIProvider, type ProviderRequest, type RouterConfig } from '../router';
import { applyParamsPatch, editPatchTask } from './edit-patch';
import type { PatchCheckOptions } from './patch-check';

const DEFAULTS: TimingDefaults = { speed: 1, ease: 'inOut', fade: true };
const bigNumber = (components as Record<string, { params: z.ZodType }>)['big-number']!.params;
const PARAMS = { value: 40, suffix: '%', decimals: 0, label: 'Revenue grew', countFrom: 0 };
const STAT = {
  variant: 'hero',
  content: { value: 40, suffix: '%', decimals: 0, label: 'Revenue grew', countFrom: 0 },
  beats: [],
  images: [],
};

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  modelFilmBuild: 'strong',
  killSwitch: false,
};

const input = (
  instruction: string,
  id = 'big-number',
  params: Record<string, unknown> = PARAMS,
) => ({
  ...editContext(schemaFor(id)!, id, params, undefined, DEFAULTS),
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
const run = (
  answers: string[],
  instruction = 'change 40 to 45',
  opts: PatchCheckOptions = { timingDefaults: DEFAULTS },
  id = 'big-number',
  params: Record<string, unknown> = PARAMS,
) => {
  const provider = scripted(answers);
  const router = createRouter({ provider, config: () => CONFIG });
  return {
    provider,
    result: router.run(editPatchTask(schemaFor, opts), input(instruction, id, params), {
      mode: 'ONLY_ON_DEVICE',
      allowCloud: false,
    }),
  };
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

describe('edit.patch v2: input, structured output and prompt', () => {
  const task = editPatchTask(schemaFor);

  it('sends the paths as an enum and the ops as an enum, in the structured output', () => {
    const i = task.input.parse(input('make it slower'));
    const schema = task.jsonSchema!(i) as {
      properties: {
        patch: { items: { properties: { op: { enum: string[] }; path: { enum: string[] } } } };
      };
    };
    const props = schema.properties.patch.items.properties;
    expect(props.op.enum).toEqual(['replace', 'add', 'remove']);
    expect(props.path.enum).toEqual(i.paths);
    expect(props.path.enum).toContain('/timing/speed');
  });

  it('puts the field guide and the current document in the prompt, with no schema text', () => {
    const i = task.input.parse(input('make it slower'));
    const p = task.prompt(i);
    expect(p).toContain('/value: number. The number to land on');
    expect(p).toContain('"timing":{"speed":1');
    expect(p).toContain('instruction: make it slower');
    expect(p.replace(/\s+/g, '')).not.toContain('"type":"object"');
    expect(p).not.toContain('properties');
    expect(task.cloudFallback).toBe(false);
  });

  it('rejects input without paths or with a path that is not a JSON pointer', () => {
    expect(task.input.safeParse({ ...input('x'), paths: [] }).success).toBe(false);
    expect(task.input.safeParse({ ...input('x'), paths: ['value'] }).success).toBe(false);
  });
});

describe('edit.patch v2 through the router', () => {
  it('returns a valid on-device patch for free, on an explicit device mode', async () => {
    const { result, provider } = run(['{"patch":[{"op":"replace","path":"/value","value":45}]}']);
    expect(await result).toMatchObject({
      output: { patch: [{ op: 'replace', path: '/value', value: 45 }] },
      ranOn: 'device',
      costCredits: 0,
      attempts: 1,
    });
    expect(provider.calls[0]?.mode).toBe('ONLY_ON_DEVICE');
    expect(provider.calls[0]?.thinking).toBe('MINIMAL');
    expect(JSON.stringify(provider.calls[0]?.jsonSchema)).toContain('"/timing/speed"');
  });

  it('accepts a timing change through the edit document', async () => {
    const { result } = run(['{"patch":[{"op":"replace","path":"/timing/speed","value":0.8}]}']);
    const r = await result;
    const applied = applyParamsPatch(input('x').current, r.output.patch);
    expect(applied.ok && splitEditDoc(applied.params, DEFAULTS)).toMatchObject({
      params: PARAMS,
      timing: { speed: 0.8 },
    });
  });

  it('repairs a path that is not on the list, feeding back the reason', async () => {
    const { result, provider } = run([
      '{"patch":[{"op":"replace","path":"/beats/0/word","value":3}]}',
      '{"patch":[{"op":"replace","path":"/value","value":45}]}',
    ]);
    expect((await result).attempts).toBe(2);
    expect(provider.calls[1]?.prompt).toContain('/beats/0/word is not editable');
  });

  it('repairs timing outside its range', async () => {
    const { result, provider } = run([
      '{"patch":[{"op":"replace","path":"/timing/speed","value":5}]}',
      '{"patch":[{"op":"replace","path":"/timing/speed","value":1.25}]}',
    ]);
    expect((await result).attempts).toBe(2);
    expect(provider.calls[1]?.prompt).toContain('the timing is invalid');
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

  it('after a failed repair it fails: no automatic cloud attempt, nothing is charged (D-035)', async () => {
    const bad = '{"patch":[{"op":"remove","path":"/context"}]}';
    const { result, provider } = run([bad, bad, '{"patch":[{"op":"remove","path":"/suffix"}]}']);
    await expect(result).rejects.toMatchObject({ reason: 'invalid-output' });
    expect(provider.calls.map((c) => c.mode)).toEqual(['ONLY_ON_DEVICE', 'ONLY_ON_DEVICE']);
  });

  it('accepts an escalation without a patch, and repairs an empty patch', async () => {
    const esc = run(['{"patch":[],"escalate":true,"message":"Needs a new graphic"}'], 'make a map');
    expect((await esc.result).output).toMatchObject({ escalate: true });
    const empty = run(['{"patch":[]}', '{"patch":[{"op":"replace","path":"/value","value":45}]}']);
    expect((await empty.result).attempts).toBe(2);
  });

  it('edits a scene through /content paths and runs its gate', async () => {
    const edit = '{"patch":[{"op":"replace","path":"/content/value","value":45}]}';
    const ok = run(
      [edit],
      'change 40 to 45',
      { timingDefaults: DEFAULTS, gate: () => null },
      'stat-punch',
      STAT,
    );
    expect((await ok.result).output.patch[0]?.path).toBe('/content/value');
    const gated = run(
      [edit, edit],
      'change 40 to 45',
      { timingDefaults: DEFAULTS, gate: () => 'the number does not fit' },
      'stat-punch',
      STAT,
    );
    await expect(gated.result).rejects.toMatchObject({ reason: 'invalid-output' });
    expect(gated.provider.calls[1]?.prompt).toContain('the number does not fit');
  });
});

describe('P1 patch validity', () => {
  const OPS = fc.oneof(
    fc.record({
      op: fc.constant('replace'),
      path: fc.constantFrom(
        '/value',
        '/label',
        '/decimals',
        '/suffix',
        '/timing/speed',
        '/timing/ease',
        '/timing/fade',
        '/nope',
        '/beats',
      ),
      value: fc.oneof(
        fc.integer({ min: -5, max: 100 }),
        fc.double({ min: 0, max: 4, noNaN: true }),
        fc.string({ maxLength: 60 }),
        fc.boolean(),
        fc.constantFrom('inOut', 'out', 'linear'),
      ),
    }),
    fc.record({
      op: fc.constant('remove'),
      path: fc.constantFrom('/suffix', '/label', '/x', '/timing/speed'),
    }),
    fc.record({
      op: fc.constant('add'),
      path: fc.constantFrom('/prefix', '/context', '/timing/fade'),
      value: fc.oneof(fc.string({ maxLength: 70 }), fc.boolean()),
    }),
  );
  const answer = fc.array(OPS, { maxLength: 4 }).map((patch) => JSON.stringify({ patch }));

  it('any patch the check accepts leaves params and timing schema-valid; rejected answers apply nothing', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(answer, { minLength: 2, maxLength: 2 }), async (answers) => {
        const { result } = run(answers);
        const before = JSON.stringify(input('x').current);
        try {
          const r = await result;
          if (r.output.escalate) return;
          const applied = applyParamsPatch(input('x').current, r.output.patch);
          expect(applied.ok).toBe(true);
          if (!applied.ok) return;
          const { params, timing } = splitEditDoc(applied.params, DEFAULTS);
          expect(bigNumber.safeParse(params).success).toBe(true);
          if (timing) {
            const { SlotTimingSchema } = await import('@motionpop/schemas');
            expect(SlotTimingSchema.safeParse(timing).success).toBe(true);
          }
        } catch (err) {
          expect((err as { reason?: string }).reason).toBe('invalid-output');
        }
        // The router never mutates the document it was given (input parse clones).
        expect(JSON.stringify(input('x').current)).toBe(before);
      }),
      { numRuns: 200 },
    );
  });

  it('works the same on a scene score: accepted patches keep the score valid', async () => {
    const sceneOps = fc.oneof(
      fc.record({
        op: fc.constant('replace'),
        path: fc.constantFrom(
          '/content/value',
          '/content/label',
          '/variant',
          '/content/decimals',
          '/beats/0',
        ),
        value: fc.oneof(
          fc.integer({ min: -5, max: 100 }),
          fc.string({ maxLength: 60 }),
          fc.constantFrom('hero', 'side', 'stack', 'zig'),
        ),
      }),
      fc.record({
        op: fc.constant('remove'),
        path: fc.constantFrom('/content/suffix', '/content/label'),
      }),
    );
    const sceneAnswer = fc
      .array(sceneOps, { maxLength: 3 })
      .map((patch) => JSON.stringify({ patch }));
    await fc.assert(
      fc.asyncProperty(fc.array(sceneAnswer, { minLength: 2, maxLength: 2 }), async (answers) => {
        const { result } = run(answers, 'x', { timingDefaults: DEFAULTS }, 'stat-punch', STAT);
        try {
          const r = await result;
          const applied = applyParamsPatch(input('x', 'stat-punch', STAT).current, r.output.patch);
          expect(applied.ok).toBe(true);
          if (applied.ok) {
            const { params } = splitEditDoc(applied.params, DEFAULTS);
            expect(schemaFor('stat-punch')!.safeParse(params).success).toBe(true);
          }
        } catch (err) {
          expect((err as { reason?: string }).reason).toBe('invalid-output');
        }
      }),
      { numRuns: 150 },
    );
  });
});
