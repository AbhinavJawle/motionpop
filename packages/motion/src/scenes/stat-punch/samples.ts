import fc from 'fast-check';
import { statPunchExemplars } from './exemplars';
import type { SceneScore } from '../define';
import type { StatPunchContent } from './index';

type Score = SceneScore<StatPunchContent>;

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
  'new',
  'jobs',
);
const phrase = (minWords: number, maxWords: number, maxLength: number) =>
  fc
    .array(word, { minLength: minWords, maxLength: maxWords })
    .map((ws) => ws.join(' ').slice(0, maxLength).trim())
    .filter((s) => s.length > 0);

const score = (variant: string, content: StatPunchContent): Score => ({
  variant,
  content,
  beats: [],
  images: [],
});

/** Random valid scores for motion:check (seeded by the check script). */
export const arbitrary: fc.Arbitrary<Score> = fc
  .record({
    variant: fc.constantFrom('stack', 'hero', 'side'),
    content: fc.record({
      value: fc.oneof(
        fc.integer({ min: -999, max: 999_999 }),
        fc.double({ min: -1000, max: 100_000, noNaN: true }).map((v) => Math.round(v * 100) / 100),
        // Rounding halves, which uniform doubles almost never hit: -0.05 at one decimal once made the
        // counter show its final value from the first frame (fixed in core/count.ts, 2026-11-15).
        fc.constantFrom(-0.05, -0.5, -2.5, 0.05, 0.5, -0.15),
      ),
      prefix: fc.option(fc.constantFrom('$', '€', '£', '+'), { nil: undefined }),
      suffix: fc.option(fc.constantFrom('%', 'M', 'k', 'bn', 'x'), { nil: undefined }),
      decimals: fc.integer({ min: 0, max: 2 }),
      label: phrase(1, 6, 48),
      context: fc.option(phrase(1, 4, 40), { nil: undefined }),
      countFrom: fc.constant(0),
    }),
  })
  .map(({ variant, content }) => score(variant, content));

const LONG: StatPunchContent = {
  value: 12,
  decimals: 0,
  countFrom: 0,
  label: 'The longest label allowed fills up this line ok',
  context: 'An eyebrow line as long as it can be ok',
};
const WIDE: StatPunchContent = {
  value: 1_234_567.89,
  prefix: '$',
  suffix: 'bn',
  decimals: 2,
  countFrom: 0,
  label: 'Total',
};

const SHOW: StatPunchContent = {
  value: 9,
  prefix: '$',
  suffix: 'bn',
  decimals: 0,
  label: 'of trade sat still every day',
  context: 'Every single day',
  countFrom: 0,
};

/** Edge cases every run checks at min, ideal and max durations and early/default/late key moments. */
export const edgeCases: Record<string, Score> = {
  'stack-long': score('stack', LONG),
  'hero-long': score('hero', LONG),
  'side-long': score('side', LONG),
  'hero-wide-number': score('hero', WIDE),
  'side-wide-number': score('side', WIDE),
  'show-stack': score('stack', SHOW),
  'show-hero': score('hero', SHOW),
  'show-side': score('side', SHOW),
  // The example library doubles as motion:check samples (spec 07 R9.3).
  ...Object.fromEntries(statPunchExemplars.map((e) => [`ex-${e.id}`, { ...e.score, beats: [] }])),
};
