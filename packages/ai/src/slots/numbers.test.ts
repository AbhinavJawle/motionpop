import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseSpokenNumber, type SpokenNumber, type SpokenUnit } from './numbers';

function num(
  value: number,
  end: number,
  unit?: SpokenUnit,
  kind: 'number' | 'year' = 'number',
): SpokenNumber {
  return unit === undefined ? { value, kind, end } : { value, unit, kind, end };
}

const split = (s: string): string[] => s.split(' ');

// [input (space-separated tokens), from, expected]
const CASES: ReadonlyArray<readonly [string, number, SpokenNumber | null]> = [
  // spec examples
  ['forty percent', 0, num(40, 2, '%')],
  ['forty-two', 0, num(42, 1)],
  ['a hundred and five', 0, num(105, 4)],
  ['two point five million dollars', 0, num(2_500_000, 5, '$')],
  ['$2.5M', 0, num(2_500_000, 1, '$')],
  ['1,200', 0, num(1200, 1)],
  ['£3bn', 0, num(3e9, 1, '£')],
  ['doubled', 0, num(2, 1, 'x')],
  ['three times', 0, num(3, 2, 'x')],
  ['twenty twenty', 0, num(2020, 2, undefined, 'year')],
  ['2020.', 0, num(2020, 1, undefined, 'year')],
  ['nineteen ninety-nine', 0, num(1999, 2, undefined, 'year')],
  ['zero', 0, num(0, 1)],
  // rejections
  ['the', 0, null],
  ['one of the', 0, null],
  ['One of them', 0, null],
  ['first', 0, null],
  ['second', 0, null],
  ['twenty-first', 0, null],
  ['two-thirds', 0, null],
  ['a', 0, null],
  ['a dog', 0, null],
  ['and five', 0, null],
  ['hundred', 0, null],
  ['million dollars', 0, null],
  ['2020s', 0, null],
  ['$', 0, null],
  ['', 0, null],
  // bounds and offsets
  ['revenue grew forty percent', 2, num(40, 4, '%')],
  ['revenue grew forty percent', 0, null],
  ['forty', 1, null],
  ['forty', -1, null],
  // digits
  ['2.5', 0, num(2.5, 1)],
  ['.5', 0, num(0.5, 1)],
  ['1,200.50', 0, num(1200.5, 1)],
  ['40%', 0, num(40, 1, '%')],
  ['40% growth', 0, num(40, 1, '%')],
  ['10k', 0, num(10_000, 1)],
  ['10x', 0, num(10, 1, 'x')],
  ['3 times', 0, num(3, 2, 'x')],
  ['$2.5m.', 0, num(2_500_000, 1, '$')],
  ['€5', 0, num(5, 1, '€')],
  ['5 billion', 0, num(5e9, 2)],
  ['$5 million', 0, num(5e6, 2, '$')],
  ['2.5 million dollars', 0, num(2_500_000, 3, '$')],
  ['10 pounds', 0, num(10, 2, '£')],
  ['3 euros', 0, num(3, 2, '€')],
  ['1,900', 0, num(1900, 1)],
  ['2020 percent', 0, num(2020, 2, '%')],
  // years as digits
  ['1999', 0, num(1999, 1, undefined, 'year')],
  ['2099,', 0, num(2099, 1, undefined, 'year')],
  ['2100', 0, num(2100, 1)],
  ['1899', 0, num(1899, 1)],
  ['in 2020 revenue', 1, num(2020, 2, undefined, 'year')],
  // spelled numbers, units and case
  ['FORTY PERCENT', 0, num(40, 2, '%')],
  ['Forty-Two.', 0, num(42, 1)],
  ['forty per cent', 0, num(40, 3, '%')],
  ['forty, percent', 0, num(40, 1)],
  ['ninety-nine percent.', 0, num(99, 2, '%')],
  ['five dollars', 0, num(5, 2, '$')],
  ['ten pounds', 0, num(10, 2, '£')],
  ['three euros', 0, num(3, 2, '€')],
  ['one percent', 0, num(1, 2, '%')],
  ['one', 0, num(1, 1)],
  ['fifteen', 0, num(15, 1)],
  ['twenty five', 0, num(25, 2)],
  ['five six', 0, num(5, 1)],
  ['one hundred and twenty-three', 0, num(123, 4)],
  ['one hundred and', 0, num(100, 2)],
  ['five hundred', 0, num(500, 2)],
  ['eleven hundred', 0, num(1100, 2)],
  ['a thousand', 0, num(1000, 2)],
  ['three million', 0, num(3e6, 2)],
  ['one hundred thousand', 0, num(100_000, 3)],
  ['zero point five', 0, num(0.5, 3)],
  ['three point one four', 0, num(3.14, 4)],
  ['two point five', 0, num(2.5, 3)],
  ['twenty and five', 0, num(20, 1)],
  // spoken years
  ['twenty twenty-four', 0, num(2024, 2, undefined, 'year')],
  ['twenty oh five', 0, num(2005, 3, undefined, 'year')],
  ['nineteen eighty', 0, num(1980, 2, undefined, 'year')],
  ['two thousand and five', 0, num(2005, 4, undefined, 'year')],
  ['two thousand', 0, num(2000, 2)],
  ['twenty, twenty', 0, num(20, 1)],
  // multipliers
  ['tripled', 0, num(3, 1, 'x')],
  ['Doubled.', 0, num(2, 1, 'x')],
  ['half', 0, num(0.5, 1)],
  ['it doubled again', 1, num(2, 2, 'x')],
];

describe('parseSpokenNumber table', () => {
  it('has at least 40 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(40);
  });

  it.each(CASES)('%j from %i', (text, from, expected) => {
    expect(parseSpokenNumber(split(text), from)).toEqual(expected);
  });
});

function withSeparators(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

describe('parseSpokenNumber properties', () => {
  it('round-trips integers below 1e9, with or without separators', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999_999_999 }), fc.boolean(), (n, sep) => {
        const text = sep ? withSeparators(n) : String(n);
        const r = parseSpokenNumber([text], 0);
        expect(r).not.toBeNull();
        expect(r?.value).toBe(n);
        expect(r?.end).toBe(1);
      }),
    );
  });

  it('round-trips decimals with at most 2 places', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999_999_999 }), fc.boolean(), (cents, sep) => {
        const value = cents / 100;
        const [int = '0', frac = '00'] = value.toFixed(2).split('.');
        const text = `${sep ? withSeparators(Number(int)) : int}.${frac}`;
        const r = parseSpokenNumber([text], 0);
        expect(r).not.toBeNull();
        expect(Math.abs((r?.value ?? NaN) - value)).toBeLessThan(1e-9);
        expect(r?.end).toBe(1);
      }),
    );
  });

  it('never throws and keeps end within range for arbitrary tokens', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 12 }), { maxLength: 6 }), (tokens) => {
        for (let i = 0; i < tokens.length; i++) {
          const r = parseSpokenNumber(tokens, i);
          if (r) {
            expect(r.end).toBeGreaterThan(i);
            expect(r.end).toBeLessThanOrEqual(tokens.length);
          }
        }
      }),
    );
  });
});
