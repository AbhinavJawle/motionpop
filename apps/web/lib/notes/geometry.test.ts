import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { noteProblem } from '@/lib/commands/notes';
import {
  MAX_PATH_POINTS,
  MIN_REGION_AREA,
  bubbleAnchor,
  bubbleSize,
  cropRect,
  fitStroke,
  growRegion,
  regionOf,
  simplifyPath,
  type Pt,
  type Region,
} from './geometry';

const inside = (r: Region) =>
  r.x >= -1e-9 &&
  r.y >= -1e-9 &&
  r.x + r.w <= 1 + 1e-9 &&
  r.y + r.h <= 1 + 1e-9 &&
  r.w >= 0 &&
  r.h >= 0;
const area = (r: Region) => r.w * r.h;
const note = (shape: ReturnType<typeof fitStroke>['shape']) => ({
  id: 'n',
  tMs: 0,
  shape,
  text: 'x',
  status: 'open' as const,
});

/** A drawn stroke: 1 to 300 points, some outside the frame (the pointer can leave it). */
const strokeArb = fc.array(
  fc.record({
    x: fc.double({ min: -0.2, max: 1.2, noNaN: true }),
    y: fc.double({ min: -0.2, max: 1.2, noNaN: true }),
  }),
  { minLength: 0, maxLength: 300 },
);

const circleStroke = (cx: number, cy: number, rx: number, ry: number, n = 40): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => ({
    x: cx + rx * Math.cos((i / n) * Math.PI * 2),
    y: cy + ry * Math.sin((i / n) * Math.PI * 2),
  }));

describe('fitStroke', () => {
  it('a closed loop becomes an ellipse around its bounds', () => {
    const f = fitStroke(circleStroke(0.5, 0.4, 0.2, 0.1));
    expect(f.shape.kind).toBe('circle');
    expect(f.shape.points[0]).toBeCloseTo(0.5, 2);
    expect(f.shape.points[1]).toBeCloseTo(0.4, 2);
    expect(f.shape.points[2]).toBeCloseTo(0.2, 2);
    expect(f.shape.points[3]).toBeCloseTo(0.1, 2);
  });

  it('a loop that nearly closes (end within 15 % of the diagonal) is still an ellipse', () => {
    const loop = circleStroke(0.5, 0.5, 0.2, 0.2, 40).slice(0, 39);
    expect(fitStroke(loop).shape.kind).toBe('circle');
  });

  it('an open stroke stays a path, simplified', () => {
    const line: Pt[] = Array.from({ length: 200 }, (_, i) => ({ x: 0.1 + i * 0.004, y: 0.5 }));
    const f = fitStroke(line);
    expect(f.shape.kind).toBe('path');
    expect(f.shape.points.length).toBe(4); // a straight line is its two ends
  });

  it('a click is a small ellipse', () => {
    const f = fitStroke([{ x: 0.3, y: 0.3 }]);
    expect(f.shape.kind).toBe('circle');
    f.shape.points.forEach((v, i) => expect(v).toBeCloseTo([0.3, 0.3, 0.05, 0.05][i] as number, 9));
  });

  it('a small region grows to 4 % of the frame and keeps what was circled', () => {
    const f = fitStroke(circleStroke(0.5, 0.5, 0.04, 0.04));
    expect(area(f.region)).toBeGreaterThanOrEqual(MIN_REGION_AREA - 1e-9);
    expect(f.region.x).toBeLessThan(0.46);
    expect(f.region.x + f.region.w).toBeGreaterThan(0.54);
  });

  it('P7: any stroke gives a shape the note commands accept, and a region inside the frame', () => {
    fc.assert(
      fc.property(strokeArb, (stroke) => {
        const f = fitStroke(stroke);
        expect(noteProblem(note(f.shape))).toBeUndefined();
        expect(f.shape.points.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
        expect(inside(f.region)).toBe(true);
        expect(area(f.region)).toBeGreaterThanOrEqual(MIN_REGION_AREA - 1e-9);
        if (f.shape.kind === 'path') {
          expect(f.shape.points.length / 2).toBeLessThanOrEqual(MAX_PATH_POINTS);
          expect(f.shape.points.length % 2).toBe(0);
        } else {
          expect(f.shape.points).toHaveLength(4);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('P7: the region contains the shape that was drawn (inside the frame)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.9, noNaN: true }),
        fc.double({ min: 0.1, max: 0.9, noNaN: true }),
        fc.double({ min: 0.005, max: 0.4, noNaN: true }),
        fc.double({ min: 0.005, max: 0.4, noNaN: true }),
        (cx, cy, rx, ry) => {
          const f = fitStroke(circleStroke(cx, cy, rx, ry));
          const x0 = Math.max(0, cx - rx);
          const x1 = Math.min(1, cx + rx);
          const y0 = Math.max(0, cy - ry);
          const y1 = Math.min(1, cy + ry);
          expect(f.region.x).toBeLessThanOrEqual(x0 + 1e-6);
          expect(f.region.y).toBeLessThanOrEqual(y0 + 1e-6);
          expect(f.region.x + f.region.w).toBeGreaterThanOrEqual(x1 - 1e-6);
          expect(f.region.y + f.region.h).toBeGreaterThanOrEqual(y1 - 1e-6);
        },
      ),
    );
  });
});

describe('simplifyPath', () => {
  it('keeps the ends and at most 64 points, however noisy the stroke', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.double({ min: 0, max: 1, noNaN: true }),
            y: fc.double({ min: 0, max: 1, noNaN: true }),
          }),
          { minLength: 2, maxLength: 2000 },
        ),
        (pts) => {
          const out = simplifyPath(pts);
          expect(out.length).toBeLessThanOrEqual(MAX_PATH_POINTS);
          expect(out.length).toBeGreaterThanOrEqual(2);
          expect(out[0]).toEqual(pts[0]);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('regionOf', () => {
  it('reads the demo note: a 3-value circle has the same radius both ways', () => {
    const r = regionOf({ kind: 'circle', points: [0.62, 0.55, 0.06] });
    expect(area(r)).toBeGreaterThanOrEqual(MIN_REGION_AREA - 1e-9);
    expect(r.x).toBeLessThan(0.56);
    expect(r.x + r.w).toBeGreaterThan(0.68);
  });
  it('a 3-value circle is round on screen: its height is r × the frame aspect', () => {
    const wide = regionOf({ kind: 'circle', points: [0.5, 0.5, 0.1] }, 16 / 9);
    expect(wide.w).toBeCloseTo(0.2, 6);
    expect(wide.h).toBeCloseTo(0.2 * (16 / 9), 6);
    const square = regionOf({ kind: 'circle', points: [0.5, 0.5, 0.1] }, 1);
    expect(square.h).toBeCloseTo(0.2, 6);
    // A 4-value circle has its own radii: the aspect is ignored.
    expect(regionOf({ kind: 'circle', points: [0.5, 0.5, 0.1, 0.1] }, 16 / 9).h).toBeCloseTo(
      0.2,
      6,
    );
  });
  it('P7: any stored shape gives a region inside the frame, at least 4 %', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('circle' as const, 'path' as const),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 3, maxLength: 128 }),
        (kind, v) => {
          const r = regionOf({ kind, points: v });
          expect(inside(r)).toBe(true);
          expect(area(r)).toBeGreaterThanOrEqual(MIN_REGION_AREA - 1e-9);
        },
      ),
    );
  });
});

