import { ReelPlanSchema, type ReelWord } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { autoReelPlan } from './auto';
import { applyEditChoices, type EditChoices } from './edit-choices';

const TOKEN = fc.oneof(
  { weight: 5, arbitrary: fc.stringMatching(/^[A-Za-z]{1,12}[.,?]?$/) },
  {
    weight: 2,
    arbitrary: fc.constantFrom('forty', 'percent', '40%', '2020', 'one', 'million', '$5', 'half'),
  },
  { weight: 1, arbitrary: fc.constantFrom('Comment', 'GUIDE', 'below.', 'Follow', 'for', 'more.') },
);

const transcript = fc
  .record({
    tokens: fc.array(TOKEN, { minLength: 1, maxLength: 120 }),
    step: fc.integer({ min: 120, max: 900 }),
    tail: fc.integer({ min: 100, max: 1500 }),
    look: fc.constantFrom('mono', 'cream'),
  })
  .map(({ tokens, step, tail, look }) => {
    const words: ReelWord[] = tokens.map((text, i) => ({
      text,
      startMs: i * step,
      endMs: i * step + Math.max(40, step - 40),
    }));
    return { words, durationMs: words.at(-1)!.endMs + tail, look };
  });

const choices: fc.Arbitrary<EditChoices> = fc.record(
  {
    hookStyle: fc.constantFrom('headline', 'stat', 'visual', 'cold-open'),
    captions: fc.record({
      enabled: fc.boolean(),
      style: fc.constantFrom('seam', 'pop', 'editorial', 'boxed', 'clean'),
    }),
    cta: fc.oneof(
      fc.constant({ enabled: false }),
      fc.constant({ enabled: true }),
      fc.record({ enabled: fc.constant(true), text: fc.string({ maxLength: 40 }) }),
    ),
    music: fc.constantFrom('auto', 'minimal-tech', 'upbeat', 'lofi', 'dramatic', 'none'),
    theme: fc.record({
      accent: fc.constantFrom('#ff3366', '#00aaff', '#222222'),
      background: fc.constantFrom('plain', 'soft', 'bold'),
    }),
  },
  { requiredKeys: [] },
);

describe('applyEditChoices (property)', () => {
  it('always returns a valid, tiled plan that honours CTA and keeps the look', () => {
    fc.assert(
      fc.property(transcript, choices, ({ words, durationMs, look }, c) => {
        const base = autoReelPlan(words, durationMs, look);
        const out = applyEditChoices(base, words, durationMs, c);

        expect(ReelPlanSchema.safeParse(out).success).toBe(true);
        expect(out.look).toBe(base.look);

        expect(out.scenes[0]!.startMs).toBe(0);
        expect(out.scenes.at(-1)!.endMs).toBe(durationMs);
        out.scenes.forEach((s, i) => {
          expect(s.endMs).toBeGreaterThan(s.startMs);
          if (i > 0) expect(s.startMs).toBe(out.scenes[i - 1]!.endMs);
        });

        const ctaScenes = out.scenes.filter((s) => s.content.template === 'cta');
        for (const s of ctaScenes) expect(s.layout).toBe('speaker');
        if (c.cta && !c.cta.enabled) expect(ctaScenes).toHaveLength(0);
        if (c.cta?.enabled && c.cta.text?.trim()) {
          expect(out.scenes.at(-1)!.content.template).toBe('cta');
          expect(ctaScenes).toHaveLength(1);
        }

        if (c.captions) expect(out.captionStyle).toBe(c.captions.style);
        if (c.music === 'none') expect(out.music).toBeUndefined();
        if (c.hookStyle === 'cold-open') expect(out.hook).toBeUndefined();
      }),
      { numRuns: 200 },
    );
  });

  it('is deterministic and leaves its input untouched', () => {
    fc.assert(
      fc.property(transcript, choices, ({ words, durationMs, look }, c) => {
        const base = autoReelPlan(words, durationMs, look);
        const before = structuredClone(base);
        const a = applyEditChoices(base, words, durationMs, c);
        const b = applyEditChoices(base, words, durationMs, c);
        expect(a).toEqual(b);
        expect(base).toEqual(before);
      }),
      { numRuns: 60 },
    );
  });
});
