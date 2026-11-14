import fc from 'fast-check';
import { EaseNameSchema } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { eases } from './ease';
import { EXIT_RATIO, OVERLAP_MS, sequence, track, type Key } from './timeline';

const easeName = fc.constantFrom(...EaseNameSchema.options);
const keysArb = fc
  .uniqueArray(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 8 })
  .chain((ts) =>
    fc.tuple(
      ...ts.map((t) =>
        fc.record({
          t: fc.constant(t),
          v: fc.integer({ min: -1000, max: 1000 }),
          ease: fc.option(easeName, { nil: undefined }),
        }),
      ),
    ),
  )
  .map((ks) => ks as Key[]);

describe('core eases vs schema', () => {
  it('Object.keys(eases) equals EaseNameSchema.options', () => {
    expect(Object.keys(eases)).toEqual([...EaseNameSchema.options]);
  });
});

describe('constants', () => {
  it('match the design', () => {
    expect(OVERLAP_MS).toBe(200);
    expect(EXIT_RATIO).toBe(0.6);
  });
});

describe('track', () => {
  it('throws without keys', () => {
    expect(() => track([])).toThrow();
  });

  it('hits every key value exactly and holds outside the range', () => {
    fc.assert(
      fc.property(keysArb, (keys) => {
        const f = track(keys);
        const sorted = [...keys].sort((a, b) => a.t - b.t);
        const first = sorted[0]!;
        const last = sorted[sorted.length - 1]!;
        return (
          sorted.every((k) => f(k.t) === k.v) &&
          f(first.t - 500) === first.v &&
          f(last.t + 500) === last.v
        );
      }),
    );
  });

  it('is deterministic: same t twice and random order equal sequential', () => {
    fc.assert(
      fc.property(
        keysArb,
        fc.array(fc.integer({ min: -100, max: 11_000 }), { maxLength: 30 }),
        (keys, ts) => {
          const f = track(keys);
          const g = track(keys);
          const sequential = ts.map((t) => g(t));
          const shuffled = [...ts]
            .reverse()
            .map((t) => f(t))
            .reverse();
          return sequential.every((v, i) => v === shuffled[i] && f(ts[i]!) === f(ts[i]!));
        },
      ),
    );
  });

  it('stays within the key value range for in-range easing', () => {
    fc.assert(
      fc.property(keysArb, fc.integer({ min: -100, max: 11_000 }), (keys, t) => {
        const vs = keys.map((k) => k.v);
        const v = track(keys)(t);
        return v >= Math.min(...vs) - 1e-9 && v <= Math.max(...vs) + 1e-9;
      }),
    );
  });

  it('applies the segment start key ease', () => {
    const f = track([
      { t: 0, v: 0, ease: 'outCubic' },
      { t: 100, v: 10 },
    ]);
    expect(f(50)).toBeCloseTo(10 * eases.outCubic(0.5), 12);
  });

  it('interpolates linearly by default', () => {
    expect(
      track([
        { t: 0, v: 0 },
        { t: 100, v: 10 },
      ])(25),
    ).toBe(2.5);
  });
});

describe('sequence', () => {
  it('evaluates each track at t - at', () => {
    fc.assert(
      fc.property(
        keysArb,
        fc.integer({ min: 0, max: 2000 }),
        fc.integer({ min: -500, max: 12_000 }),
        (keys, at, t) => {
          const tr = track(keys);
          const out = sequence([
            { at: 0, track: tr },
            { at, track: tr },
          ])(t);
          return out.length === 2 && out[0] === tr(t) && out[1] === tr(t - at);
        },
      ),
    );
  });
});
