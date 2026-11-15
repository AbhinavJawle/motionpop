import type { Exemplar } from '../exemplar';
import type { HookStatementContent } from './index';

/** Hand-approved hook-statement fills, 2 per variant (spec 07 R9.3). Reviewed by Claude Code. */
export const hookStatementExemplars: Exemplar<HookStatementContent>[] = [
  {
    id: 'real-reason',
    kind: 'statement',
    text: 'Nobody tells you the real reason prices keep going up.',
    score: {
      variant: 'center',
      content: {
        line: 'Nobody tells you the real reason prices keep going up',
        emphasis: 'real reason',
      },
      beats: [
        { cue: 'line', word: 0 },
        { cue: 'emphasis', word: 4 },
      ],
      images: [],
    },
  },
  {
    id: 'habit-costs',
    kind: 'number',
    text: 'This one habit quietly costs you thousands every year.',
    score: {
      variant: 'center',
      content: {
        line: 'This one habit quietly costs you thousands every year',
        emphasis: 'thousands',
      },
      beats: [
        { cue: 'line', word: 0 },
        { cue: 'emphasis', word: 6 },
      ],
      images: [],
    },
  },
  {
    id: 'island-port',
    kind: 'place',
    text: 'Chapter two. How a tiny island became the richest port on earth.',
    score: {
      variant: 'left',
      content: {
        eyebrow: 'Chapter two',
        line: 'How a tiny island became the richest port on earth',
        emphasis: 'richest port',
      },
      beats: [
        { cue: 'eyebrow', word: 0 },
        { cue: 'line', word: 2 },
        { cue: 'emphasis', word: 8 },
      ],
      images: [],
    },
  },
  {
    id: 'more-data',
    kind: 'statement',
    text: "Here's the claim most experts get wrong: more data doesn't mean better decisions.",
    score: {
      variant: 'left',
      content: {
        eyebrow: 'The claim',
        line: "More data doesn't mean better decisions",
        emphasis: 'better decisions',
        subline: 'Most experts get this wrong',
      },
      beats: [
        { cue: 'eyebrow', word: 2 },
        { cue: 'line', word: 7 },
        { cue: 'emphasis', word: 11 },
      ],
      images: [],
    },
  },
  {
    id: 'one-decision',
    kind: 'statement',
    text: 'And that one decision changed everything.',
    score: {
      variant: 'punch',
      content: { line: 'And that one decision changed everything', emphasis: 'everything' },
      beats: [
        { cue: 'line', word: 0 },
        { cue: 'emphasis', word: 5 },
      ],
      images: [],
    },
  },
  {
    id: 'a-disaster',
    kind: 'statement',
    text: 'What happened next was a disaster.',
    score: {
      variant: 'punch',
      content: { line: 'What happened next was a disaster', emphasis: 'a disaster' },
      beats: [
        { cue: 'line', word: 0 },
        { cue: 'emphasis', word: 4 },
      ],
      images: [],
    },
  },
];
