import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { frameToMs, FPS, ms, msToFrame } from './time';

describe('time helpers', () => {
  it('uses 30 fps', () => {
    expect(FPS).toBe(30);
    expect(msToFrame(1000)).toBe(30);
    expect(frameToMs(30)).toBe(1000);
  });

  it('round-trips frames: msToFrame(frameToMs(f)) === f for 0..10^6', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (f) => {
        expect(msToFrame(frameToMs(f))).toBe(f);
      }),
    );
  });

  it('round-trips ms within one frame', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (t) => {
        expect(Math.abs(frameToMs(msToFrame(t)) - t)).toBeLessThanOrEqual(Math.ceil(1000 / FPS));
      }),
    );
  });

  it('always returns integers', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (t) => {
        expect(Number.isInteger(msToFrame(t))).toBe(true);
        expect(Number.isInteger(frameToMs(t))).toBe(true);
      }),
    );
  });

  it('ms() rejects floats and negatives', () => {
    expect(() => ms(1.5)).toThrow();
    expect(() => ms(-1)).toThrow();
    expect(ms(42)).toBe(42);
  });
});
