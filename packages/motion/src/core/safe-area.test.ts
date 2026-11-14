import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contains, insetForCamera, safeArea, type Box } from './safe-area';

const frameArb = fc.record({
  width: fc.integer({ min: 100, max: 4000 }),
  height: fc.integer({ min: 100, max: 4000 }),
});

// Boxes at least 5 % of the frame in each dimension (a narrower box far from the centre cannot
// hold any point that survives a 1.1x push-in, so no inset exists).
const boxIn = (w: number, h: number) =>
  fc
    .tuple(
      fc.double({ min: 0, max: 0.95, noNaN: true }),
      fc.double({ min: 0, max: 0.95, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
    )
    .map(([a, b, c, d]): Box => {
      const x = a * w;
      const y = b * h;
      return {
        x,
        y,
        width: 0.05 * w + c * (w - x - 0.05 * w),
        height: 0.05 * h + d * (h - y - 0.05 * h),
      };
    });

describe('insetForCamera', () => {
  it('keeps scaled corners of the inset box inside the original box', () => {
    fc.assert(
      fc.property(
        frameArb.chain((f) => fc.tuple(fc.constant(f), boxIn(f.width, f.height))),
        fc.double({ min: 1, max: 1.1, noNaN: true }),
        ([f, box], amount) => {
          const inset = insetForCamera(box, f.width, f.height, amount);
          expect(inset.width).toBeGreaterThanOrEqual(0);
          expect(inset.height).toBeGreaterThanOrEqual(0);
          const cx = f.width / 2;
          const cy = f.height / 2;
          const xs = [inset.x, inset.x + inset.width];
          const ys = [inset.y, inset.y + inset.height];
          for (const x of xs) {
            for (const y of ys) {
              const p = { x: cx + (x - cx) * amount, y: cy + (y - cy) * amount };
              expect(contains(box, { ...p, width: 0, height: 0 }, 0.5)).toBe(true);
            }
          }
        },
      ),
    );
  });

  it('returns the box unchanged at amount 1 and throws below 1', () => {
    const box = safeArea('16:9', 1920, 1080);
    expect(insetForCamera(box, 1920, 1080, 1)).toEqual(box);
    expect(() => insetForCamera(box, 1920, 1080, 0.99)).toThrow();
  });
});
