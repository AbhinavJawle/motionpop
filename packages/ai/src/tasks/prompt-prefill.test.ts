import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRouter, type AIProvider, type ProviderRequest, type RouterConfig } from '../router';
import {
  PREFILL_MAX,
  promptPrefill,
  templatePrompt,
  type PromptPrefillInput,
} from './prompt-prefill';

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  killSwitch: false,
};
const INPUT: PromptPrefillInput = {
  slot: {
    reason: "You said 'revenue grew forty percent since 2020'",
    componentId: 'big-number',
    skillId: 'data-explainer',
    componentName: 'Big number',
    said: 'revenue grew forty percent since 2020',
  },
  style: { id: 'editorial-explainer', name: 'Editorial Explainer' },
};

function scripted(answers: (string | Error)[]): AIProvider & { calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = [];
  return {
    calls,
    generate(req) {
      calls.push(req);
      const a = answers[calls.length - 1];
      if (a === undefined) return Promise.reject(new Error('unexpected call'));
      if (a instanceof Error) return Promise.reject(a);
      return Promise.resolve({ text: a, ranOn: req.mode.includes('CLOUD') ? 'cloud' : 'device' });
    },
  };
}

describe('prompt.prefill', () => {
  it('is free, on the device only and never falls back to the cloud', () => {
    expect(promptPrefill.id).toBe('prompt.prefill');
    expect(promptPrefill.mode(INPUT, CONFIG)).toBe('ONLY_ON_DEVICE');
    expect(promptPrefill.cloudCost(INPUT)).toBe(0);
    expect(promptPrefill.cloudFallback).toBe(false);
  });

  it('asks about the graphic, the style and the spoken words, with no schema text', async () => {
    const provider = scripted([
      '{"prompt":"A clean, animated big number with an editorial feel."}',
    ]);
    const r = await createRouter({ provider, config: () => CONFIG }).run(promptPrefill, INPUT);
    expect(r).toMatchObject({ ranOn: 'device', costCredits: 0, attempts: 1 });
    expect(r.output.prompt).toBe('A clean, animated big number with an editorial feel.');
    const req = provider.calls[0]!;
    expect(req.mode).toBe('ONLY_ON_DEVICE');
    expect(req.prompt).toBe(
      'graphic: Big number\nstyle: Editorial Explainer\nnarrator said: revenue grew forty percent since 2020',
    );
    expect(JSON.stringify(req.jsonSchema)).toContain('"prompt"');
  });

  it('repairs an answer that is too long, once, then gives up without calling the cloud', async () => {
    const long = JSON.stringify({ prompt: `A ${'very '.repeat(40)}long sentence.` });
    const provider = scripted([long, long, '{"prompt":"unused cloud answer here."}']);
    const router = createRouter({ provider, config: () => CONFIG });
    await expect(router.run(promptPrefill, INPUT)).rejects.toMatchObject({
      reason: 'invalid-output',
    });
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls.every((c) => c.mode === 'ONLY_ON_DEVICE')).toBe(true);
  });

  it('rejects a multi-line answer', async () => {
    const provider = scripted([
      '{"prompt":"A clean number.\\nWith a second line."}',
      '{"prompt":"A clean, animated number."}',
    ]);
    const r = await createRouter({ provider, config: () => CONFIG }).run(promptPrefill, INPUT);
    expect(r.attempts).toBe(2);
    expect(r.output.prompt).toBe('A clean, animated number.');
  });

  it('a provider failure is an error, not a cloud call', async () => {
    const provider = scripted([new Error('no model')]);
    const router = createRouter({ provider, config: () => CONFIG });
    await expect(router.run(promptPrefill, INPUT)).rejects.toMatchObject({ reason: 'provider' });
    expect(provider.calls).toHaveLength(1);
  });

  it('validates its input', () => {
    expect(promptPrefill.input.safeParse(INPUT).success).toBe(true);
    expect(
      promptPrefill.input.safeParse({ ...INPUT, slot: { ...INPUT.slot, componentName: '' } })
        .success,
    ).toBe(false);
    expect(promptPrefill.input.safeParse({ ...INPUT, style: { id: 'x' } }).success).toBe(false);
  });
});

describe('templatePrompt', () => {
  it('reads like the design: A {style} {graphic} for “{first words}”.', () => {
    expect(
      templatePrompt({
        componentName: 'Big number',
        styleName: 'Clean Minimal',
        said: 'revenue grew forty percent since 2020',
      }),
    ).toBe('A Clean Minimal big number for “revenue grew forty percent since 2020”.');
  });

  it('uses "An" before a vowel and takes at most the first 8 words', () => {
    expect(
      templatePrompt({
        componentName: 'Bar chart',
        styleName: 'Editorial Explainer',
        said: 'one two three four five six seven eight nine ten',
      }),
    ).toBe('An Editorial Explainer bar chart for “one two three four five six seven eight”.');
  });

  it('works with nothing said', () => {
    expect(templatePrompt({ componentName: 'Callout', styleName: 'Dark Money' })).toBe(
      'A Dark Money callout.',
    );
    expect(templatePrompt({ componentName: 'Callout', styleName: 'Dark Money', said: '  ' })).toBe(
      'A Dark Money callout.',
    );
  });

  it('property: always at most 140 characters, one line, deterministic, ends with a full stop', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 70 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
        fc.option(fc.string({ maxLength: 400 }), { nil: undefined }),
        (componentName, styleName, said) => {
          const a = templatePrompt({ componentName, styleName, said });
          expect(a).toBe(templatePrompt({ componentName, styleName, said }));
          expect(a.length).toBeLessThanOrEqual(PREFILL_MAX);
          expect(a.endsWith('.') || a.length === PREFILL_MAX).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('drops spoken words from the end until it fits', () => {
    const long = 'extraordinarily '.repeat(8).trim();
    const t = templatePrompt({
      componentName: 'Big number',
      styleName: 'Editorial Explainer',
      said: long,
    });
    expect(t.length).toBeLessThanOrEqual(PREFILL_MAX);
    expect(t).toContain('“extraordinarily');
  });
});
