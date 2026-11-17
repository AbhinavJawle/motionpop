import { schemaFor } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import { editContext, splitEditDoc, type TimingDefaults } from '../edit/edit-doc';
import { createRouter, type AIProvider, type ProviderRequest, type RouterConfig } from '../router';
import { applyParamsPatch } from './edit-patch';
import { noteFixTask, type NoteFixInput } from './note-fix';

const DEFAULTS: TimingDefaults = { speed: 1, ease: 'inOut', fade: true };
const PARAMS = { value: 40, suffix: '%', decimals: 0, label: 'Revenue grew', countFrom: 0 };
const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  modelFilmBuild: 'strong',
  killSwitch: false,
};

const input = (over: Partial<NoteFixInput> = {}): NoteFixInput => ({
  ...editContext(schemaFor('big-number')!, 'big-number', PARAMS, undefined, DEFAULTS),
  note: { text: 'make this slower', tMs: 1400, region: { x: 0.5, y: 0.4, w: 0.2, h: 0.2 } },
  regionText: ['40%'],
  ...over,
});

function scripted(answers: string[]): AIProvider & { calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = [];
  return {
    calls,
    generate(req) {
      calls.push(req);
      const text = answers[calls.length - 1];
      if (text === undefined) return Promise.reject(new Error('unexpected call'));
      return Promise.resolve({ text, ranOn: req.mode.includes('CLOUD') ? 'cloud' : 'device' });
    },
  };
}
const run = (
  answers: string[],
  i: NoteFixInput,
  mode: 'ONLY_ON_DEVICE' | 'ONLY_IN_CLOUD' = 'ONLY_ON_DEVICE',
) => {
  const provider = scripted(answers);
  const router = createRouter({ provider, config: () => CONFIG });
  return {
    provider,
    result: router.run(noteFixTask(schemaFor, { timingDefaults: DEFAULTS }), i, {
      mode,
      allowCloud: false,
    }),
  };
};
const SLOWER = '{"patch":[{"op":"replace","path":"/timing/speed","value":0.8}]}';

describe('note.fix', () => {
  const task = noteFixTask(schemaFor);

  it('without a picture: no media, the region text names what was circled', async () => {
    const { result, provider } = run([SLOWER], input());
    const r = await result;
    expect(r).toMatchObject({ ranOn: 'device', costCredits: 0, attempts: 1 });
    const req = provider.calls[0]!;
    expect(req.media).toBeUndefined();
    expect(req.prompt).toContain('texts inside the circle: ["40%"]');
    expect(req.prompt).toContain('note: make this slower');
    expect(req.prompt).toContain('x 50%, y 40%, width 20%, height 20%');
    expect(req.prompt).not.toContain('attached picture');
    expect(req.mode).toBe('ONLY_ON_DEVICE');
  });

  it('with a picture: it is sent as inline JPEG and the prompt says so', async () => {
    const { provider, result } = run([SLOWER], input({ image: 'QUJD' }));
    await result;
    expect(provider.calls[0]?.media).toEqual({ mimeType: 'image/jpeg', base64: 'QUJD' });
    expect(provider.calls[0]?.prompt).toContain('The attached picture shows the circled area.');
  });

  it('sends paths as an enum and applies a timing patch to the edit document', async () => {
    const { result, provider } = run([SLOWER], input());
    const r = await result;
    expect(JSON.stringify(provider.calls[0]?.jsonSchema)).toContain('"/timing/speed"');
    const applied = applyParamsPatch(input().current, r.output.patch);
    expect(applied.ok && splitEditDoc(applied.params, DEFAULTS).timing).toEqual({ speed: 0.8 });
  });

  it('repairs a patch outside the listed paths, then stops: no automatic cloud attempt', async () => {
    const bad = '{"patch":[{"op":"replace","path":"/beats","value":[]}]}';
    const { result, provider } = run([bad, bad, SLOWER], input());
    await expect(result).rejects.toMatchObject({ reason: 'invalid-output' });
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]?.prompt).toContain('/beats is not editable');
  });

  it('runs in the cloud when told, for 1 credit', async () => {
    const r = await run([SLOWER], input(), 'ONLY_IN_CLOUD').result;
    expect(r).toMatchObject({ ranOn: 'cloud', costCredits: 1 });
  });

  it('accepts an escalation without a patch', async () => {
    const r = await run(['{"patch":[],"escalate":true,"message":"Needs a new graphic"}'], input())
      .result;
    expect(r.output.escalate).toBe(true);
  });

  it('validates its input: text length, region range, at most 8 region texts, picture size', () => {
    expect(task.input.safeParse(input()).success).toBe(true);
    expect(
      task.input.safeParse(
        input({ note: { text: '', tMs: 0, region: { x: 0, y: 0, w: 1, h: 1 } } }),
      ).success,
    ).toBe(false);
    expect(
      task.input.safeParse(
        input({ note: { text: 'x', tMs: 0, region: { x: 1.2, y: 0, w: 1, h: 1 } } }),
      ).success,
    ).toBe(false);
    expect(
      task.input.safeParse(
        input({ note: { text: 'x', tMs: 0, region: { x: 0, y: 0, w: 0, h: 1 } } }),
      ).success,
    ).toBe(false);
    expect(task.input.safeParse(input({ regionText: Array(9).fill('a') })).success).toBe(false);
    expect(task.input.safeParse(input({ image: 'A'.repeat(400_001) })).success).toBe(false);
  });

  it('is free on the device and costs 1 in the cloud, with no cloud fallback of its own', () => {
    expect(task.cloudCost(input())).toBe(1);
    expect(task.cloudFallback).toBe(false);
    expect(task.id).toBe('note.fix');
  });
});
