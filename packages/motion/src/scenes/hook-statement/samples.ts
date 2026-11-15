import fc from 'fast-check';
import { hookStatementExemplars } from './exemplars';
import type { SceneScore } from '../define';
import type { HookStatementContent } from './index';

type Score = SceneScore<HookStatementContent>;

const word = fc.constantFrom(
  'Nobody',
  'tells',
  'you',
  'why',
  'prices',
  'keep',
  'rising',
  'this',
  'changes',
  'everything',
  'about',
  'money',
  'internationalisation',
  'a',
);
const phrase = (minWords: number, maxWords: number, maxLength: number) =>
  fc
    .array(word, { minLength: minWords, maxLength: maxWords })
    .map((ws) => ws.join(' ').slice(0, maxLength).trim())
    .filter((s) => s.length > 0);

const score = (variant: string, content: HookStatementContent): Score => ({
  variant,
  content,
  beats: [],
  images: [],
});

/** Random valid scores for motion:check (seeded by the check script). */
export const arbitrary: fc.Arbitrary<Score> = fc
  .record({
    variant: fc.constantFrom('center', 'left', 'punch'),
    line: phrase(1, 14, 90),
    pick: fc.nat(13),
    eyebrow: fc.option(phrase(1, 3, 32), { nil: undefined }),
    subline: fc.option(phrase(1, 8, 60), { nil: undefined }),
  })
  .map(({ variant, line, pick, eyebrow, subline }) => {
    const words = line.split(' ');
    const emphasis = words[pick % words.length];
    return score(variant, {
      line,
      ...(emphasis ? { emphasis } : {}),
      ...(eyebrow ? { eyebrow } : {}),
      ...(subline ? { subline } : {}),
    });
  });

const LONG: HookStatementContent = {
  eyebrow: 'Chapter two the long one',
  line: 'This is the longest hook line we allow and it has fourteen words total',
  emphasis: 'fourteen words',
  subline: 'And a subline that uses all eight words',
};
const SHOW: HookStatementContent = {
  eyebrow: 'The problem',
  line: 'Nobody tells you the real reason prices keep going up',
  emphasis: 'real reason',
  subline: 'It starts with one number',
};
const SHORT: HookStatementContent = { line: 'Why?', emphasis: 'Why?' };
const PUNCH: HookStatementContent = {
  line: 'And this one change made them everything',
  emphasis: 'everything',
};

/** Edge cases every run checks at min, ideal and max durations and early/default/late key moments. */
export const edgeCases: Record<string, Score> = {
  'center-long': score('center', LONG),
  'left-long': score('left', LONG),
  'punch-long': score('punch', LONG),
  'center-short': score('center', SHORT),
  'punch-first-word': score('punch', SHORT),
  'show-center': score('center', SHOW),
  'show-left': score('left', SHOW),
  'show-punch': score('punch', PUNCH),
  // A one-line hook sits at the optical centre; a line that greedy wrapping would orphan is
  // balanced (kept as stills, 2026-11-15).
  'show-oneline': score('center', { line: "Let's look at the numbers" }),
  'show-punch-subline': score('punch', {
    ...PUNCH,
    eyebrow: 'Part one',
    subline: 'And nobody saw it',
  }),
  'show-oneline-left': score('left', { eyebrow: 'Chapter three', line: "Here's what comes next" }),
  'show-balance': score('center', {
    line: 'More data does not always mean better decisions for anyone',
    subline: 'Here is why',
  }),
  // The example library doubles as motion:check samples (spec 07 R9.3).
  ...Object.fromEntries(
    hookStatementExemplars.map((e) => [`ex-${e.id}`, { ...e.score, beats: [] }]),
  ),
};
