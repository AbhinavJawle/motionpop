// @vitest-environment happy-dom
import { FORMATS, type Look } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { MotionComponent } from '../contract';
import { editorialExplainer } from '../styles';
import { assertSeekPure } from '../testing/seek-pure';
import { scheduleBeats } from './beats';
import { cameraTrack, planJuice, QUIET_CAMERA_MAX } from './juice';
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

// "Our revenue grew forty percent since 2020", relative to the slot start.
const WORDS = [0, 650, 1430, 2030, 2630, 3400, 3950].map((s) => ({ startMs: s, endMs: s + 400 }));

function ctxFor(over: Partial<SceneContext> = {}): SceneContext {
  const root = document.createElement('div');
  document.body.append(root);
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
    ...over,
  };
}

function statScene(ctx: SceneContext): StageComposition {
  const st = stage(ctx, {
    cues: [{ id: 'context' }, { id: 'focal', leadMs: 900 }, { id: 'label', optional: true }],
    anchors: [{ cue: 'focal', word: 3 }],
  });
  const eyebrow = st.text('context', 'The bigger picture', slot(300, 40), { role: 'eyebrow' });
  const num = st.number('number', 40, { suffix: '%' }, slot(380, 260));
  const label = st.text('label', 'Our revenue grew', slot(760, 60));
  st.on('context', enter(eyebrow));
  st.on('focal', enter(num), mark(num));
  st.on('label', enter(label));
  return st.compile();
}

describe('stage', () => {
  it('lands the number on its spoken word with the exact final value', () => {
    const ctx = ctxFor({ look: LOOK, words: WORDS });
    const comp = statScene(ctx);
    const focal = comp.report.plan.cues.find((c) => c.id === 'focal')!;
    expect(focal.landMs).toBe(2030);
    comp.seek(focal.startMs);
    const num = ctx.root.querySelector<HTMLElement>('[data-actor="number"]')!;
    expect(num.style.opacity).toBe('0');
    comp.seek(2030);
    expect(num.textContent).toBe('40%');
    expect(num.style.opacity).toBe('1');
    expect(num.dataset.on).toBe('highlight');
    expect(ctx.root.querySelector('[data-mark="highlighter"]')).not.toBeNull();
    comp.dispose();
  });

  it('keeps the word spans of balanced text when a mark measures it', () => {
    // Regression: measuring a text for a mark swapped its children for a probe and put back only
    // the text, so the word spans (and the de-orphan glue) were gone after compile().
    const ctx = ctxFor({ look: LOOK, words: WORDS });
    const st = stage(ctx, {
      cues: [{ id: 'focal', leadMs: 900 }],
      anchors: [{ cue: 'focal', word: 3 }],
    });
    const label = st.text('label', 'of trade sat still every day', slot(400, 60), {
      role: 'label',
      balance: true,
    });
    st.on('focal', enter(label), mark(label));
    const comp = st.compile();
    comp.seek(3000);
    const el = ctx.root.querySelector<HTMLElement>('[data-actor="label"]')!;
    expect(el.querySelectorAll('span:not([data-glue])')).toHaveLength(6);
    expect(el.textContent).toBe('of trade sat still every day');
    comp.dispose();
  });

  it('keeps cue order, read time between text cues, and meets the beat budget', () => {
    const comp = statScene(ctxFor({ look: LOOK, words: WORDS }));
    const { plan, juice } = comp.report;
    expect(plan.cues.map((c) => c.id)).toEqual(['context', 'focal', 'label']);
    const [context, focal, label] = plan.cues;
    // The anchored number lands on its word; the unanchored label follows it by a short gap.
    expect(focal!.landMs).toBe(2030);
    expect(context!.landMs).toBeLessThanOrEqual(focal!.landMs);
    expect(label!.startMs).toBeGreaterThanOrEqual(focal!.landMs + 150);
    expect(juice.budgetOk).toBe(true);
    // Fast juice never runs while text is being read.
    for (const j of juice.beats.filter((b) => !b.slow)) {
      for (const w of plan.quiet)
        expect(j.atMs + j.durMs <= w.startMs || j.atMs >= w.endMs).toBe(true);
    }
    comp.dispose();
  });

  it('drops an optional cue that does not fit and hides its actor', () => {
    const ctx = ctxFor({ look: LOOK, words: WORDS, durationMs: 3200 });
    const comp = statScene(ctx);
    expect(comp.report.plan.dropped).toEqual(['label']);
    expect(ctx.root.querySelector<HTMLElement>('[data-actor="label"]')!.style.display).toBe('none');
    comp.dispose();
  });

  it('moves the camera at most 3 % across any read window, and snaps only outside them', () => {
    const comp = statScene(ctxFor({ look: LOOK, words: WORDS, energy: 'hype' }));
    for (const w of comp.report.plan.quiet) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let t = w.startMs; t <= w.endMs; t += 10) {
        const s = comp.camera(t);
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
      expect(hi - lo).toBeLessThanOrEqual(QUIET_CAMERA_MAX);
    }
    expect(comp.camera(0)).toBe(1);
    comp.dispose();
  });

  it('snaps a snap-able cue to a clearly more stressed neighbour, never a fixed one', () => {
    const words = WORDS;
    const stress = [50, 50, 50, 55, 90, 50, 50];
    const base = { words, stress, durationMs: 6000, enterMs: 600, exitMs: 360 };
    const snapped = scheduleBeats({
      ...base,
      cues: [{ id: 'a', snap: true }],
      anchors: [{ cue: 'a', word: 3 }],
    });
    expect(snapped.cues[0]).toMatchObject({ word: 4, snapped: true, landMs: 2630 });
    const fixed = scheduleBeats({ ...base, cues: [{ id: 'a' }], anchors: [{ cue: 'a', word: 3 }] });
    expect(fixed.cues[0]).toMatchObject({ word: 3, snapped: false, landMs: 2030 });
  });

  it('fills a long quiet slot at every energy, slow juice only inside read windows', () => {
    const plan = scheduleBeats({
      cues: [{ id: 'line', words: 6 }],
      durationMs: 9000,
      enterMs: 600,
      exitMs: 360,
    });
    for (const energy of ['calm', 'steady', 'lively', 'hype'] as const) {
      const j = planJuice(plan, { energy, juice: ['camera-snap', 'camera-push'], seed: 1 });
      expect(j.budgetOk).toBe(true);
      const track = cameraTrack(plan.quiet, j.beats, {
        push: [1, 1.06],
        snap: 0.08,
        durationMs: 9000,
      });
      expect(track(9000)).toBeGreaterThan(1);
    }
  });

  it('is a pure function of time, with and without a look', () => {
    for (const look of [undefined, LOOK]) {
      const scene: MotionComponent<{ n: number }> = {
        id: 'test-stat',
        name: 'Test stat',
        category: 'data',
        params: z.object({ n: z.number() }),
        defaults: { n: 40 },
        durationMs: { min: 2600, ideal: 6000, max: 8000 },
        formats: ['16:9'],
        keyMomentMs: () => 2030,
        build: (ctx) => statScene({ ...ctx, ...(look ? { look } : {}), words: WORDS }),
      };
      expect(() => assertSeekPure(scene, { n: 40 }, { numRuns: 40 })).not.toThrow();
    }
  });
});
