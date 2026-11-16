import type { Exemplar } from '../exemplar';
import type { TimelineContent } from './index';

/**
 * Hand-approved timeline fills, 2 per variant (spec 07 R9.3). Original content, written and
 * reviewed in the Kiro IDE. Dates and events are spoken words; each cue lands on its date.
 */
export const timelineExemplars: Exemplar<TimelineContent>[] = [
  {
    id: 'flight-firsts',
    kind: 'year',
    text: 'In 1903 the first plane flew, in 1927 a pilot crossed the ocean alone, and in 1969 people walked on the moon.',
    score: {
      variant: 'track',
      content: {
        dates: ['1903', '1927', '1969'],
        events: [
          'The first plane flew',
          'A pilot crossed the ocean alone',
          'People walked on the moon',
        ],
        highlight: 2,
      },
      beats: [
        { cue: 'e1', word: 1 },
        { cue: 'e2', word: 7 },
        { cue: 'e3', word: 16 },
      ],
      images: [],
    },
  },
  {
    id: 'company-story',
    kind: 'year',
    text: 'We started in 2016 in a garage, hired our tenth person in 2019, and opened a second office in 2023.',
    score: {
      variant: 'track',
      content: {
        title: 'How we grew',
        dates: ['2016', '2019', '2023'],
        events: ['Started in a garage', 'Hired our tenth person', 'Opened a second office'],
      },
      beats: [
        { cue: 'e1', word: 3 },
        { cue: 'e2', word: 12 },
        { cue: 'e3', word: 19 },
      ],
      images: [],
    },
  },
  {
    id: 'trial-steps',
    kind: 'year',
    text: 'The trial began in March, results came in July, and approval followed in December.',
    score: {
      variant: 'steps',
      content: {
        dates: ['March', 'July', 'December'],
        events: ['Trial began', 'Results came', 'Approval followed'],
      },
      beats: [
        { cue: 'e1', word: 4 },
        { cue: 'e2', word: 8 },
        { cue: 'e3', word: 13 },
      ],
      images: [],
    },
  },
  {
    id: 'going-mobile',
    kind: 'year',
    text: 'The web went public in 1991, the first smartphone apps came in 2008, and by 2016 most traffic was mobile.',
    score: {
      variant: 'steps',
      content: {
        title: 'Going mobile',
        dates: ['1991', '2008', '2016'],
        events: [
          'The web went public',
          'The first smartphone apps came',
          'Most traffic was mobile',
        ],
        highlight: 2,
      },
      beats: [
        { cue: 'e1', word: 5 },
        { cue: 'e2', word: 12 },
        { cue: 'e3', word: 15 },
      ],
      images: [],
    },
  },
  {
    id: 'city-rail',
    kind: 'year',
    text: 'The first line opened in 1890, the network doubled by 1930, went electric in 1960, and went driverless in 2019.',
    score: {
      variant: 'zigzag',
      content: {
        title: 'A century of rail',
        dates: ['1890', '1930', '1960', '2019'],
        events: [
          'The first line opened',
          'The network doubled',
          'Went electric',
          'Went driverless',
        ],
        highlight: 3,
      },
      beats: [
        { cue: 'e1', word: 5 },
        { cue: 'e2', word: 10 },
        { cue: 'e3', word: 14 },
        { cue: 'e4', word: 19 },
      ],
      images: [],
    },
  },
  {
    id: 'phone-life',
    kind: 'year',
    text: 'Day one, the phone ships. Week two, the first update. Month six, a new model.',
    score: {
      variant: 'zigzag',
      content: {
        dates: ['Day one', 'Week two', 'Month six'],
        events: ['The phone ships', 'The first update', 'A new model'],
      },
      beats: [
        { cue: 'e1', word: 0 },
        { cue: 'e2', word: 5 },
        { cue: 'e3', word: 10 },
      ],
      images: [],
    },
  },
];
