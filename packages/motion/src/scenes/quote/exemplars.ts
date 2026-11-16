import type { Exemplar } from '../exemplar';
import type { QuoteContent } from './index';

/**
 * Hand-approved quote fills, 2 per variant (spec 07 R9.3). Original content with generic
 * speakers (no real people), written and reviewed in the Kiro IDE. Each quote is spoken words
 * in order; its cue lands on its first word and the emphasis on the word that says it.
 */
export const quoteExemplars: Exemplar<QuoteContent>[] = [
  {
    id: 'first-customer',
    kind: 'statement',
    text: 'Our first customer told us, "I would pay double for this," and that changed everything.',
    score: {
      variant: 'center',
      content: {
        quote: 'I would pay double for this',
        attribution: 'Our first customer',
        emphasis: 'pay double',
      },
      beats: [
        { cue: 'quote', word: 5 },
        { cue: 'emphasis', word: 7 },
      ],
      images: [],
    },
  },
  {
    id: 'teacher-line',
    kind: 'statement',
    text: 'As one teacher put it, the best lesson is the one they finish themselves.',
    score: {
      variant: 'center',
      content: {
        quote: 'The best lesson is the one they finish themselves',
        attribution: 'One teacher',
        emphasis: 'finish themselves',
      },
      beats: [
        { cue: 'quote', word: 5 },
        { cue: 'emphasis', word: 12 },
      ],
      images: [],
    },
  },
  {
    id: 'engineer-note',
    kind: 'statement',
    text: 'The lead engineer wrote one line on the whiteboard: ship small, ship often.',
    score: {
      variant: 'card',
      content: {
        quote: 'Ship small, ship often',
        attribution: 'The lead engineer',
        emphasis: 'ship often',
      },
      beats: [
        { cue: 'quote', word: 9 },
        { cue: 'emphasis', word: 11 },
      ],
      images: [],
    },
  },
  {
    id: 'farmer-soil',
    kind: 'statement',
    text: 'A farmer we met said it best: the soil remembers everything you do to it.',
    score: {
      variant: 'card',
      content: {
        quote: 'The soil remembers everything you do to it',
        attribution: 'A farmer we met',
        emphasis: 'remembers everything',
      },
      beats: [
        { cue: 'quote', word: 7 },
        { cue: 'emphasis', word: 9 },
      ],
      images: [],
    },
  },
  {
    id: 'founder-memo',
    kind: 'statement',
    text: 'In the very first memo the founder wrote: we sell time, not software.',
    score: {
      variant: 'left',
      content: {
        quote: 'We sell time, not software',
        attribution: 'The first memo',
        emphasis: 'time',
      },
      beats: [
        { cue: 'quote', word: 8 },
        { cue: 'emphasis', word: 10 },
      ],
      images: [],
    },
  },
  {
    id: 'night-nurse',
    kind: 'statement',
    text: 'One night nurse told us: the quiet hours are the hardest ones.',
    score: {
      variant: 'left',
      content: {
        quote: 'The quiet hours are the hardest ones',
        attribution: 'A night nurse',
        emphasis: 'hardest',
      },
      beats: [
        { cue: 'quote', word: 5 },
        { cue: 'emphasis', word: 10 },
      ],
      images: [],
    },
  },
];
