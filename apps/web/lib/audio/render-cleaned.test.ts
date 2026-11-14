import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isSilent, rms } from './decode';
import { keptSegments } from './render-cleaned';
import { encodeWav, readWavHeader } from './wav';

describe('keptSegments', () => {
  it('maps kept parts to output times and marks the seams', () => {
    const segs = keptSegments(10_000, [
      { startMs: 2000, endMs: 3000 },
      { startMs: 6000, endMs: 6500 },
    ]);
    expect(segs).toEqual([
      { srcStartMs: 0, srcEndMs: 2000, outStartMs: 0, joinsPrev: false, joinsNext: true },
      { srcStartMs: 3000, srcEndMs: 6000, outStartMs: 2000, joinsPrev: true, joinsNext: true },
      { srcStartMs: 6500, srcEndMs: 10_000, outStartMs: 5000, joinsPrev: true, joinsNext: false },
    ]);
  });

  it('has no seam on a leading or trailing cut', () => {
    const segs = keptSegments(5000, [
      { startMs: 0, endMs: 800 },
      { startMs: 4500, endMs: 5000 },
    ]);
    expect(segs).toEqual([
      { srcStartMs: 800, srcEndMs: 4500, outStartMs: 0, joinsPrev: false, joinsNext: false },
    ]);
  });

  it('handles overlapping and nested cuts (regression, found by the property below)', () => {
    expect(
      keptSegments(4, [
        { startMs: 1, endMs: 2 },
        { startMs: 0, endMs: 3 },
      ]),
    ).toEqual([{ srcStartMs: 3, srcEndMs: 4, outStartMs: 0, joinsPrev: false, joinsNext: false }]);
  });

  it('property: segments tile the output with no gaps and keep their lengths', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60_000 }),
        fc.array(fc.tuple(fc.nat(60_000), fc.nat(5000)), { maxLength: 20 }),
        (duration, raw) => {
          const cuts = raw.map(([s, len]) => ({ startMs: s, endMs: s + len }));
          const segs = keptSegments(duration, cuts);
          let out = 0;
          let src = -1;
          for (const s of segs) {
            expect(s.outStartMs).toBe(out);
            expect(s.srcStartMs).toBeGreaterThan(src);
            expect(s.srcEndMs).toBeGreaterThan(s.srcStartMs);
            out += s.srcEndMs - s.srcStartMs;
            src = s.srcEndMs;
            // No kept sample lies inside a cut.
            for (const c of cuts.filter((x) => x.endMs > x.startMs && x.startMs < duration)) {
              expect(s.srcEndMs <= c.startMs || s.srcStartMs >= c.endMs).toBe(true);
            }
          }
        },
      ),
    );
  });
});

describe('wav', () => {
  it('round-trips the header', () => {
    const wav = encodeWav(new Float32Array(24_000 * 2), 24_000);
    expect(readWavHeader(wav)).toEqual({
      sampleRate: 24_000,
      channels: 1,
      bitsPerSample: 16,
      durationMs: 2000,
    });
    expect(readWavHeader(new ArrayBuffer(10))).toBeNull();
  });
});

describe('silence', () => {
  it('detects silence by RMS', () => {
    expect(isSilent(new Float32Array(1000))).toBe(true);
    const tone = Float32Array.from({ length: 1000 }, (_, i) => 0.1 * Math.sin(i / 5));
    expect(rms(tone)).toBeGreaterThan(0.05);
    expect(isSilent(tone)).toBe(false);
  });
});
