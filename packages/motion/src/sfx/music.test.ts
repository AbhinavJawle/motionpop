import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SFX_SAMPLE_RATE, gainToDb, peakOf } from './dsp';
import { rmsDb } from './level';
import { MUSIC_BED_IDS, fitMusic, renderBedLoop, synthBed } from './music';

const SR = SFX_SAMPLE_RATE;

describe('synthBed', () => {
  it('property 7 for beds: deterministic, finite, exact length, peak <= -1 dBFS', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MUSIC_BED_IDS),
        fc.integer({ min: 0, max: 4000 }),
        fc.constantFrom(1, 7),
        (id, durationMs, seed) => {
          const a = synthBed(id, durationMs, seed);
          const b = synthBed(id, durationMs, seed);
          expect(a.length).toBe(durationMs * 24);
          expect(a.every((v, i) => v === b[i])).toBe(true);
          expect(a.every(Number.isFinite)).toBe(true);
          if (a.length > 0) expect(gainToDb(peakOf(a))).toBeLessThanOrEqual(-1);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('an 8-bar loop is 26.7 s at 72 BPM and 20 s at 96 BPM, and is not silent', () => {
    const pad = renderBedLoop('calm-pad', 1);
    const pulse = renderBedLoop('steady-pulse', 1);
    expect(pad.length).toBe(Math.round(8 * 4 * (60 / 72) * SR));
    expect(pulse.length).toBe(20 * SR);
    expect(rmsDb(pad)).toBeGreaterThan(-30);
    expect(rmsDb(pulse)).toBeGreaterThan(-30);
    // Cyclic: the step across the seam is no bigger than the largest step inside the loop.
    for (const x of [pad, pulse]) {
      let inner = 0;
      for (let i = 1; i < x.length; i++) inner = Math.max(inner, Math.abs(x[i]! - x[i - 1]!));
      expect(Math.abs(x[0]! - x[x.length - 1]!)).toBeLessThanOrEqual(inner);
    }
  });

  it('tiles the cyclic loop back to back, so the beat grid is kept', () => {
    const loop = renderBedLoop('steady-pulse', 1);
    const bed = synthBed('steady-pulse', 23_000, 1);
    let same = true;
    for (let j = 0; j < SR; j += 7) if (bed[loop.length + j] !== loop[j]) same = false;
    expect(same).toBe(true);
  });

  it('seeds change the bed', () => {
    const a = synthBed('calm-pad', 1000, 1);
    const b = synthBed('calm-pad', 1000, 7);
    expect(a.every((v, i) => v === b[i])).toBe(false);
  });

  it('fades in over 1 s and out over 1.5 s', () => {
    const x = synthBed('steady-pulse', 4000, 1);
    expect(x[0]).toBe(0);
    expect(Math.abs(x[x.length - 1] ?? 1)).toBeLessThan(1e-3);
    expect(rmsDb(x, 0, 0.1 * SR)).toBeLessThan(rmsDb(x, 1.2 * SR, 2.2 * SR) - 6);
    expect(rmsDb(x, 3.9 * SR, 4 * SR)).toBeLessThan(rmsDb(x, 1.2 * SR, 2.2 * SR) - 6);
  });
});

describe('fitMusic', () => {
  const loop = Float32Array.from({ length: 2400 }, () => 0.5); // 100 ms of DC at 24 kHz

  it('returns exactly the duration and trims a long track', () => {
    expect(fitMusic(loop, 50, SR, { fadeInMs: 0, fadeOutMs: 0 })).toEqual(
      Float32Array.from({ length: 1200 }, () => 0.5),
    );
  });

  it('loops with equal-power crossfades: the overlap peaks at sqrt(2) of a correlated signal', () => {
    // 100 ms loop, 20 ms crossfade, 300 ms out: repeats start every 80 ms.
    const y = fitMusic(loop, 300, SR, { crossfadeMs: 20, fadeInMs: 0, fadeOutMs: 0 });
    expect(y.length).toBe(7200);
    expect(y[0]).toBe(0.5);
    expect(y[1920 - 1]).toBeCloseTo(0.5, 6); // just before the first overlap
    expect(y[1920 + 240]).toBeCloseTo(0.5 * Math.SQRT2, 3); // equal-power middle
    expect(y[2400 + 10]).toBeCloseTo(0.5, 6); // after the overlap
    expect(Math.max(...y)).toBeLessThanOrEqual(0.5 * Math.SQRT2 + 1e-6);
  });

  it('cyclic loops tile back to back with no overlap', () => {
    const ramp = Float32Array.from({ length: 100 }, (_, i) => i / 100);
    const y = fitMusic(ramp, 30, SR, { cyclic: true, fadeInMs: 0, fadeOutMs: 0 });
    expect(y.length).toBe(720);
    for (let i = 0; i < 720; i += 13) expect(y[i]).toBe(ramp[i % 100]);
  });

  it('shortens the fades proportionally for a video shorter than both', () => {
    const y = fitMusic(loop, 50, SR);
    expect(y[0]).toBe(0);
    expect(Math.abs(y[y.length - 1] ?? 1)).toBeLessThan(1e-3);
    expect(peakOf(y)).toBeGreaterThan(0.45);
  });

  it('an empty loop or zero duration gives silence of the right length', () => {
    expect(fitMusic(new Float32Array(0), 100, SR)).toEqual(new Float32Array(2400));
    expect(fitMusic(loop, 0, SR).length).toBe(0);
  });
});
