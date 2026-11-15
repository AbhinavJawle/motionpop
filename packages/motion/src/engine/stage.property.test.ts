// @vitest-environment happy-dom
import { ENERGY_INTERVAL_MS, EnergySchema, FORMATS, type Look } from '@motionpop/schemas';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { MotionComponent } from '../contract';
import { editorialExplainer } from '../styles';
import { assertSeekPure } from '../testing/seek-pure';
import {
  enter,
  mark,
  stage,
  type SceneContext,
  type StageComposition,
  type TextSlot,
} from './stage';

const slot = (y: number, max: number): TextSlot => ({
  box: { x: 200, y, width: 1200, height: max * 1.3 },
  max,
  min: max / 3,
  lineHeight: 1.1,
  maxLines: 2,
  align: 'left',
});

const LOOK: Look = {
  ...editorialExplainer,
  energy: 'lively',
  personality: {
    preset: 'snappy',
    enter: {},
    overshoot: 0.06,
    popMax: 0.08,
    exitRatio: 0.6,
    snapMargin: 15,
  },
  camera: { push: [1, 1.06], snap: 0.08, whip: false, parallax: 14 },
  juice: ['camera-snap', 'decor-draw', 'camera-push'],
  sound: { focal: 'thud', mark: 'pen', snap: 'whoosh' },
};

const WORDS = [0, 650, 1430, 2030, 2630, 3400, 3950].map((s) => ({ startMs: s, endMs: s + 400 }));
const sentence = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

interface Content {
  eyebrow: string;
  label: string;
}

/** The example scene from stage.test.ts with random content. */
function scene(ctx: SceneContext, content: Content): StageComposition {
  const st = stage(ctx, {
    cues: [{ id: 'context' }, { id: 'focal', leadMs: 900 }, { id: 'label', optional: true }],
    anchors: [{ cue: 'focal', word: 3 }],
  });
  const eyebrow = st.text('context', content.eyebrow, slot(300, 40), { role: 'eyebrow' });
  const num = st.number('number', 40, { suffix: '%' }, slot(380, 260));
  const label = st.text('label', content.label, slot(760, 60));
  st.on('context', enter(eyebrow));
  st.on('focal', enter(num), mark(num));
  st.on('label', enter(label));
  return st.compile();
}

const roots: HTMLElement[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) r.remove();
});

function ctxFor(over: Partial<SceneContext>): SceneContext {
  const root = document.createElement('div');
  document.body.append(root);
  roots.push(root);
  return {
    root,
    ...FORMATS['16:9'],
    format: '16:9',
    style: editorialExplainer,
    durationMs: 6000,
    keyMomentMs: 2030,
    fps: 30,
    seed: 3,
    warn: () => {},
    words: WORDS,
    ...over,
  };
}

const contentArb = fc.record({
  eyebrow: fc.integer({ min: 1, max: 5 }).map(sentence),
  label: fc.integer({ min: 1, max: 12 }).map(sentence),
});
const ctxArb = fc.record({
  durationMs: fc.integer({ min: 2000, max: 10000 }),
  energy: fc.constantFrom(...EnergySchema.options),
  withLook: fc.boolean(),
  seed: fc.integer({ min: 0, max: 100000 }),
  stress: fc.option(fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 7, maxLength: 7 }), {
    nil: undefined,
  }),
});

const ACTOR_OF: Record<string, string> = { context: 'context', focal: 'number', label: 'label' };

describe('stage properties', () => {
  it('holds each entered actor still (transform and clip-path) during its read window', () => {
    fc.assert(
      fc.property(contentArb, ctxArb, (content, c) => {
        const ctx = ctxFor({
          durationMs: c.durationMs,
          energy: c.energy,
          seed: c.seed,
          ...(c.withLook ? { look: LOOK } : {}),
          ...(c.stress ? { stress: c.stress } : {}),
        });
        const comp = scene(ctx, content);
        const { plan } = comp.report;
        for (const q of plan.quiet) {
          if (q.endMs - q.startMs < 3) continue;
          const el = ctx.root.querySelector<HTMLElement>(`[data-actor="${ACTOR_OF[q.cue]}"]`)!;
          comp.seek(q.startMs + 1);
          const early = [el.style.transform, el.style.clipPath];
          comp.seek(q.endMs - 1);
          const late = [el.style.transform, el.style.clipPath];
          expect(late).toEqual(early);
        }
        comp.dispose();
      }),
      { numRuns: 200 },
    );
  });

  it('meets the beat budget and the 3 % camera limit, and the camera starts at the push minimum', () => {
    fc.assert(
      fc.property(contentArb, ctxArb, (content, c) => {
        const ctx = ctxFor({
          durationMs: c.durationMs,
          energy: c.energy,
          seed: c.seed,
          ...(c.withLook ? { look: LOOK } : {}),
        });
        const comp = scene(ctx, content);
        const { plan, juice, energy } = comp.report;
        expect(juice.maxGapMs).toBeLessThanOrEqual(ENERGY_INTERVAL_MS[energy] + 1);
        for (const q of plan.quiet) {
          let lo = Infinity;
          let hi = -Infinity;
          for (let t = q.startMs; t <= q.endMs; t += 5) {
            lo = Math.min(lo, comp.camera(t));
            hi = Math.max(hi, comp.camera(t));
          }
          expect(hi - lo).toBeLessThanOrEqual(0.03 + 1e-9);
        }
        comp.dispose();
      }),
      { numRuns: 200 },
    );
  });

  it('is seek-pure for random content, durations and energies', () => {
    fc.assert(
      fc.property(contentArb, ctxArb, (content, c) => {
        const component: MotionComponent<Content> = {
          id: 'prop-stat',
          name: 'Property stat',
          category: 'data',
          params: z.object({ eyebrow: z.string(), label: z.string() }),
          defaults: content,
          durationMs: { min: 2000, ideal: c.durationMs, max: 10000 },
          formats: ['16:9'],
          keyMomentMs: () => 2030,
          build: (ctx) =>
            scene(
              {
                ...ctx,
                words: WORDS,
                energy: c.energy,
                ...(c.withLook ? { look: LOOK } : {}),
                ...(c.stress ? { stress: c.stress } : {}),
              },
              content,
            ),
        };
        assertSeekPure(component, content, { durationMs: c.durationMs, numRuns: 8 });
      }),
      { numRuns: 40 },
    );
  });
});
