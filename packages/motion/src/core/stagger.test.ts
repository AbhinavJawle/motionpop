import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clampStep, STAGGER, STAGGER_RANGE, stagger, type StaggerKind } from './stagger';

const kinds = ['word', 'item', 'dot'] as const satisfies readonly StaggerKind[];
const from = fc.constantFrom('start' as const, 'end' as const, 'center' as const);

describe('STAGGER', () => {
  it.each(kinds)('default step for %s sits inside its range', (k) => {
    const [lo, hi] = STAGGER_RANGE[k];
    expect(STAGGER[k]).toBeGreaterThanOrEqual(lo);
    expect(STAGGER[k]).toBeLessThanOrEqual(hi);
  });
});

describe('clampStep', () => {
  it('always lands inside the range and is idempotent', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...kinds),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        (k, ms) => {
          const [lo, hi] = STAGGER_RANGE[k];
          const c = clampStep(k, ms);
          return c >= lo && c <= hi && clampStep(k, c) === c;
        },
      ),
    );
  });

  it('keeps in-range values', () => {
    expect(clampStep('word', 50)).toBe(50);
    expect(clampStep('word', 5)).toBe(30);
    expect(clampStep('dot', 500)).toBe(40);
  });
});

describe('stagger', () => {
  it('offsets stay in [0, (n - 1) * step]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 0, max: 500 }),
        from,
        fc.nat(),
        (n, step, f, k) => {
          const i = k % n;
          const o = stagger(i, n, step, f);
          return o >= 0 && o <= (n - 1) * step;
        },
      ),
    );
  });

  it('start and end are mirror images', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 200 }), (n, step) => {
        for (let i = 0; i < n; i++) {
          if (stagger(i, n, step, 'end') !== stagger(n - 1 - i, n, step, 'start')) return false;
        }
        return true;
      }),
    );
  });

  it('start is monotonic and the centre item goes first', () => {
    expect(stagger(0, 5, 50)).toBe(0);
    expect(stagger(4, 5, 50)).toBe(200);
    expect(stagger(2, 5, 50, 'center')).toBe(0);
    expect(stagger(0, 5, 50, 'center')).toBe(100);
  });
});
