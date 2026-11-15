import { components } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { createRouter, type AIProvider, type ProviderRequest, type RouterConfig } from '../router';
import { componentFillTask, type ComponentFillInput } from './component-fill';
import { paramsSchemaSummary } from './edit-patch';

const registry = components as Record<string, { params: z.ZodType }>;
const task = componentFillTask((id) => registry[id]?.params);
const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  killSwitch: false,
};
const input = (over: Partial<ComponentFillInput> = {}): ComponentFillInput => ({
  purpose: 'autofill',
  componentId: 'big-number',
  paramsSchemaSummary: paramsSchemaSummary(registry['big-number']!.params),
  words: 'Our revenue grew forty percent since 2020.',
  prompt: 'A bold number with an editorial feel.',
  currentParams: { value: 40, suffix: '%', label: 'Our revenue grew' },
  styleId: 'editorial-explainer',
  skill: { shotSequence: '0-15% context, 15-55% count up', emphasis: 'final value in accent' },
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
      const ranOn = req.mode.includes('CLOUD') ? ('cloud' as const) : ('device' as const);
      return Promise.resolve({ text, ranOn });
    },
  };
}
const run = (answers: string[], over: Partial<ComponentFillInput> = {}) => {
  const provider = scripted(answers);
  const router = createRouter({ provider, config: () => CONFIG });
  return { provider, result: router.run(task, input(over)) };
};

const GOOD = JSON.stringify({
  params: { value: 40, suffix: '%', label: 'Revenue grew since 2020' },
});

describe('component.fill', () => {
  it('auto-fill runs only on the device and is free', async () => {
    const { result, provider } = run([GOOD]);
    expect(await result).toMatchObject({ ranOn: 'device', costCredits: 0, attempts: 1 });
    expect(provider.calls[0]?.mode).toBe('ONLY_ON_DEVICE');
    expect(provider.calls[0]?.prompt).toContain('spoken words: "Our revenue grew');
    expect(provider.calls[0]?.prompt).toContain('current params:');
  });

  it('Generate runs only in the cloud for 3 credits', async () => {
    const { result, provider } = run([GOOD], { purpose: 'generate' });
    expect(await result).toMatchObject({ ranOn: 'cloud', costCredits: 3 });
    expect(provider.calls[0]?.mode).toBe('ONLY_IN_CLOUD');
  });

  it('repairs params that break the component schema, and never escalates', async () => {
    const bad = JSON.stringify({ params: { value: 'forty', label: '' } });
    const fixed = run([bad, GOOD]);
    expect((await fixed.result).attempts).toBe(2);
    expect(fixed.provider.calls[1]?.prompt).toContain("params don't match the schema");

    const twice = run([bad, bad]);
    await expect(twice.result).rejects.toMatchObject({ reason: 'invalid-output' });
    expect(twice.provider.calls).toHaveLength(2);
  });

  it('rejects unknown components through the check', async () => {
    const { result } = run([GOOD, GOOD], { componentId: 'mystery' });
    await expect(result).rejects.toMatchObject({ reason: 'invalid-output' });
  });
});
