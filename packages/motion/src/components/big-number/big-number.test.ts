// @vitest-environment happy-dom
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FORMATS, type Format } from '@motionpop/schemas';
import type { BuildContext } from '../../contract';
import { formatCount } from '../../core/count';
import { contains, insetForCamera, safeArea } from '../../core/safe-area';
import { bigNumberTimings, HOLD_MS } from './build';
import { layoutBigNumber } from './layout';
import { bigNumberParams, type BigNumberParams } from './params';
import { arbitrary } from './samples';
import { editorialExplainer } from '../../styles';
import { bigNumber } from './index';

const DURATION_MS = 3600;
const KEY_MOMENT_MS = bigNumber.keyMomentMs(bigNumber.defaults, DURATION_MS);

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  const ctx: BuildContext = {
    root,
    width: 1280,
    height: 720,
    format: '16:9',
    style: editorialExplainer,
    durationMs: DURATION_MS,
    keyMomentMs: KEY_MOMENT_MS,
    fps: 30,
    seed: 1,
    warn: () => {},
  };
  const comp = bigNumber.build(ctx, bigNumber.defaults);
  return { root, comp };
}

const timeArb = fc.integer({ min: 0, max: DURATION_MS });

describe('big-number seek determinism', () => {
  it('seeking to the same t twice gives identical innerHTML', () => {
    const { root, comp } = mount();
    fc.assert(
      fc.property(timeArb, (t) => {
        comp.seek(t);
        const first = root.innerHTML;
        comp.seek(t);
        expect(root.innerHTML).toBe(first);
      }),
    );
  });

  it('a random seek sequence then t equals a fresh build seeked straight to t', () => {
    const live = mount();
    fc.assert(
      fc.property(fc.array(timeArb, { maxLength: 20 }), timeArb, (seq, t) => {
        for (const s of seq) live.comp.seek(s);
        live.comp.seek(t);
        const fresh = mount();
        fresh.comp.seek(t);
        expect(live.root.innerHTML).toBe(fresh.root.innerHTML);
        fresh.comp.dispose();
        fresh.root.remove();
      }),
    );
  });
});

function mountWith(p: BigNumberParams, durationMs = DURATION_MS, format: Format = '16:9') {
  const root = document.createElement('div');
  document.body.append(root);
  const { width, height } = FORMATS[format];
  const warnings: string[] = [];
  const keyMomentMs = bigNumber.keyMomentMs(p, durationMs);
  const comp = bigNumber.build(
    {
      root,
      width,
      height,
      format,
      style: editorialExplainer,
      durationMs,
      keyMomentMs,
      fps: 30,
      seed: 1,
      warn: (m) => warnings.push(m),
    },
    p,
  );
  return { root, comp, keyMomentMs, warnings };
}

const focalText = (root: HTMLElement) => root.querySelector('[data-focal]')?.textContent ?? '';

describe('big-number v1 contract', () => {
  it('every params field is described (the AI reads the descriptions)', () => {
    for (const [key, field] of Object.entries(bigNumberParams.shape)) {
      expect(field.description, key).toBeTruthy();
    }
  });

  it('data honesty: lands exactly on formatCount(value) at the key moment, never before', () => {
    fc.assert(
      fc.property(arbitrary, fc.constantFrom<Format>('16:9', '9:16', '1:1'), (p, format) => {
        const { root, comp, keyMomentMs } = mountWith(p, DURATION_MS, format);
        const final = formatCount(p.value, {
          prefix: p.prefix,
          suffix: p.suffix,
          decimals: p.decimals,
        });
        comp.seek(keyMomentMs);
        expect(focalText(root)).toBe(final);
        comp.seek(DURATION_MS);
        expect(focalText(root)).toBe(final);
        const startsEqual =
          formatCount(p.countFrom, { prefix: p.prefix, suffix: p.suffix, decimals: p.decimals }) ===
          final;
        if (!startsEqual && keyMomentMs > 0) {
          comp.seek(keyMomentMs - 1);
          expect(focalText(root)).not.toBe(final);
        }
        comp.dispose();
        root.remove();
      }),
      { numRuns: 60 },
    );
  });

  it('marks text, focal and highlight hooks and keeps a transparent root', () => {
    const { root } = mountWith({ ...bigNumber.defaults, context: 'The bigger picture' });
    expect(root.querySelectorAll('[data-text]')).toHaveLength(3);
    expect(root.querySelector('[data-focal]')?.getAttribute('data-on')).toBe('highlight');
    expect(root.style.background).toBe('');
    expect(root.style.backgroundColor).toBe('');
  });

  it('supports all three formats with boxes inside the camera-safe area', () => {
    for (const format of bigNumber.formats) {
      const { width, height } = FORMATS[format];
      const safe = insetForCamera(
        safeArea(format, width, height),
        width,
        height,
        editorialExplainer.motion.camera.pushIn,
      );
      for (const hasContext of [true, false]) {
        const l = layoutBigNumber(format, height, safe, hasContext);
        const boxes = [l.context, l.number, l.label].filter((s) => s !== null).map((s) => s.box);
        for (const b of boxes) expect(contains(safe, b)).toBe(true);
        for (let i = 1; i < boxes.length; i++)
          expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height);
      }
    }
  });

  it('keeps the label readable for 800 ms before the exit from the minimum duration up', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: bigNumber.durationMs.min, max: bigNumber.durationMs.max }),
        fc.integer({ min: 300, max: 1500 }),
        (dur, enterMs) => {
          const key = bigNumber.keyMomentMs(bigNumber.defaults, dur);
          const t = bigNumberTimings(enterMs, dur, key);
          expect(t.exitStart - (t.labelStart + t.enter)).toBeGreaterThanOrEqual(HOLD_MS);
          expect(t.exit).toBeLessThan(t.enter);
          expect(t.numberIn + t.numberInDur).toBeLessThanOrEqual(key);
        },
      ),
    );
  });
});