describe('growRegion and cropRect', () => {
  it('growRegion never shrinks and stays inside', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (x, y, w, h) => {
          const r0 = { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
          const g = growRegion(r0);
          expect(inside(g)).toBe(true);
          expect(g.w).toBeGreaterThanOrEqual(r0.w - 1e-9);
          expect(g.h).toBeGreaterThanOrEqual(r0.h - 1e-9);
        },
      ),
    );
  });
  it('cropRect adds context and stays inside the frame', () => {
    const c = cropRect({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 });
    expect(c.w).toBeGreaterThan(0.2);
    expect(inside(c)).toBe(true);
    expect(inside(cropRect({ x: 0, y: 0, w: 1, h: 1 }))).toBe(true);
  });
});

describe('bubbleAnchor', () => {
  it('goes above when there is room, else beside, and the leader joins bubble and region', () => {
    const roomy = bubbleAnchor({ x: 0.4, y: 0.5, w: 0.2, h: 0.2 });
    expect(roomy.side).toBe('above');
    expect(roomy.box.y + roomy.box.h).toBeLessThan(0.5);
    const top = bubbleAnchor({ x: 0.4, y: 0.02, w: 0.2, h: 0.2 });
    expect(top.side).toBe('right');
    expect(top.to.x).toBeCloseTo(0.6);
  });

  it('P7: the bubble is always inside the frame, and off the region when its side fits', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.9, noNaN: true }),
        fc.double({ min: 0, max: 0.9, noNaN: true }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        (x, y, w, h) => {
          const region = growRegion({ x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) });
          const p = bubbleAnchor(region);
          expect(inside(p.box)).toBe(true);
          for (const pt of [p.from, p.to]) {
            expect(pt.x).toBeGreaterThanOrEqual(-1e-9);
            expect(pt.x).toBeLessThanOrEqual(1 + 1e-9);
            expect(pt.y).toBeGreaterThanOrEqual(-1e-9);
            expect(pt.y).toBeLessThanOrEqual(1 + 1e-9);
          }
          const overlaps =
            p.box.x < region.x + region.w &&
            p.box.x + p.box.w > region.x &&
            p.box.y < region.y + region.h &&
            p.box.y + p.box.h > region.y;
          // When some side fits, the bubble does not sit on what was circled.
          const roomAbove = region.y - 0.03 - 0.08 >= 0;
          const roomRight = 1 - (region.x + region.w + 0.03 + 0.26) >= 0;
          const roomLeft = region.x - 0.03 - 0.26 >= 0;
          const roomBelow = 1 - (region.y + region.h + 0.03 + 0.08) >= 0;
          if (roomAbove || roomRight || roomLeft || roomBelow) expect(overlaps).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('bubbleSize', () => {
  it('is wider in frame units for narrower frames, and always fits in the frame', () => {
    for (const aspect of [16 / 9, 1, 9 / 16]) {
      for (const wide of [false, true]) {
        const s = bubbleSize(aspect, wide);
        expect(s.w).toBeLessThanOrEqual(1);
        expect(s.h).toBeLessThanOrEqual(1);
      }
    }
    expect(bubbleSize(9 / 16).w).toBeGreaterThan(bubbleSize(16 / 9).w);
    expect(bubbleSize(1, true).w).toBeGreaterThan(bubbleSize(1).w);
  });
});
