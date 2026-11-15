// @vitest-environment happy-dom
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildDecor } from './decor';

const FRAME = { x: 0, y: 0, width: 1920, height: 1080 };

/** Horizontal extent of every path in a mark (the highlighter is one filled outline). */
function extentX(el: Element): { min: number; max: number } {
  const xs = Array.from(el.querySelectorAll('path')).flatMap((p) =>
    [...(p.getAttribute('d') ?? '').matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) =>
      Number(m[1]),
    ),
  );
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

const highlighter = (text: { x: number; y: number; width: number; height: number }, size: number) =>
  buildDecor(document, 'highlighter', text, {
    color: '#FFD43B',
    size,
    stroke: 2,
    seed: 7,
    radius: 6,
    frame: FRAME,
    keepClear: [],
  });

describe('highlighter (spec 07 task 27 fix)', () => {
  it('keeps a big number at the safe-area edge 2.5 % inside the frame', () => {
    // A 324 px stat at the 5 % safe edge: the old pass put its round cap on the frame edge.
    const d = highlighter({ x: 96, y: 300, width: 560, height: 330 }, 324);
    const { min, max } = extentX(d.el);
    expect(min).toBeGreaterThanOrEqual(FRAME.width * 0.025 - 1);
    expect(min).toBeLessThan(96);
    expect(max).toBeGreaterThan(96 + 560);
  });

  it('stays inside the frame and covers the middle of any text in the safe area', () => {
    // Text boxes as stages set them: inside the 5 % safe area, up to a 0.3 × height number.
    fc.assert(
      fc.property(
        fc.integer({ min: 96, max: 1700 }),
        fc.integer({ min: 20, max: 1728 }),
        fc.integer({ min: 30, max: 330 }),
        (x, width, height) => {
          const w = Math.max(1, Math.min(width, 1824 - x));
          const { min, max } = extentX(highlighter({ x, y: 400, width: w, height }, height).el);
          const inset = FRAME.width * 0.025;
          expect(min).toBeGreaterThanOrEqual(inset - 1);
          expect(max).toBeLessThanOrEqual(FRAME.width - inset + 1);
          // The middle of the text inside the inset frame is always under the pass.
          const mid = Math.min(Math.max(x + w / 2, inset), FRAME.width - inset);
          expect(min).toBeLessThanOrEqual(mid + 1);
          expect(max).toBeGreaterThanOrEqual(mid - 1);
        },
      ),
      { numRuns: 200 },
    );
  });
});
