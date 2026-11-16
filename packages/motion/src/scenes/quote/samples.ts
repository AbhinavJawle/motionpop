import fc from 'fast-check';
import type { SceneScore } from '../define';
import { quoteExemplars } from './exemplars';
import type { QuoteContent } from './index';

type Score = SceneScore<QuoteContent>;

const word = fc.constantFrom(
  'we',
  'sell',
  'time',
  'not',
  'software',
  'the',
  'quiet',
  'hours',
  'are',
  'hardest',
  'ship',
  'small',
  'often',
);
const phrase = (minWords: number, maxWords: number, maxLength: number) =>
  fc
    .array(word, { minLength: minWords, maxLength: maxWords })
    .map((ws) => ws.join(' ').slice(0, maxLength).trim())
    .filter((s) => s.length > 0);

const score = (variant: string, content: QuoteContent): Score => ({
  variant,
  content,
  beats: [],
  images: [],
});

/** Random valid scores for motion:check and the tests (seeded by the caller). */
export const arbitrary: fc.Arbitrary<Score> = fc
  .record({
    variant: fc.constantFrom('center', 'card', 'left'),
    quote: phrase(1, 24, 140),
    attribution: fc.option(phrase(1, 6, 48), { nil: undefined }),
    pick: fc.nat(30),
  })
  .map(({ variant, quote, attribution, pick }) => {
    // Emphasis, when there is one, is a word of the quote.
    const words = quote.split(' ');
    const emphasis = pick < words.length ? words[pick] : undefined;
    return score(variant, {
      quote,
      ...(attribution ? { attribution } : {}),
      ...(emphasis ? { emphasis } : {}),
    });
  });

/** The longest content the schema allows: a 24-word quote and a 6-word attribution. */
const LONG: QuoteContent = {
  quote:
    'Internationalisation is hard, and every one of us learned that the slow way, one market after another, until it finally started to feel easy',
  attribution: 'A product lead in Lisbon',
  emphasis: 'the slow way',
};
const SHOW: QuoteContent = {
  quote: 'The quiet hours are the hardest ones',
  attribution: 'A night nurse',
  emphasis: 'hardest',
};
const SHORT: QuoteContent = { quote: 'Never again' };

/** Edge cases every run checks at min, ideal and max durations and early/default/late key moments. */
export const edgeCases: Record<string, Score> = {
  'center-long': score('center', LONG),
  'card-long': score('card', LONG),
  'left-long': score('left', LONG),
  'center-short': score('center', SHORT),
  'card-short': score('card', SHORT),
  'show-center': score('center', SHOW),
  'show-card': score('card', SHOW),
  'show-left': score('left', SHOW),
  'show-card-long': score('card', LONG),
  // The example library doubles as motion:check samples (spec 07 R9.3).
  ...Object.fromEntries(quoteExemplars.map((e) => [`ex-${e.id}`, { ...e.score, beats: [] }])),
};
