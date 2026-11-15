import type { Exemplar } from '../exemplar';
import type { VersusContent } from './index';

/**
 * Hand-approved versus fills, 2 per variant (spec 07 R9.3). Written and reviewed in a Kiro CLI
 * run (task 23). Every name, detail and verdict uses only words the narration says.
 */
export const versusExemplars: Exemplar<VersusContent>[] = [
  {
    id: 'rent-or-buy',
    kind: 'comparison',
    text: 'Renting gives you flexibility, buying builds equity, and after ten years buying usually comes out ahead.',
    score: {
      variant: 'split',
      content: {
        left: 'Renting',
        leftDetail: 'Flexibility',
        right: 'Buying',
        rightDetail: 'Builds equity',
        verdict: 'After ten years, buying comes out ahead',
        winner: 'right',
      },
      beats: [
        { cue: 'left', word: 0 },
        { cue: 'right', word: 4 },
        { cue: 'divider', word: 7 },
        { cue: 'verdict', word: 8 },
      ],
      images: [],
    },
  },
  {
    id: 'cats-or-dogs',
    kind: 'comparison',
    text: 'Cats or dogs? Dogs need walks every day, cats mostly look after themselves.',
    score: {
      variant: 'split',
      content: {
        left: 'Cats',
        leftDetail: 'Mostly look after themselves',
        right: 'Dogs',
        rightDetail: 'Need walks every day',
      },
      beats: [
        { cue: 'left', word: 0 },
        { cue: 'right', word: 2 },
        { cue: 'divider', word: 3 },
      ],
      images: [],
    },
  },
  {
    id: 'speed-versus-safety',
    kind: 'comparison',
    text: 'It comes down to speed versus safety, and this time safety wins.',
    score: {
      variant: 'face-off',
      content: {
        left: 'Speed',
        right: 'Safety',
        verdict: 'This time, safety wins',
        winner: 'right',
      },
      beats: [
        { cue: 'left', word: 4 },
        { cue: 'right', word: 6 },
        { cue: 'divider', word: 7 },
        { cue: 'verdict', word: 8 },
      ],
      images: [],
    },
  },
  {
    id: 'old-way-new-way',
    kind: 'comparison',
    text: 'The old way against the new way: the old way still sells more.',
    score: {
      variant: 'face-off',
      content: {
        left: 'The old way',
        right: 'The new way',
        verdict: 'The old way still sells more',
        winner: 'left',
      },
      beats: [
        { cue: 'left', word: 1 },
        { cue: 'right', word: 5 },
        { cue: 'verdict', word: 7 },
      ],
      images: [],
    },
  },
  {
    id: 'electric-or-petrol',
    kind: 'comparison',
    text: "Electric cars cost more upfront, petrol cars cost more to run, so over the car's life electric is cheaper.",
    score: {
      variant: 'ledger',
      content: {
        left: 'Electric cars',
        leftDetail: 'Cost more upfront',
        right: 'Petrol cars',
        rightDetail: 'Cost more to run',
        verdict: "Over the car's life, electric is cheaper",
        winner: 'left',
      },
      beats: [
        { cue: 'left', word: 0 },
        { cue: 'right', word: 5 },
        { cue: 'divider', word: 11 },
        { cue: 'verdict', word: 12 },
      ],
      images: [],
    },
  },
  {
    id: 'night-or-morning',
    kind: 'comparison',
    text: 'Studying at night versus in the morning: mornings help you remember more, nights feel easier to start.',
    score: {
      variant: 'ledger',
      content: {
        left: 'Studying at night',
        leftDetail: 'Easier to start',
        right: 'In the morning',
        rightDetail: 'Help you remember more',
        winner: 'right',
      },
      beats: [
        { cue: 'left', word: 0 },
        { cue: 'right', word: 4 },
        { cue: 'verdict', word: 7 },
      ],
      images: [],
    },
  },
];
