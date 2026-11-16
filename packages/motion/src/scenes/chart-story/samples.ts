import fc from 'fast-check';
import type { SceneScore } from '../define';
import { chartStoryExemplars } from './exemplars';
import { formatCount } from '../../core/count';
import {
  CHART_MAX_ITEMS,
  CHART_MAX_VALUE,
  CHART_MAX_VALUE_CHARS,
  type ChartStoryContent,
} from './index';

type Score = SceneScore<ChartStoryContent>;

const word = fc.constantFrom(
  'Europe',
  'Asia',
  'rent',
  'food',
  'users',
  'growth',
  'per',
  'month',
  'phones',
  'total',
  'new',
  'the',
);
const phrase = (minWords: number, maxWords: number, maxLength: number) =>
  fc
    .array(word, { minLength: minWords, maxLength: maxWords })
    .map((ws) => ws.join(' ').slice(0, maxLength).trim())
    .filter((s) => s.length > 0);
const label = fc.oneof(
  fc.integer({ min: 1990, max: 2030 }).map(String),
  phrase(1, 3, 16),
  fc.constantFrom('North America', 'Q1 2024', 'Rest of world'),
);

const score = (variant: string, content: ChartStoryContent): Score => ({
  variant,
  content,
  beats: [],
  images: [],
});

const value = fc.oneof(
  fc.integer({ min: 0, max: CHART_MAX_VALUE }),
  fc.integer({ min: 0, max: 100 }),
  fc.double({ min: 0, max: 1000, noNaN: true }).map((v) => Math.round(v * 100) / 100),
  fc.constant(0),
);

/** Random valid scores for motion:check and the tests (seeded by the caller). */
export const arbitrary: fc.Arbitrary<Score> = fc
  .record({
    variant: fc.constantFrom('bars', 'rows', 'line'),
    items: fc.array(fc.record({ label, value }), { minLength: 2, maxLength: CHART_MAX_ITEMS }),
    prefix: fc.option(fc.constantFrom('$', '€', '£', '+'), { nil: undefined }),
    suffix: fc.option(fc.constantFrom('%', 'M', 'k', 'bn', 'x'), { nil: undefined }),
    decimals: fc.integer({ min: 0, max: 2 }),
    title: fc.option(phrase(1, 7, 48), { nil: undefined }),
    takeaway: fc.option(phrase(1, 8, 60), { nil: undefined }),
    highlight: fc.option(fc.integer({ min: 0, max: CHART_MAX_ITEMS - 1 }), { nil: undefined }),
  })
  .map(({ variant, items, highlight, ...rest }) => {
    // The schema needs one value above zero and a highlight that indexes an item.
    const fixed = items.some((i) => i.value > 0)
      ? items
      : items.map((i, k) => (k === 0 ? { ...i, value: 1 } : i));
    const values = fixed.map((i) => i.value);
    // Value labels stay within the schema's length: fewer decimals, then no suffix, then no prefix.
    const fmt = { ...rest };
    const tooLong = () => values.some((v) => formatCount(v, fmt).length > CHART_MAX_VALUE_CHARS);
    while (tooLong() && fmt.decimals > 0) fmt.decimals--;
    if (tooLong()) fmt.suffix = undefined;
    if (tooLong()) fmt.prefix = undefined;
    const content = Object.fromEntries(
      Object.entries({
        ...fmt,
        labels: fixed.map((i) => i.label),
        values,
        highlight: highlight !== undefined && highlight < fixed.length ? highlight : undefined,
      }).filter(([, v]) => v !== undefined),
    ) as ChartStoryContent;
    return score(variant, content);
  });

/** The longest content the schema allows: 6 values, 3-word labels, wide values, both lines. */
const LONG: ChartStoryContent = {
  title: 'The longest chart title allowed here ok',
  labels: [
    'North America',
    'Rest of world',
    'Q1 of 2024',
    'Europe and Asia',
    'Internationally',
    'Everyone else ok',
  ],
  values: [99_999, 51_234, 88_000, 0, 77_777, 1],
  // "$99,999k": the longest value label the schema allows.
  prefix: '$',
  suffix: 'k',
  decimals: 0,
  takeaway: 'The longest takeaway the chart allows here ok',
};
const SHOW: ChartStoryContent = {
  title: 'Average monthly rent',
  labels: ['2010', '2015', '2020', 'Today'],
  values: [900, 1150, 1600, 2100],
  prefix: '$',
  decimals: 0,
  takeaway: 'More than double in fifteen years',
};
const SHARES: ChartStoryContent = {
  title: 'Where people shop',
  labels: ['Online', 'Big stores', 'Local shops', 'Markets'],
  values: [46, 31, 15, 8],
  suffix: '%',
  decimals: 0,
  highlight: 0,
};
const TWO: ChartStoryContent = {
  labels: ['Before', 'After'],
  values: [10, 40],
  suffix: '%',
  decimals: 0,
};
const FLAT: ChartStoryContent = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  values: [5, 0, 5, 5, 0, 5],
  decimals: 0,
};

/** Edge cases every run checks at min, ideal and max durations and early/default/late key moments. */
export const edgeCases: Record<string, Score> = {
  'bars-long': score('bars', LONG),
  'rows-long': score('rows', LONG),
  'line-long': score('line', LONG),
  'bars-two': score('bars', TWO),
  'line-two': score('line', TWO),
  'rows-flat': score('rows', FLAT),
  'line-flat': score('line', FLAT),
  'show-bars': score('bars', SHOW),
  'show-rows': score('rows', SHARES),
  'show-line': score('line', SHOW),
  'show-bars-six': score('bars', {
    title: 'Phones sold by region',
    labels: ['Asia', 'Europe', 'North America', 'South America', 'Africa', 'Oceania'],
    values: [42, 30, 18, 12, 9, 4],
    suffix: 'M',
    decimals: 0,
    takeaway: 'Asia sells more than the next two',
  }),
  // The example library doubles as motion:check samples (spec 07 R9.3).
  ...Object.fromEntries(chartStoryExemplars.map((e) => [`ex-${e.id}`, { ...e.score, beats: [] }])),
};
