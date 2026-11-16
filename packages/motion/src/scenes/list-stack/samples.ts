import fc from 'fast-check';
import type { SceneScore } from '../define';
import { listStackExemplars } from './exemplars';
import { LIST_MAX_ITEMS, LIST_MIN_ITEMS, type ListStackContent } from './index';

type Score = SceneScore<ListStackContent>;

const word = fc.constantFrom(
  'save',
  'money',
  'every',
  'month',
  'sleep',
  'early',
  'drink',
  'water',
  'plan',
  'the',
  'week',
  'ship',
  'it',
);
const phrase = (minWords: number, maxWords: number, maxLength: number) =>
  fc
    .array(word, { minLength: minWords, maxLength: maxWords })
    .map((ws) => ws.join(' ').slice(0, maxLength).trim())
    .filter((s) => s.length > 0);

const score = (variant: string, content: ListStackContent): Score => ({
  variant,
  content,
  beats: [],
  images: [],
});

/** Random valid scores for motion:check and the tests (seeded by the caller). */
export const arbitrary: fc.Arbitrary<Score> = fc
  .record({
    variant: fc.constantFrom('numbered', 'cards', 'bullets'),
    items: fc.array(phrase(1, 6, 40), { minLength: LIST_MIN_ITEMS, maxLength: LIST_MAX_ITEMS }),
    title: fc.option(phrase(1, 7, 48), { nil: undefined }),
    highlight: fc.option(fc.integer({ min: 0, max: LIST_MAX_ITEMS - 1 }), { nil: undefined }),
  })
  .map(({ variant, items, title, highlight }) =>
    score(variant, {
      items,
      ...(title ? { title } : {}),
      ...(highlight !== undefined && highlight < items.length ? { highlight } : {}),
    }),
  );

/** The longest content the schema allows: 5 items of 6 words and 40 characters, a 7-word title. */
const LONG: ListStackContent = {
  title: 'The longest list title allowed here ok',
  items: [
    'Internationalisation of every team',
    'Six words in this item here',
    'Another item with six words now',
    'The fourth item is six words',
    'And the last has six words',
  ],
};
const SHOW: ListStackContent = {
  title: 'Three rules for saving',
  items: ['Pay yourself first', 'Automate every transfer', 'Never touch the buffer'],
  highlight: 0,
};
const FIVE: ListStackContent = {
  title: 'What every pantry needs',
  items: ['Rice', 'Beans', 'Olive oil', 'Salt', 'Something sweet'],
  highlight: 4,
};
const SHORT: ListStackContent = { items: ['Cats', 'Dogs', 'Fish'] };

/** Edge cases every run checks at min, ideal and max durations and early/default/late key moments. */
export const edgeCases: Record<string, Score> = {
  'numbered-long': score('numbered', LONG),
  'cards-long': score('cards', LONG),
  'bullets-long': score('bullets', LONG),
  'cards-short': score('cards', SHORT),
  'numbered-short': score('numbered', SHORT),
  'show-numbered': score('numbered', SHOW),
  'show-cards': score('cards', SHOW),
  'show-bullets': score('bullets', SHOW),
  'show-cards-five': score('cards', FIVE),
  'show-numbered-five': score('numbered', FIVE),
  // The example library doubles as motion:check samples (spec 07 R9.3).
  ...Object.fromEntries(listStackExemplars.map((e) => [`ex-${e.id}`, { ...e.score, beats: [] }])),
};
