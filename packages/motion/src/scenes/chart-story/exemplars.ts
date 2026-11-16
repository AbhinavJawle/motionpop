import type { Exemplar } from '../exemplar';
import type { ChartStoryContent } from './index';

/**
 * Hand-approved chart-story fills, 2 per variant (spec 07 R9.3). Original content, written and
 * reviewed in the Kiro IDE. Every value is spoken, and its `v` cue lands on the word that says it.
 */
export const chartStoryExemplars: Exemplar<ChartStoryContent>[] = [
  {
    id: 'plastic-recycled',
    kind: 'comparison',
    text: 'Europe recycles 48% of its plastic, the US 9%, and Japan 25%.',
    score: {
      variant: 'bars',
      content: {
        title: 'Plastic recycled',
        labels: ['Europe', 'US', 'Japan'],
        values: [48, 9, 25],
        suffix: '%',
        decimals: 0,
      },
      beats: [
        { cue: 'v1', word: 2 },
        { cue: 'v2', word: 8 },
        { cue: 'v3', word: 11 },
      ],
      images: [],
    },
  },
  {
    id: 'features-shipped',
    kind: 'number',
    text: 'Our team shipped 12 features in March, 19 in April and 31 in May.',
    score: {
      variant: 'bars',
      content: {
        title: 'Features shipped',
        labels: ['March', 'April', 'May'],
        values: [12, 19, 31],
        decimals: 0,
        highlight: 2,
      },
      beats: [
        { cue: 'title', word: 2 },
        { cue: 'v1', word: 3 },
        { cue: 'v2', word: 7 },
        { cue: 'v3', word: 11 },
      ],
      images: [],
    },
  },
  {
    id: 'budget-split',
    kind: 'comparison',
    text: 'Most of the budget goes to rent at 1,400, then food at 450, transport at 180 and fun at 120.',
    score: {
      variant: 'rows',
      content: {
        title: 'Where the budget goes',
        labels: ['Rent', 'Food', 'Transport', 'Fun'],
        values: [1400, 450, 180, 120],
        decimals: 0,
      },
      beats: [
        { cue: 'title', word: 3 },
        { cue: 'v1', word: 8 },
        { cue: 'v2', word: 12 },
        { cue: 'v3', word: 15 },
        { cue: 'v4', word: 19 },
      ],
      images: [],
    },
  },
  {
    id: 'survey-channels',
    kind: 'comparison',
    text: 'In our survey, 62% picked email, 21% picked chat and 17% picked phone calls.',
    score: {
      variant: 'rows',
      content: {
        title: 'Our survey',
        labels: ['Email', 'Chat', 'Phone calls'],
        values: [62, 21, 17],
        suffix: '%',
        decimals: 0,
        takeaway: 'Email picked by most',
      },
      beats: [
        { cue: 'v1', word: 3 },
        { cue: 'v2', word: 6 },
        { cue: 'v3', word: 10 },
      ],
      images: [],
    },
  },
  {
    id: 'rent-trend',
    kind: 'year',
    text: 'Average rent was 900 in 2010, 1,150 in 2015, 1,600 in 2020 and 2,100 today.',
    score: {
      variant: 'line',
      content: {
        title: 'Average rent',
        labels: ['2010', '2015', '2020', 'Today'],
        values: [900, 1150, 1600, 2100],
        decimals: 0,
      },
      beats: [
        { cue: 'title', word: 1 },
        { cue: 'v1', word: 3 },
        { cue: 'v2', word: 6 },
        { cue: 'v3', word: 9 },
        { cue: 'v4', word: 13 },
      ],
      images: [],
    },
  },
  {
    id: 'downloads-dip',
    kind: 'year',
    text: 'Downloads hit 2M in 2022, 5M in 2023, dipped to 4M in 2024 and reached 11M in 2025.',
    score: {
      variant: 'line',
      content: {
        title: 'Downloads',
        labels: ['2022', '2023', '2024', '2025'],
        values: [2, 5, 4, 11],
        suffix: 'M',
        decimals: 0,
        takeaway: 'Dipped, then reached 11M',
      },
      beats: [
        { cue: 'v1', word: 2 },
        { cue: 'v2', word: 5 },
        { cue: 'v3', word: 10 },
        { cue: 'v4', word: 15 },
        // The highlight fills the last point as it is said; the takeaway follows at once.
        { cue: 'highlight', word: 15 },
        { cue: 'takeaway', word: 16 },
      ],
      images: [],
    },
  },
];
