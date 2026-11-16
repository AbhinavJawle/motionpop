// @vitest-environment happy-dom
import { FORMATS, SlotTimingSchema, type Look, type SlotTiming } from '@motionpop/schemas';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { MotionComponent } from '../contract';
import { withTiming } from '../runtime/timing';
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

/**
 * P8 (spec 09 task 9): slot timing keeps voice sync and holds the last frame. The runtime hands a
 * clip `withTiming(style, timing)` as its style and look, and `exit: 'none'` when `fade` is false;
 * these tests build a small scene the same way.
 */

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

const slotBox = (y: number, max: number): TextSlot => ({
  box: { x: 200, y, width: 1200, height: max * 1.3 },
  max,
  min: max / 3,
  lineHeight: 1.1,
  maxLines: 2,
  align: 'left',
});

interface Content {
  eyebrow: string;
  label: string;
}

/** Context, a number anchored to a spoken word, and an optional label. */
function scene(ctx: SceneContext, content: Content, anchorWord: number | null): StageComposition {
  const st = stage(ctx, {
    cues: [{ id: 'context' }, { id: 'focal', leadMs: 900 }, { id: 'label', optional: true }],
    ...(anchorWord === null ? {} : { anchors: [{ cue: 'focal', word: anchorWord }] }),
  });
  const eyebrow = st.text('context', content.eyebrow, slotBox(300, 40), { role: 'eyebrow' });
  const num = st.number('number', 40, { suffix: '%' }, slotBox(380, 260));
  const label = st.text('label', content.label, slotBox(760, 60));
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
    style: LOOK,
    look: LOOK,
    durationMs: 6000,
    keyMomentMs: 2000,
    fps: 30,
    seed: 3,
    warn: () => {},
    ...over,
  };
}

/** The ctx the runtime builds for a clip (engine.ts `mountAll`). */
function clipCtx(timing: SlotTiming | undefined, over: Partial<SceneContext>): SceneContext {
  const style = withTiming(LOOK, timing);
  return ctxFor({
    style,
    look: style,
    ...(timing?.fade === false ? { exit: 'none' as const } : {}),
    ...over,
  });
}

const timingArb: fc.Arbitrary<SlotTiming> = fc.record(
  {
    speed: fc.double({ min: 0.5, max: 2, noNaN: true }),
    ease: fc.constantFrom('inOut', 'out', 'linear'),
    fade: fc.boolean(),
  },
  { requiredKeys: [] },
);
const speedArb = fc.double({ min: 0.5, max: 2, noNaN: true });

/** Spoken words 700 to 1100 ms apart, so a cue on one of the first five has room to land. */
const wordsArb = fc
  .array(fc.integer({ min: 700, max: 1100 }), { minLength: 8, maxLength: 8 })
  .map((gaps) => {
    let t = 200;
    return gaps.map((g) => {
      const w = { startMs: t, endMs: t + 400 };
      t += g;
      return w;
    });
  });
const contentArb = fc.record({
  eyebrow: fc
    .integer({ min: 1, max: 4 })
    .map((n) => Array.from({ length: n }, () => 'eye').join(' ')),
  label: fc
    .integer({ min: 1, max: 8 })
    .map((n) => Array.from({ length: n }, () => 'word').join(' ')),
});

