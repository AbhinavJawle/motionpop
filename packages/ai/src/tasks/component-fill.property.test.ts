// @vitest-environment happy-dom
// Property tests for the repair loop of component.fill (spec 07 task 17; R1.4, R9.2).
// The real scene gate builds DOM, so this file runs in happy-dom (text is never measured there).
import {
  editorialExplainer,
  fieldNotes,
  hookStatement,
  safeScore,
  statPunch,
} from '@motionpop/motion';
import { gateRepairText, gateSlot, repairable, type GateOptions } from '@motionpop/motion';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  createRouter,
  RouterError,
  type AIProvider,
  type ProviderRequest,
  type RouterConfig,
  type UsageEvent,
} from '../router';
import {
  componentFillTask,
  FILL_MAX_REPAIRS,
  GENERATE_COST,
  type ComponentFillInput,
} from './component-fill';

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  modelFilmBuild: 'strong',
  killSwitch: false,
};
const registry: Record<string, { params: z.ZodType }> = {
  [statPunch.id]: statPunch,
  [hookStatement.id]: hookStatement,
};
const paramsOf = (id: string) => registry[id]?.params;

const input = (
  componentId: string,
  purpose: ComponentFillInput['purpose'],
): ComponentFillInput => ({
  purpose,
  componentId,
  words: 'Our revenue grew forty percent since 2020.',
  prompt: 'A bold number.',
  styleId: 'editorial-explainer',
  skill: { shotSequence: 'a', emphasis: 'b' },
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

// --- 3: the loop never exceeds 2 repair rounds --------------------------------------------

type Kind = 'valid' | 'schema-invalid' | 'gate-failing' | 'not-json' | 'wrong-shape';
const kinds: fc.Arbitrary<Kind> = fc.constantFrom(
  'valid',
  'schema-invalid',
  'gate-failing',
  'not-json',
  'wrong-shape',
);
const answerText = (kind: Kind): string => {
  const params = (label: string) => ({ ...statPunch.defaults, content: { value: 4, label } });
  switch (kind) {
    case 'valid':
      return JSON.stringify({ params: params('fine') });
    case 'gate-failing':
      return JSON.stringify({ params: params('bad') });
    case 'schema-invalid':
      return JSON.stringify({ params: { content: { value: 'x', label: '' } } });
    case 'not-json':
      return 'sure, here you go';
    default:
      return '{"nothing":1}';
  }
};

describe('component.fill repair loop (properties)', () => {
  it('makes at most 3 calls, never escalates, and charges only for a cloud answer', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(kinds, { minLength: 3, maxLength: 6 }),
        fc.constantFrom<ComponentFillInput['purpose']>('autofill', 'generate'),
        async (script, purpose) => {
          // A random gate: it rejects an answer whose label is "bad".
          const gate = (_id: string, p: unknown) =>
            (p as { content: { label: string } }).content.label === 'bad'
              ? '- label (text-overflow): shorten label to 3 words'
              : null;
          const provider = scripted(script.map(answerText));
          const usage: UsageEvent[] = [];
          const router = createRouter({
            provider,
            config: () => CONFIG,
            onUsage: (e) => usage.push(e),
          });
          const task = componentFillTask(paramsOf, { gate });
          const first = script.findIndex((k) => k === 'valid');
          const expectedCalls = first >= 0 && first <= FILL_MAX_REPAIRS ? first + 1 : 3;
          const ok = first >= 0 && first <= FILL_MAX_REPAIRS;

          const result = await router.run(task, input(statPunch.id, purpose)).then(
            (r) => r,
            (e: unknown) => e,
          );

          expect(provider.calls).toHaveLength(expectedCalls);
          expect(provider.calls.length).toBeLessThanOrEqual(1 + FILL_MAX_REPAIRS);
          const want = purpose === 'autofill' ? 'ONLY_ON_DEVICE' : 'ONLY_IN_CLOUD';
          expect(provider.calls.every((c) => c.mode === want)).toBe(true);
          expect(usage).toHaveLength(1);
          const u = usage[0] as UsageEvent;
          expect(u.attempts).toBe(expectedCalls);
          expect(u.problems?.length ?? 0).toBe(ok ? expectedCalls - 1 : expectedCalls);
          if (ok) {
            const r = result as { ranOn: string; costCredits: number; attempts: number };
            expect(r.attempts).toBe(expectedCalls);
            expect(r.costCredits).toBe(r.ranOn === 'cloud' ? GENERATE_COST : 0);
            expect(r.ranOn).toBe(purpose === 'autofill' ? 'device' : 'cloud');
            expect(u.credits).toBe(r.costCredits);
          } else {
            expect(result).toBeInstanceOf(RouterError);
            expect((result as RouterError).reason).toBe('invalid-output');
            expect(u.ok).toBe(false);
            expect(u.credits).toBe(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// --- 4: whatever the model answers, the slot ends with a passing score --------------------

const sceneCases = [
  { scene: statPunch, id: statPunch.id },
  { scene: hookStatement, id: hookStatement.id },
] as const;

const answerParams = (scene: (typeof sceneCases)[number]['scene']): fc.Arbitrary<unknown> => {
  const valid = fc
    .record({
      variant: fc.constantFrom(...scene.variants.map((v) => v.id), 'nope'),
      label: fc.string({ maxLength: 60 }),
      value: fc.integer({ min: -5, max: 5000 }),
      cue: fc.constantFrom(...scene.cues.map((c) => c.id), 'nope'),
      word: fc.integer({ min: 0, max: 12 }),
      beats: fc.boolean(),
    })
    .map((r) => {
      const content =
        scene.id === statPunch.id
          ? { value: r.value, label: r.label || 'x', decimals: 0, countFrom: 0 }
          : { line: r.label || 'x' };
      return {
        variant: r.variant,
        content,
        beats: r.beats ? [{ cue: r.cue, word: r.word }] : [],
        images: [],
      };
    });
  return fc.oneof({ arbitrary: valid, weight: 3 }, { arbitrary: fc.anything(), weight: 1 });
};

describe('the slot always ends with a passing score (properties)', () => {
  it('router answer if it succeeds, else safeScore: no repairable report remains', async () => {
    let fell = 0;
    let accepted = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...sceneCases).chain((c) =>
          fc.record({
            c: fc.constant(c),
            answers: fc.array(answerParams(c.scene), { minLength: 1, maxLength: 6 }),
            format: fc.constantFrom<'16:9' | '9:16' | '1:1'>('16:9', '9:16', '1:1'),
            plain: fc.boolean(),
            nWords: fc.integer({ min: 0, max: 10 }),
            len: fc.constantFrom<'min' | 'ideal' | 'max'>('min', 'ideal', 'max'),
            gaps: fc.array(fc.nat(), { maxLength: 8 }),
            slotWords: fc.array(fc.string({ maxLength: 12 }), { maxLength: 12 }),
          }),
        ),
        async ({ c, answers, format, plain, nWords, len, gaps, slotWords }) => {
          let t = 0;
          const timings = Array.from({ length: nWords }, (_, i) => {
            t += (gaps[i % Math.max(1, gaps.length)] ?? 0) % 400;
            const startMs = t;
            t += 150;
            return { startMs, endMs: t };
          });
          const o: GateOptions = {
            format,
            style: plain ? editorialExplainer : fieldNotes,
            ...(plain ? {} : { look: fieldNotes }),
            durationMs: c.scene.durationMs[len],
            words: timings,
          };
          const gate = (_id: string, params: unknown) =>
            gateRepairText(gateSlot(c.scene as never, params, o));
          const provider = scripted(answers.map((p) => JSON.stringify({ params: p })));
          const router = createRouter({ provider, config: () => CONFIG });
          const final = await router
            .run(componentFillTask(paramsOf, { gate }), input(c.id, 'autofill'))
            .then(
              (r) => {
                accepted++;
                return (c.scene.params as z.ZodType).parse(r.output.params);
              },
              () => {
                fell++;
                return safeScore(c.scene as never, slotWords, o);
              },
            );
          expect(provider.calls.length).toBeLessThanOrEqual(1 + FILL_MAX_REPAIRS);
          expect(gateSlot(c.scene as never, final, o).filter(repairable)).toEqual([]);
        },
      ),
      { numRuns: 120 },
    );
    // Both outcomes must be exercised or the property says little.
    expect(accepted).toBeGreaterThan(0);
    expect(fell).toBeGreaterThan(0);
  });
});
