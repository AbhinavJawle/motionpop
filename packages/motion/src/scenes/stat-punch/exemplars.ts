import type { Exemplar } from '../exemplar';
import type { StatPunchContent } from './index';

/** Hand-approved stat-punch fills, 2 per variant (spec 07 R9.3). Reviewed by Claude Code. */
export const statPunchExemplars: Exemplar<StatPunchContent>[] = [
  {
    id: 'rent-climbed',
    kind: 'number',
    text: 'Since 2015 the average rent in this city has climbed 62% while wages barely moved.',
    score: {
      variant: 'stack',
      content: {
        value: 62,
        suffix: '%',
        decimals: 0,
        label: 'Average rent since 2015',
        context: 'In this city',
        countFrom: 0,
      },
      beats: [
        { cue: 'context', word: 5 },
        { cue: 'number', word: 10 },
        { cue: 'label', word: 11 },
      ],
      images: [],
    },
  },
  {
    id: 'students-tested',
    kind: 'number',
    text: 'We tested it on 1,200 students and the result surprised everyone.',
    score: {
      variant: 'stack',
      content: { value: 1200, decimals: 0, label: 'Students in the trial', countFrom: 0 },
      beats: [
        { cue: 'number', word: 4 },
        { cue: 'label', word: 5 },
      ],
      images: [],
    },
  },
  {
    id: 'final-figure',
    kind: 'number',
    text: 'And the final number was $4.2 billion.',
    score: {
      variant: 'hero',
      content: {
        value: 4.2,
        prefix: '$',
        suffix: 'bn',
        decimals: 1,
        label: 'The final number',
        countFrom: 0,
      },
      beats: [
        { cue: 'number', word: 5 },
        { cue: 'label', word: 6 },
      ],
      images: [],
    },
  },
  {
    id: 'startups-fail',
    kind: 'number',
    text: 'Out of every hundred startups, 90 fail within five years.',
    score: {
      variant: 'hero',
      content: {
        value: 90,
        suffix: '%',
        decimals: 0,
        label: 'Of startups fail within 5 years',
        countFrom: 0,
      },
      beats: [
        { cue: 'number', word: 5 },
        { cue: 'label', word: 6 },
      ],
      images: [],
    },
  },
  {
    id: 'plastic-years',
    kind: 'number',
    text: 'Plastic takes about 450 years to break down in the ocean, longer than any of us will live.',
    score: {
      variant: 'side',
      content: {
        value: 450,
        decimals: 0,
        label: 'Years for plastic to break down at sea',
        context: 'Plastic',
        countFrom: 0,
      },
      beats: [
        { cue: 'context', word: 0 },
        { cue: 'number', word: 3 },
        { cue: 'label', word: 4 },
      ],
      images: [],
    },
  },
  {
    id: 'phone-checks',
    kind: 'number',
    text: 'Each day the average person checks their phone 96 times, mostly without noticing.',
    score: {
      variant: 'side',
      content: {
        value: 96,
        decimals: 0,
        label: 'Phone checks per person, every day',
        context: 'Every day',
        countFrom: 0,
      },
      beats: [
        { cue: 'context', word: 1 },
        { cue: 'number', word: 8 },
        { cue: 'label', word: 9 },
      ],
      images: [],
    },
  },
];
