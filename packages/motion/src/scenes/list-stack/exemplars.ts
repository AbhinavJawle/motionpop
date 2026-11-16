import type { Exemplar } from '../exemplar';
import type { ListStackContent } from './index';

/**
 * Hand-approved list-stack fills, 2 per variant (spec 07 R9.3). Original content, written and
 * reviewed in the Kiro IDE. Every item is spoken words, and its cue lands on its first word.
 */
export const listStackExemplars: Exemplar<ListStackContent>[] = [
  {
    id: 'saving-rules',
    kind: 'list',
    text: 'There are three rules: pay yourself first, automate every transfer, and never touch the buffer.',
    score: {
      variant: 'numbered',
      content: {
        title: 'Three rules',
        items: ['Pay yourself first', 'Automate every transfer', 'Never touch the buffer'],
      },
      beats: [
        { cue: 'title', word: 2 },
        { cue: 'i1', word: 4 },
        { cue: 'i2', word: 7 },
        { cue: 'i3', word: 11 },
      ],
      images: [],
    },
  },
  {
    id: 'launch-steps',
    kind: 'list',
    text: 'First, write the plan. Second, test it with ten users. Third, ship it on Monday.',
    score: {
      variant: 'numbered',
      content: {
        items: ['Write the plan', 'Test it with ten users', 'Ship it on Monday'],
        highlight: 2,
      },
      beats: [
        { cue: 'i1', word: 1 },
        { cue: 'i2', word: 5 },
        { cue: 'i3', word: 11 },
      ],
      images: [],
    },
  },
  {
    id: 'pantry-basics',
    kind: 'list',
    text: 'Every pantry needs rice, beans, olive oil and salt.',
    score: {
      variant: 'cards',
      content: { title: 'Every pantry needs', items: ['Rice', 'Beans', 'Olive oil', 'Salt'] },
      beats: [
        { cue: 'title', word: 0 },
        { cue: 'i1', word: 3 },
        { cue: 'i2', word: 4 },
        { cue: 'i3', word: 5 },
        { cue: 'i4', word: 8 },
      ],
      images: [],
    },
  },
  {
    id: 'habit-loop',
    kind: 'list',
    text: 'Every habit has a cue, a routine and a reward.',
    score: {
      variant: 'cards',
      content: {
        title: 'Every habit has',
        items: ['A cue', 'A routine', 'A reward'],
        highlight: 2,
      },
      beats: [
        { cue: 'title', word: 0 },
        { cue: 'i1', word: 3 },
        { cue: 'i2', word: 5 },
        { cue: 'i3', word: 8 },
      ],
      images: [],
    },
  },
  {
    id: 'remote-wins',
    kind: 'list',
    text: 'Remote teams report fewer meetings, longer focus time, no daily commute and more flexible hours.',
    score: {
      variant: 'bullets',
      content: {
        title: 'Remote teams report',
        items: ['Fewer meetings', 'Longer focus time', 'No daily commute', 'More flexible hours'],
      },
      beats: [
        { cue: 'title', word: 0 },
        { cue: 'i1', word: 3 },
        { cue: 'i2', word: 5 },
        { cue: 'i3', word: 8 },
        { cue: 'i4', word: 12 },
      ],
      images: [],
    },
  },
  {
    id: 'sleep-tips',
    kind: 'list',
    text: 'To sleep better, keep the room cool, put the phone away, and wake up at the same time.',
    score: {
      variant: 'bullets',
      content: {
        title: 'To sleep better',
        items: ['Keep the room cool', 'Put the phone away', 'Wake up at the same time'],
      },
      beats: [
        { cue: 'title', word: 0 },
        { cue: 'i1', word: 3 },
        { cue: 'i2', word: 7 },
        { cue: 'i3', word: 12 },
      ],
      images: [],
    },
  },
];
