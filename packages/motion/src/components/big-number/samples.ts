import fc from 'fast-check';
import type { BigNumberParams } from './params';

const word = fc.constantFrom(
  'Revenue',
  'growth',
  'since',
  'users',
  'per',
  'month',
  'market',
  'share',
  'in',
  'Europe',
  'average',
  'cost',
  'of',
  'living',
  'new',
  'jobs',
);
const phrase = (minWords: number, maxWords: number, maxLength: number) =>
  fc
    .array(word, { minLength: minWords, maxLength: maxWords })
    .map((ws) => ws.join(' ').slice(0, maxLength).trim())
    .filter((s) => s.length > 0);

/** Random valid params for motion:check (fast-check, seeded by the check script). */
export const arbitrary: fc.Arbitrary<BigNumberParams> = fc.record({
  value: fc.oneof(
    fc.integer({ min: -999, max: 999_999 }),
    fc.double({ min: -1000, max: 100_000, noNaN: true }).map((v) => Math.round(v * 100) / 100),
  ),
  prefix: fc.option(fc.constantFrom('$', '€', '£', '+'), { nil: undefined }),
  suffix: fc.option(fc.constantFrom('%', 'M', 'k', 'bn', 'x'), { nil: undefined }),
  decimals: fc.integer({ min: 0, max: 2 }),
  label: phrase(1, 6, 48),
  context: fc.option(phrase(1, 5, 60), { nil: undefined }),
  countFrom: fc.constant(0),
});

/** Edge cases every run checks at min, ideal and max durations and early/default/late key moments. */
export const edgeCases: Record<string, BigNumberParams> = {
  'max-label': {
    value: 12,
    decimals: 0,
    countFrom: 0,
    label: 'The longest label allowed fills up this line ok',
    context: 'An eyebrow line that is exactly as long as the schema allows',
  },
  'long-word': {
    value: 7,
    decimals: 0,
    countFrom: 0,
    label: 'Unternehmenssteuerreformgesetz',
    context: 'Donaudampfschifffahrtsgesellschaft',
  },
  'nine-digits-decimals': {
    value: 987_654_321.99,
    prefix: '$',
    suffix: 'bn',
    decimals: 2,
    countFrom: 0,
    label: 'Nine digits with decimals',
  },
  'nine-digits': { value: 123_456_789, decimals: 0, countFrom: 0, label: 'Nine digits' },
  zero: { value: 0, decimals: 0, countFrom: 0, label: 'Nothing changed' },
  negative: {
    value: -42.5,
    suffix: '%',
    decimals: 1,
    countFrom: 0,
    label: 'Drop in a single quarter',
  },
  'non-latin': {
    value: 3,
    suffix: 'x',
    decimals: 0,
    countFrom: 0,
    label: 'Ünïcödé çåfé ñandú — 東京 増加',
    context: 'Ελληνικά και русский',
  },
  'no-context': {
    value: 40,
    suffix: '%',
    decimals: 0,
    countFrom: 0,
    label: 'Revenue growth since 2020',
  },
};
