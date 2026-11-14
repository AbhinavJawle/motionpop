import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fitView, msToX, rulerTicks, xToMs, zoomAt, DEFAULT_ZOOM_LIMITS } from './geometry';

const viewArb = fc.record({
  pxPerMs: fc.double({ min: 0.01, max: 1, noNaN: true }),
  scrollMs: fc.integer({ min: 0, max: 600_000 }),
});

describe('geometry', () => {
  it('ms <-> px round trip is within 1 px', () => {
    fc.assert(
      fc.property(viewArb, fc.integer({ min: 0, max: 600_000 }), (view, ms) => {
        const back = xToMs(msToX(ms, view), view);
        expect(Math.abs(msToX(back, view) - msToX(ms, view))).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('zoomAt keeps the anchor time fixed and stays within limits', () => {
    fc.assert(
      fc.property(
        viewArb,
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        fc.integer({ min: 0, max: 2000 }),
        (view, factor, anchorX) => {
          const next = zoomAt(view, factor, anchorX);
          expect(next.pxPerMs).toBeGreaterThanOrEqual(DEFAULT_ZOOM_LIMITS.minPxPerMs);
          expect(next.pxPerMs).toBeLessThanOrEqual(DEFAULT_ZOOM_LIMITS.maxPxPerMs);
          const before = anchorX / view.pxPerMs + view.scrollMs;
          const after = anchorX / next.pxPerMs + next.scrollMs;
          expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
          expect(Number.isInteger(next.scrollMs)).toBe(true);
        },
      ),
    );
  });

  it('ruler majors are >= 64 px apart, integer, and minors sit between', () => {
    fc.assert(
      fc.property(
        fc.record({
          pxPerMs: fc.double({ min: 0.0025, max: 2, noNaN: true }),
          scrollMs: fc.integer({ min: 0, max: 300_000 }),
        }),
        fc.integer({ min: 200, max: 3000 }),
        (view, width) => {
          const t = rulerTicks(view, width);
          expect(t.stepMs * view.pxPerMs).toBeGreaterThanOrEqual(64);
          for (const ms of [...t.majors, ...t.minors]) expect(Number.isInteger(ms)).toBe(true);
          for (const ms of t.majors) expect(ms % t.stepMs).toBe(0);
          for (const ms of t.minors) expect(ms % t.stepMs).not.toBe(0);
          for (let i = 1; i < t.majors.length; i++) {
            const gap = (t.majors[i] ?? 0) - (t.majors[i - 1] ?? 0);
            expect(gap * view.pxPerMs).toBeGreaterThanOrEqual(64);
          }
        },
      ),
    );
  });

  it('fitView shows the whole duration', () => {
    const v = fitView(18_000, 900);
    expect(v.scrollMs).toBe(0);
    expect(msToX(18_000, v)).toBeCloseTo(900);
  });
});