describe('P8 timing keeps voice sync and holds the last frame', () => {
  it('anchored cues land within 80 ms of their spoken word at any speed, when the slot allows', () => {
    fc.assert(
      fc.property(
        speedArb,
        wordsArb,
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 5000, max: 9000 }),
        contentArb,
        (speed, words, anchorWord, durationMs, content) => {
          const ctx = clipCtx({ speed }, { words, durationMs });
          const comp = scene(ctx, content, anchorWord);
          const cue = comp.report.plan.cues.find((c) => c.id === 'focal');
          expect(cue).toBeDefined();
          if (!cue) return;
          const spoken = (words[anchorWord] as { startMs: number }).startMs;
          expect(cue.word).toBe(anchorWord);
          expect(cue.landMs).toBeGreaterThanOrEqual(spoken - 80);
          expect(cue.landMs).toBeLessThanOrEqual(spoken + 80);
          comp.dispose();
        },
      ),
      { numRuns: 300 },
    );
  });

  it('fade: false keeps every landed actor visible to the last frame; the exit starts at the end', () => {
    fc.assert(
      fc.property(
        timingArb,
        wordsArb,
        fc.integer({ min: 4000, max: 9000 }),
        contentArb,
        (timing, words, durationMs, content) => {
          const t: SlotTiming = { ...timing, fade: false };
          const ctx = clipCtx(t, { words, durationMs });
          const comp = scene(ctx, content, 2);
          expect(comp.report.plan.exitStartMs).toBe(durationMs);
          const dropped = new Set(comp.report.plan.dropped);
          comp.seek(durationMs);
          const actors = { context: 'context', focal: 'number', label: 'label' } as const;
          for (const [cue, actor] of Object.entries(actors)) {
            if (dropped.has(cue)) continue;
            const el = ctx.root.querySelector<HTMLElement>(`[data-actor="${actor}"]`);
            expect(el, actor).not.toBeNull();
            expect(Number(el?.style.opacity)).toBeGreaterThan(0.99);
          }
          comp.dispose();
        },
      ),
      { numRuns: 150 },
    );
  });

  it('with fade on, the same clip does leave before its last frame (so the check above can fail)', () => {
    const ctx = clipCtx({ speed: 1 }, { durationMs: 6000 });
    const comp = scene(ctx, { eyebrow: 'eye', label: 'word' }, null);
    comp.seek(6000);
    const el = ctx.root.querySelector<HTMLElement>('[data-actor="number"]');
    expect(Number(el?.style.opacity)).toBeLessThan(0.05);
    comp.dispose();
  });

  it('a slower speed lengthens the entrance and a faster one shortens it (the look is never mutated)', () => {
    const before = structuredClone(LOOK);
    expect(withTiming(LOOK, { speed: 0.5 }).motion.enterMs).toBe(LOOK.motion.enterMs * 2);
    expect(withTiming(LOOK, { speed: 2 }).motion.enterMs).toBe(Math.round(LOOK.motion.enterMs / 2));
    expect(LOOK).toEqual(before);
  });

  it('is seek-pure with random timings', () => {
    fc.assert(
      fc.property(
        timingArb,
        wordsArb,
        contentArb,
        fc.integer({ min: 4000, max: 8000 }),
        (timing, words, content, durationMs) => {
          const component: MotionComponent<Content> = {
            id: 'prop-timing',
            name: 'Property timing',
            category: 'data',
            params: z.object({ eyebrow: z.string(), label: z.string() }),
            defaults: content,
            durationMs: { min: 2000, ideal: durationMs, max: 10000 },
            formats: ['16:9'],
            keyMomentMs: () => 2000,
            build: (ctx) =>
              scene(
                { ...clipCtx(timing, { words }), root: ctx.root, durationMs: ctx.durationMs },
                content,
                2,
              ),
          };
          assertSeekPure(component, content, { durationMs, numRuns: 6, style: LOOK });
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('withTiming', () => {
  it('is pure: the same input gives equal output, and the input is untouched', () => {
    fc.assert(
      fc.property(timingArb, (timing) => {
        const style = structuredClone(editorialExplainer);
        const snapshot = structuredClone(style);
        const a = withTiming(style, timing);
        const b = withTiming(style, timing);
        expect(a).toEqual(b);
        expect(style).toEqual(snapshot);
      }),
      { numRuns: 200 },
    );
  });

  it('leaves unset fields at the look, and everything outside speed and ease unchanged', () => {
    fc.assert(
      fc.property(timingArb, (timing) => {
        const out = withTiming(editorialExplainer, timing);
        const m = editorialExplainer.motion;
        if (timing.speed === undefined) {
          expect(out.motion.enterMs).toBe(m.enterMs);
          expect(out.motion.staggerMs).toBe(m.staggerMs);
        }
        if (timing.ease === undefined) {
          expect(out.motion.enterEase).toBe(m.enterEase);
          expect(out.motion.moveEase).toBe(m.moveEase);
        }
        expect(out.motion.holdMs).toBe(m.holdMs);
        expect(out.motion.camera).toEqual(m.camera);
        expect({ ...out, motion: null }).toEqual({ ...editorialExplainer, motion: null });
        expect(Number.isInteger(out.motion.enterMs) && out.motion.enterMs >= 1).toBe(true);
        expect(Number.isInteger(out.motion.staggerMs) && out.motion.staggerMs >= 1).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('no change at all returns the same object (speed 1, no ease, fade only, or no timing)', () => {
    expect(withTiming(editorialExplainer, undefined)).toBe(editorialExplainer);
    expect(withTiming(editorialExplainer, {})).toBe(editorialExplainer);
    expect(withTiming(editorialExplainer, { speed: 1 })).toBe(editorialExplainer);
    expect(withTiming(editorialExplainer, { fade: false })).toBe(editorialExplainer);
  });

  it('maps the three eases onto the look ease names, and every result is a valid ease', () => {
    expect(withTiming(editorialExplainer, { ease: 'inOut' }).motion).toMatchObject({
      enterEase: 'inOutCubic',
      moveEase: 'inOutCubic',
    });
    expect(withTiming(editorialExplainer, { ease: 'out' }).motion).toMatchObject({
      enterEase: 'outExpo',
      moveEase: 'outCubic',
    });
    expect(withTiming(editorialExplainer, { ease: 'linear' }).motion).toMatchObject({
      enterEase: 'linear',
      moveEase: 'linear',
    });
  });

  it('the timing schema agrees with what withTiming accepts at its edges', () => {
    for (const speed of [0.5, 2]) expect(SlotTimingSchema.safeParse({ speed }).success).toBe(true);
    expect(withTiming(editorialExplainer, { speed: 0.5 }).motion.enterMs).toBe(
      editorialExplainer.motion.enterMs * 2,
    );
  });
});
