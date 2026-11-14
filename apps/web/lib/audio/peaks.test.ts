import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PeaksRequestSchema, PeaksResponseSchema } from './peaks-messages';
import { computePeaks, mixToMono, peaksForRange, samplesPerBucket } from './peaks';

const SR = 1000; // 10 ms bucket = 10 samples
const f32 = (a: number[]) => Float32Array.from(a);

describe('computePeaks', () => {
  it('empty input gives empty output', () => {
    expect(computePeaks(new Float32Array(0), 48_000).length).toBe(0);
  });

  it('silence gives zeros', () => {
    const p = computePeaks(new Float32Array(100), SR);
    expect(p.length).toBe(20);
    expect([...p].every((v) => v === 0)).toBe(true);
  });

  it('a constant 0.5 gives [0.5, 0.5]', () => {
    const p = computePeaks(new Float32Array(35).fill(0.5), SR);
    expect(p.length).toBe(8);
    for (let i = 0; i < p.length; i++) expect(p[i]).toBe(0.5);
  });

  it('a sine of amplitude a reaches about ±a per bucket', () => {
    const sr = 48_000;
    const a = 0.7;
    const s = new Float32Array(sr).map((_, i) => a * Math.sin((2 * Math.PI * 100 * i) / sr));
    const p = computePeaks(s, sr, 20); // 20 ms = two periods of 100 Hz
    for (let b = 0; b < p.length / 2; b++) {
      expect(p[b * 2]).toBeLessThan(-a + 0.01);
      expect(p[b * 2 + 1]).toBeGreaterThan(a - 0.01);
    }
  });

  it('output length is 2 * ceil(n / samplesPerBucket)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 100, max: 48_000 }),
        fc.integer({ min: 1, max: 100 }),
        (n, sr, ms) => {
          const p = computePeaks(new Float32Array(n), sr, ms);
          expect(p.length).toBe(2 * Math.ceil(n / samplesPerBucket(sr, ms)));
        },
      ),
    );
  });

  it('min <= max and both within [-1, 1], even for out-of-range input', () => {
    fc.assert(
      fc.property(fc.array(fc.float({ min: -3, max: 3, noNaN: true }), { maxLength: 500 }), (a) => {
        const p = computePeaks(f32(a), SR);
        for (let b = 0; b < p.length / 2; b++) {
          const lo = p[b * 2] ?? 0;
          const hi = p[b * 2 + 1] ?? 0;
          expect(lo).toBeLessThanOrEqual(hi);
          expect(lo).toBeGreaterThanOrEqual(-1);
          expect(hi).toBeLessThanOrEqual(1);
        }
      }),
    );
  });
});

describe('mixToMono', () => {
  it('averages channels', () => {
    expect([...mixToMono([f32([1, 0, -1]), f32([0, 0, 1])])]).toEqual([0.5, 0, 0]);
  });
  it('handles none and one channel', () => {
    expect(mixToMono([]).length).toBe(0);
    expect([...mixToMono([f32([0.25])])]).toEqual([0.25]);
  });
});

describe('peaksForRange', () => {
  const peaksArb = fc
    .array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: 2, maxLength: 200 })
    .map((a) => computePeaks(f32(a), SR));

  it('full range with columns = buckets equals the input', () => {
    fc.assert(
      fc.property(peaksArb, (p) => {
        const buckets = p.length / 2;
        expect([...peaksForRange(p, 10, 0, buckets * 10, buckets)]).toEqual([...p]);
      }),
    );
  });

  it('aggregates to min of mins and max of maxes', () => {
    const p = f32([-0.1, 0.2, -0.5, 0.1, -0.2, 0.9, -0.3, 0.3]);
    expect([...peaksForRange(p, 10, 0, 40, 1)]).toEqual([Math.fround(-0.5), Math.fround(0.9)]);
    expect([...peaksForRange(p, 10, 0, 40, 2)]).toEqual([
      Math.fround(-0.5),
      Math.fround(0.2),
      Math.fround(-0.3),
      Math.fround(0.9),
    ]);
  });

  it('every column stays within the global min/max, and is [0, 0] outside the data', () => {
    fc.assert(
      fc.property(peaksArb, fc.integer({ min: 1, max: 50 }), (p, cols) => {
        const out = peaksForRange(p, 10, -100, p.length * 5 + 100, cols);
        let gMin = 0;
        let gMax = 0;
        for (let i = 0; i < p.length; i += 2) {
          gMin = Math.min(gMin, p[i] ?? 0);
          gMax = Math.max(gMax, p[i + 1] ?? 0);
        }
        for (let c = 0; c < cols; c++) {
          expect(out[c * 2]).toBeGreaterThanOrEqual(gMin);
          expect(out[c * 2 + 1]).toBeLessThanOrEqual(gMax);
        }
      }),
    );
    const out = peaksForRange(f32([-1, 1]), 10, 1000, 2000, 4);
    expect([...out]).toEqual(new Array(8).fill(0));
  });

  it('degenerate inputs give zeros or empty', () => {
    expect(peaksForRange(new Float32Array(0), 10, 0, 100, 3).length).toBe(6);
    expect(peaksForRange(f32([-1, 1]), 10, 50, 50, 3).length).toBe(6);
    expect(peaksForRange(f32([-1, 1]), 10, 0, 10, 0).length).toBe(0);
  });
});

describe('message schemas', () => {
  it('accept a valid request and reject invalid ones', () => {
    const ok = { type: 'peaks', id: 'a', sampleRate: 48_000, channels: [new Float32Array(4)] };
    expect(PeaksRequestSchema.safeParse(ok).success).toBe(true);
    expect(PeaksRequestSchema.safeParse({ ...ok, bucketMs: 5 }).success).toBe(true);
    expect(PeaksRequestSchema.safeParse({ ...ok, id: '' }).success).toBe(false);
    expect(PeaksRequestSchema.safeParse({ ...ok, sampleRate: 0 }).success).toBe(false);
    expect(PeaksRequestSchema.safeParse({ ...ok, channels: [[0, 1]] }).success).toBe(false);
    expect(PeaksRequestSchema.safeParse({ ...ok, bucketMs: -1 }).success).toBe(false);
    expect(PeaksRequestSchema.safeParse({ ...ok, type: 'nope' }).success).toBe(false);
  });

  it('accept valid replies and reject invalid ones', () => {
    const ok = { type: 'peaks', id: 'a', bucketMs: 10, peaks: new Float32Array(2) };
    expect(PeaksResponseSchema.safeParse(ok).success).toBe(true);
    expect(PeaksResponseSchema.safeParse({ type: 'error', id: 'a', message: 'x' }).success).toBe(
      true,
    );
    expect(PeaksResponseSchema.safeParse({ ...ok, peaks: [0, 1] }).success).toBe(false);
    expect(PeaksResponseSchema.safeParse({ type: 'error', id: 'a' }).success).toBe(false);
  });
});
