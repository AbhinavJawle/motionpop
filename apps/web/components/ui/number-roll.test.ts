import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatRoll } from './number-roll';

describe('formatRoll', () => {
  it('groups thousands and fixes decimals', () => {
    expect(formatRoll(1240)).toBe('1,240');
    expect(formatRoll(4.2, 1)).toBe('4.2');
    expect(formatRoll(1240, 0, false)).toBe('1240');
  });

  it('property: only digits and separators, so every digit maps to a roll column', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 2 }),
        (n, d) => {
          expect(formatRoll(n / 10 ** d, d)).toMatch(/^[\d,]+(\.\d+)?$/);
        },
      ),
    );
  });
});
