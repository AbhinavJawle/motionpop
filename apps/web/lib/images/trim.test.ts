import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contentBox, paddedCrop, paperColour, paperToAlpha, whitenPaper } from './trim';

function paper(w: number, h: number, rgb: [number, number, number]): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) a.set([...rgb, 255], i * 4);
  return a;
}

describe('paper trim (spec 26)', () => {
  it('finds the drawing on off-white paper', () => {
    const a = paper(40, 30, [250, 246, 238]);
    for (let y = 10; y < 20; y++) for (let x = 5; x < 25; x++) a.set([30, 30, 30, 255], (y * 40 + x) * 4);
    const p = paperColour(a, 40, 30);
    expect(contentBox(a, 40, 30, p)).toEqual({ x: 5, y: 10, w: 20, h: 10 });
  });

  it('answers null for a blank page and ignores faint grain', () => {
    const a = paper(20, 20, [255, 255, 255]);
    a.set([245, 245, 245, 255], (5 * 20 + 5) * 4);
    expect(contentBox(a, 20, 20, paperColour(a, 20, 20))).toBeNull();
  });

  it('a padded crop always stays inside the picture and holds the box', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 1, max: 400 }),
        fc.nat(),
        fc.nat(),
        fc.nat(),
        fc.nat(),
        (w, h, a, b, c, d) => {
          const x = a % w;
          const y = b % h;
          const box = { x, y, w: 1 + (c % (w - x)), h: 1 + (d % (h - y)) };
          const r = paddedCrop(box, w, h);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(w);
          expect(r.y + r.h).toBeLessThanOrEqual(h);
          expect(r.x).toBeLessThanOrEqual(box.x);
          expect(r.y).toBeLessThanOrEqual(box.y);
          expect(r.x + r.w).toBeGreaterThanOrEqual(box.x + box.w);
          expect(r.y + r.h).toBeGreaterThanOrEqual(box.y + box.h);
        },
      ),
    );
  });

  it('turns the paper pure white and keeps dark ink dark', () => {
    const a = paper(4, 4, [240, 236, 228]);
    a.set([24, 24, 24, 255], 5 * 4);
    whitenPaper(a, paperColour(a, 4, 4));
    expect([a[0], a[1], a[2]]).toEqual([255, 255, 255]);
    expect(a[20]!).toBeLessThan(30);
  });

  it('makes white paper transparent and keeps how every pixel looks over white', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 3, maxLength: 3 }), ([r, g, b]) => {
        const a = new Uint8ClampedArray([r!, g!, b!, 255]);
        paperToAlpha(a);
        const al = a[3]! / 255;
        for (let c = 0; c < 3; c++) {
          const overWhite = a[c]! * al + 255 * (1 - al);
          expect(Math.abs(overWhite - [r!, g!, b!][c]!)).toBeLessThanOrEqual(2);
        }
      }),
    );
    const w = new Uint8ClampedArray([255, 255, 255, 255]);
    paperToAlpha(w);
    expect(w[3]).toBe(0);
  });
});
