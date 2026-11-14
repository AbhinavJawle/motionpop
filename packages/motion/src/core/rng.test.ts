import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hashString, mulberry32, rngFor } from './rng';

describe('hashString', () => {
  it('matches FNV-1a reference vectors', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('foobar')).toBe(0xbf9cf968);
  });

  it('is a uint32', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const h = hashString(s);
        return Number.isInteger(h) && h >= 0 && h <= 0xffffffff;
      }),
    );
  });
});

describe('mulberry32', () => {
  it('yields floats in [0, 1)', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const r = mulberry32(seed);
        for (let i = 0; i < 50; i++) {
          const x = r();
          if (!(x >= 0 && x < 1)) return false;
        }
        return true;
      }),
    );
  });

  it('is deterministic per seed', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const a = mulberry32(seed);
        const b = mulberry32(seed);
        return Array.from({ length: 20 }, () => a() === b()).every(Boolean);
      }),
    );
  });

  it('coerces the seed with >>> 0', () => {
    expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)());
    expect(mulberry32(2 ** 32 + 5)()).toBe(mulberry32(5)());
  });

  it('matches the pinned golden sequence for seed 1', () => {
    const r = mulberry32(1);
    expect([r(), r(), r()]).toEqual(GOLDEN_MULBERRY_1);
  });
});

describe('rngFor', () => {
  it('is deterministic and key-dependent', () => {
    const a = rngFor(42, 'bars');
    const b = rngFor(42, 'bars');
    expect([a(), a()]).toEqual([b(), b()]);
    expect(rngFor(42, 'bars')()).not.toBe(rngFor(42, 'dots')());
  });

  it('equals mulberry32 of the xor-ed seed', () => {
    fc.assert(
      fc.property(fc.integer(), fc.string(), (seed, key) => {
        return rngFor(seed, key)() === mulberry32((seed ^ hashString(key)) >>> 0)();
      }),
    );
  });

  it('matches pinned golden values', () => {
    const r = rngFor(12345, 'slot-1');
    expect([r(), r(), r()]).toEqual(GOLDEN_RNG_FOR);
  });
});

// Golden values computed once from this implementation and pinned.
const GOLDEN_MULBERRY_1: number[] = [0.6270739405881613, 0.002735721180215478, 0.5274470399599522];
const GOLDEN_RNG_FOR: number[] = [0.9590007541701198, 0.44968839501962066, 0.24760832986794412];
