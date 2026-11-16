import type { SlotTiming } from '@motionpop/schemas';
import fc from 'fast-check';
import type { SceneScore } from '../define';
import { mapZoomExemplars } from './exemplars';
import type { MapZoomContent } from './index';

type Score = SceneScore<MapZoomContent>;

const score = (variant: string, content: MapZoomContent): Score => ({
  variant,
  content,
  beats: [],
  images: [],
});

const PLACES = [
  'Japan',
  'Brazil',
  'United States',
  'Russia',
  'New Zealand',
  'Chile',
  'Norway',
  'Indonesia',
  'Belgium',
  'Tokyo',
  'Lagos',
  'Paris',
  'Singapore',
  'Europe',
  'Africa',
  'Middle East',
  'Atlantis',
];
const word = fc.constantFrom(
  'Where',
  'it',
  'all',
  'started',
  'the',
  'market',
  'peaked',
  'in',
  '1989',
  'growth',
);
const phrase = (min: number, max: number, len: number) =>
  fc
    .array(word, { minLength: min, maxLength: max })
    .map((ws) => ws.join(' ').slice(0, len).trim())
    .filter((s) => s.length > 0);

/** Random valid scores for motion:check (seeded by the check script). */
export const arbitrary: fc.Arbitrary<Score> = fc
  .record({
    variant: fc.constantFrom('zoom', 'pin', 'spotlight'),
    place: fc.constantFrom(...PLACES),
    note: fc.option(phrase(1, 8, 48), { nil: undefined }),
    context: fc.option(phrase(1, 3, 32), { nil: undefined }),
  })
  .map(({ variant, place, note, context }) =>
    score(variant, {
      place,
      label: place,
      ...(note ? { note } : {}),
      ...(context ? { context } : {}),
    }),
  );

const LONG: MapZoomContent = {
  place: 'Central African Republic',
  label: 'Central African Republic',
  note: 'The longest note allowed sits right here ok',
  context: 'A context line this long ok',
};

/** Edge cases every run checks at min, ideal and max durations and early/default/late key moments. */
export const edgeCases: Record<string, Score> = {
  'zoom-long': score('zoom', LONG),
  'pin-long': score('pin', LONG),
  'spotlight-long': score('spotlight', LONG),
  'zoom-russia': score('zoom', { place: 'Russia', label: 'Russia' }),
  'zoom-us': score('zoom', { place: 'US', label: 'United States', note: 'Contiguous states' }),
  'zoom-nz': score('zoom', { place: 'New Zealand', label: 'New Zealand' }),
  'pin-unknown': score('pin', { place: 'Atlantis', label: 'Atlantis' }),
  'show-japan': score('zoom', { place: 'Japan', label: 'Japan', note: 'Peaked in 1989' }),
  'show-tokyo': score('pin', { place: 'Tokyo', label: 'Tokyo', context: 'Where it started' }),
  'show-europe': score('spotlight', { place: 'Europe', label: 'Europe', note: 'Prices doubled' }),
  ...Object.fromEntries(mapZoomExemplars.map((e) => [`ex-${e.id}`, { ...e.score, beats: [] }])),
};

/** Slot timing cases (spec 09 task 8): slower, faster and cut. */
export const timingCases: Record<string, { params: Score; timing: SlotTiming }> = {
  'show-slow': { params: edgeCases['show-japan'] as Score, timing: { speed: 0.8 } },
  'show-fast': { params: edgeCases['show-japan'] as Score, timing: { speed: 1.8, ease: 'out' } },
  'show-cut': { params: edgeCases['show-japan'] as Score, timing: { fade: false } },
};
