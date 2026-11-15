import fc from 'fast-check';
import type { SceneScore } from '../define';
import { versusExemplars } from './exemplars';
import type { VersusContent } from './index';

type Score = SceneScore<VersusContent>;

const word = fc.constantFrom(
  'rent',
  'buy',
  'cats',
  'dogs',
  'electric',
  'petrol',
  'cars',
  'old',
  'new',
  'way',
  'speed',
  'safety',
  'wins',
  'costs',
  'more',
  'upfront',
  'a',
);
const phrase = (minWords: number, maxWords: number, maxLength: number) =>
  fc
    .array(word, { minLength: minWords, maxLength: maxWords })
    .map((ws) => ws.join(' ').slice(0, maxLength).trim())
    .filter((s) => s.length > 0);

const score = (variant: string, content: VersusContent): Score => ({
  variant,
  content,
  beats: [],
  images: [],
});

/** Random valid scores for motion:check (seeded by the check script). */
export const arbitrary: fc.Arbitrary<Score> = fc
  .record({
    variant: fc.constantFrom('split', 'face-off', 'ledger'),
    left: phrase(1, 3, 24),
    right: phrase(1, 3, 24),
    leftDetail: fc.option(phrase(1, 6, 40), { nil: undefined }),
    rightDetail: fc.option(phrase(1, 6, 40), { nil: undefined }),
    verdict: fc.option(phrase(1, 8, 60), { nil: undefined }),
    winner: fc.option(fc.constantFrom('left' as const, 'right' as const), { nil: undefined }),
  })
  .map(({ variant, ...c }) =>
    score(
      variant,
      Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as VersusContent,
    ),
  );

/** The longest content the schema allows (names 3 words or 20 letters, details 6, verdict 8). */
const LONG: VersusContent = {
  left: 'Remote first teams',
  leftDetail: 'Fewer meetings and more focused work',
  right: 'Internationalisation',
  rightDetail: 'One brand in every market worldwide',
  verdict: 'Both work but only for very different teams',
};
const SHOW: VersusContent = {
  left: 'Renting',
  leftDetail: 'Flexible, nothing to fix',
  right: 'Buying',
  rightDetail: 'Equity, but a big deposit',
  verdict: 'Over ten years, buying wins',
  winner: 'right',
};
const SHORT: VersusContent = { left: 'A', right: 'B' };

/** Edge cases every run checks at min, ideal and max durations and early/default/late key moments. */
export const edgeCases: Record<string, Score> = {
  'split-long': score('split', LONG),
  'face-off-long': score('face-off', LONG),
  'ledger-long': score('ledger', LONG),
  'split-short': score('split', SHORT),
  'ledger-short': score('ledger', SHORT),
  'show-split': score('split', SHOW),
  'show-face-off': score('face-off', SHOW),
  'show-ledger': score('ledger', SHOW),
  // Names only, then a winner with no verdict line (the verdict cue only marks it).
  'show-face-off-names': score('face-off', { left: 'Speed', right: 'Safety' }),
  'show-split-winner': score('split', {
    left: 'Cats',
    leftDetail: 'Mostly look after themselves',
    right: 'Dogs',
    rightDetail: 'Need walks every day',
    winner: 'left',
  }),
  'show-ledger-long': score('ledger', { ...LONG, winner: 'left' }),
  // The example library doubles as motion:check samples (spec 07 R9.3).
  ...Object.fromEntries(versusExemplars.map((e) => [`ex-${e.id}`, { ...e.score, beats: [] }])),
};
