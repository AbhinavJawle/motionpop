import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { eases } from './ease';
import { countAt, formatCount } from './count';

const unit = fc.double({ min: 0, max: 1, noNaN: true });

describe.each(Object.entries(eases))('ease %s', (_name, e) => {
  it('maps 0 to 0 and 1 to 1', () => {
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
  });

  it('stays within [0, 1] for inputs in [0, 1]', () => {
    fc.assert(
      fc.property(unit, (x) => {
        const y = e(x);
        return y >= 0 && y <= 1;
      }),
    );
  });

  it('is monotonic non-decreasing', () => {
    fc.assert(
      fc.property(unit, unit, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return e(lo) <= e(hi);
      }),
    );
  });
});

describe('formatCount', () => {
  // Regression (found by motion:check samples, 2026-11-14): -0 rendered as "£-0%".
  it('never renders negative zero', () => {
    expect(formatCount(-0, { prefix: '£', suffix: '%' })).toBe('£0%');
    expect(formatCount(-0.001, { decimals: 2 })).toBe('0.00');
    expect(formatCount(-0.004, { decimals: 2, suffix: 'x' })).toBe('0.00x');
    expect(formatCount(-0.005, { decimals: 2 })).toBe('-0.01');
    fc.assert(
      fc.property(
        fc.double({ min: -0.004, max: 0.004, noNaN: true }),
        fc.integer({ min: 0, max: 2 }),
        (v, d) => {
          expect(formatCount(v, { decimals: d }).startsWith('-')).toBe(false);
        },
      ),
    );
  });
});

describe('countAt', () => {
  const fmtArb = fc.record({
    prefix: fc.option(fc.constantFrom('$', '€', ''), { nil: undefined }),
    suffix: fc.option(fc.constantFrom('%', 'M', 'k', ''), { nil: undefined }),
    decimals: fc.option(fc.integer({ min: 0, max: 2 }), { nil: undefined }),
  });

  it('lands exactly on formatCount(to) at and after the end of its window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
        fc.integer({ min: 0, max: 20_000 }),
        fmtArb,
        (start, dur, from, to, after, fmt) => {
          const expected = formatCount(to, fmt);
          expect(countAt(start + dur, start, dur, from, to, fmt)).toBe(expected);
          expect(countAt(start + dur + after, start, dur, from, to, fmt)).toBe(expected);
        },
      ),
    );
  });

  it('never shows the final value before the landing time (it appears on the word)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5_000 }),
        fc.integer({ min: 0, max: 4_999 }),
        fc.integer({ min: -100_000, max: 100_000 }),
        fc.integer({ min: -100_000, max: 100_000 }),
        fc.integer({ min: 0, max: 2 }),
        (dur, beforeRaw, from, to, decimals) => {
          const before = beforeRaw % dur;
          const fmt = { decimals };
          const final = formatCount(to, fmt);
          const shown = countAt(before, 0, dur, from, to, fmt);
          if (from === to) expect(shown).toBe(final);
          else expect(shown).not.toBe(final);
        },
      ),
    );
  });

  // Regression (Kiro IDE, 2026-11-15): a big-number property failed once in a full forced run.
  // A seed loop over 24,000 runs didn't hit it (fc.double rarely lands on a rounding half), so
  // the half values are generated on purpose here: negative halves at each precision made the
  // counter show the final value from its first frame.
  it('never shows the final value early for fractional and half values, either sign', () => {
    const half = fc
      .tuple(fc.integer({ min: -2000, max: 2000 }), fc.integer({ min: 0, max: 2 }))
      .map(([n, d]) => ({ to: (n + 0.5) / 10 ** d, decimals: d }));
    const any = fc
      .tuple(fc.integer({ min: -200_000, max: 200_000 }), fc.integer({ min: 0, max: 2 }))
      .map(([n, d]) => ({ to: n / 100, decimals: d }));
    fc.assert(
      fc.property(
        fc.oneof(half, any),
        fc.constantFrom(0, 0, 1, -1, 2.5),
        fc.integer({ min: 1, max: 5_000 }),
        fc.integer({ min: 0, max: 4_999 }),
        ({ to, decimals }, from, dur, beforeRaw) => {
          const fmt = { decimals };
          const final = formatCount(to, fmt);
          const shown = countAt(beforeRaw % dur, 0, dur, from, to, fmt);
          if (formatCount(from, fmt) === final) expect(shown).toBe(final);
          else expect(shown, `${from} → ${to} at ${decimals} decimals`).not.toBe(final);
          expect(countAt(dur, 0, dur, from, to, fmt)).toBe(final);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('counts -0.05 at one decimal instead of showing "-0.1" from the start (regression)', () => {
    expect(countAt(0, 0, 1000, 0, -0.05, { decimals: 1 })).toBe('0.0');
    expect(countAt(999, 0, 1000, 0, -0.05, { decimals: 1 })).toBe('0.0');
    expect(countAt(1000, 0, 1000, 0, -0.05, { decimals: 1 })).toBe('-0.1');
    expect(countAt(0, 0, 1000, 0, -0.5, { decimals: 0 })).toBe('0');
    // One unit before the final display value, not two: -2.5 shows -2 just before "-3".
    expect(countAt(999, 0, 1000, 0, -2.5, { decimals: 0 })).toBe('-2');
  });
});
