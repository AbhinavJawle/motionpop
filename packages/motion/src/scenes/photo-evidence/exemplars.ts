import type { Exemplar } from '../exemplar';
import type { PhotoEvidenceContent } from './index';

/**
 * Hand-written photo-evidence fills, 2 per variant (spec 07 R9.3). Original content; subjects
 * are things, places and animals, never real people. Beats index the spoken words.
 */
export const photoEvidenceExemplars: Exemplar<PhotoEvidenceContent>[] = [
  {
    id: 'shipping-container',
    kind: 'statement',
    text: 'It all started with a plain steel box that changed global trade.',
    score: {
      variant: 'caption',
      content: {
        caption: 'A plain steel box changed global trade',
        kicker: '1956',
        emphasis: 'global trade',
      },
      beats: [{ cue: 'caption', word: 5 }],
      images: [{ role: 'photo', subject: 'a weathered blue steel shipping container' }],
    },
  },
  {
    id: 'honeybee',
    kind: 'statement',
    text: 'A single honeybee visits up to five thousand flowers a day.',
    score: {
      variant: 'caption',
      content: { caption: 'One bee visits thousands of flowers a day', emphasis: 'thousands' },
      beats: [{ cue: 'caption', word: 0 }],
      images: [{ role: 'photo', subject: 'a honeybee on a yellow flower, close-up' }],
    },
  },
  {
    id: 'first-chip',
    kind: 'year',
    text: 'In 1971 a chip the size of a fingernail held the whole computer.',
    score: {
      variant: 'statement',
      content: {
        caption: 'The whole computer on one fingernail chip',
        kicker: '1971',
        emphasis: 'one fingernail',
      },
      beats: [
        { cue: 'kicker', word: 1 },
        { cue: 'caption', word: 3 },
      ],
      images: [{ role: 'photo', subject: 'a tiny vintage microprocessor chip with gold pins' }],
    },
  },
  {
    id: 'lighthouse',
    kind: 'place',
    text: 'For two hundred years this lighthouse was the only thing between sailors and the rocks.',
    score: {
      variant: 'statement',
      content: { caption: 'The only thing between sailors and the rocks', emphasis: 'the rocks' },
      beats: [{ cue: 'caption', word: 8 }],
      images: [{ role: 'photo', subject: 'an old stone lighthouse on a rocky coast' }],
    },
  },
  {
    id: 'cash-register',
    kind: 'statement',
    text: 'The cash register was invented to stop staff from stealing.',
    score: {
      variant: 'label',
      content: {
        caption: 'Invented to stop staff from stealing',
        kicker: 'Exhibit A',
        emphasis: 'stealing',
      },
      beats: [{ cue: 'caption', word: 4 }],
      images: [{ role: 'photo', subject: 'an ornate antique brass cash register' }],
    },
  },
  {
    id: 'seed-vault',
    kind: 'place',
    text: 'Deep in the Arctic, a vault keeps a backup of the world’s seeds.',
    score: {
      variant: 'label',
      content: { caption: 'A backup of the world’s seeds', kicker: 'Arctic vault' },
      beats: [
        { cue: 'kicker', word: 3 },
        { cue: 'caption', word: 7 },
      ],
      images: [{ role: 'photo', subject: 'a concrete vault entrance in a snowy mountainside' }],
    },
  },
];
