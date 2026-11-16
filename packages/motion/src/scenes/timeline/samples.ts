import fc from 'fast-check';
import type { SceneScore } from '../define';
import { timelineExemplars } from './exemplars';
import { TIMELINE_MAX, TIMELINE_MIN, type TimelineContent } from './index';

type Score = SceneScore<TimelineContent>;

const word = fc.constantFrom(
  'the',
  'bank',
  'opened',
  'first',
  'store',
  'moved',
  'online',
  'sold',
  'shares',
  'new',
  'city',
  'grew',
);
const phrase = (minWords: number, maxWords: number, maxLength: number) =>
  fc
    .array(word, { minLength: minWords, maxLength: maxWords })
    .map((ws) => ws.join(' ').slice(0, maxLength).trim())
    .filter((s) => s.length > 0);
const date = fc.oneof(
  fc.integer({ min: 1800, max: 2030 }).map(String),
  fc.constantFrom('March 2020', 'Day one', 'Q3 of 2024', 'Spring', 'Week two'),
);

const score = (variant: string, content: TimelineContent): Score => ({
  variant,
  content,
  beats: [],
  images: [],
});

/** Random valid scores for motion:check and the tests (seeded by the caller). */
export const arbitrary: fc.Arbitrary<Score> = fc
  .record({
    variant: fc.constantFrom('track', 'steps', 'zigzag'),
    rows: fc.array(fc.record({ date, event: phrase(1, 6, 48) }), {
      minLength: TIMELINE_MIN,
      maxLength: TIMELINE_MAX,
    }),
    title: fc.option(phrase(1, 7, 48), { nil: undefined }),
    highlight: fc.option(fc.integer({ min: 0, max: TIMELINE_MAX - 1 }), { nil: undefined }),
  })
  .map(({ variant, rows, title, highlight }) =>
    score(variant, {
      dates: rows.map((r) => r.date),
      events: rows.map((r) => r.event),
      ...(title ? { title } : {}),
      ...(highlight !== undefined && highlight < rows.length ? { highlight } : {}),
    }),
  );

/** The longest content the schema allows: 6 rows, 3-word dates, 6-word events, a 7-word title. */
const LONG: TimelineContent = {
  title: 'The longest timeline title allowed here',
  dates: ['Q3 of 2024', 'March 2020', 'Week two', 'Day one', '1969', 'Q1 of 2025'],
  events: [
    'Internationalisation of every single team',
    'Six words in this event here',
    'Another event with six words now',
    'The fourth event is six words',
    'And the fifth has six words',
    'The last one also has six',
  ],
  highlight: 5,
};
const SHOW: TimelineContent = {
  title: 'How the first flights went',
  dates: ['1903', '1927', '1969'],
  events: ['First powered flight', 'First solo across the ocean', 'People walk on the moon'],
  highlight: 2,
};
const FIVE: TimelineContent = {
  title: 'A century of rail',
  dates: ['1890', '1930', '1960', '1995', '2019'],
  events: [
    'The first line opened',
    'The network doubled',
    'Went electric',
    'Night trains began',
    'Went driverless',
  ],
  highlight: 4,
};

/** Edge cases every run checks at min, ideal and max durations and early/default/late key moments. */
export const edgeCases: Record<string, Score> = {
  'track-long': score('track', LONG),
  'steps-long': score('steps', LONG),
  'zigzag-long': score('zigzag', LONG),
  'show-track': score('track', SHOW),
  'show-steps': score('steps', SHOW),
  'show-zigzag': score('zigzag', SHOW),
  'show-track-five': score('track', FIVE),
  'show-zigzag-five': score('zigzag', FIVE),
  // The example library doubles as motion:check samples (spec 07 R9.3).
  ...Object.fromEntries(timelineExemplars.map((e) => [`ex-${e.id}`, { ...e.score, beats: [] }])),
};
