import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { snap, snapRange, wordBoundaries } from './snap';

const boundsArb = fc
  .array(fc.integer({ min: 0, max: 60_000 }), { minLength: 1, maxLength: 40 })
  .map((a) => wordBoundaries(a.map((n) => ({ startMs: n, endMs: n + 100 }))));
const ppmArb = fc.double({ min: 0.01, max: 2, noNaN: true });

describe('snap', () => {
  it('wordBoundaries is sorted and unique', () => {
    expect(
      wordBoundaries([
        { startMs: 5, endMs: 9 },
        { startMs: 9, endMs: 12 },
      ]),
    ).toEqual([5, 9, 12]);
  });

  it('returns the input or a boundary, moving at most threshold/pxPerMs', () => {
    fc.assert(
      fc.property(boundsArb, fc.integer({ min: 0, max: 61_000 }), ppmArb, (b, ms, ppm) => {
        const r = snap(ms, b, ppm);
        if (r.snapped) {
          expect(b).toContain(r.ms);
          expect(Math.abs(r.ms - ms) * ppm).toBeLessThanOrEqual(8 + 1e-9);
        } else {
          expect(r.ms).toBe(ms);
        }
      }),
    );
  });

  it('snapRange preserves duration and lands an edge on a boundary when snapped', () => {
    fc.assert(
      fc.property(
        boundsArb,
        fc.integer({ min: 0, max: 60_000 }),
        fc.integer({ min: 1, max: 12_000 }),
        ppmArb,
        (b, start, len, ppm) => {
          const r = snapRange(start, start + len, b, ppm);
          expect(r.endMs - r.startMs).toBe(len);
          if (r.snapped) expect(b.includes(r.startMs) || b.includes(r.endMs)).toBe(true);
          else expect(r.startMs).toBe(start);
        },
      ),
    );
  });
});
