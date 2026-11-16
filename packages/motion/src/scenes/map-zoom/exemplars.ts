import type { Exemplar } from '../exemplar';
import type { MapZoomContent } from './index';

/** Hand-approved map-zoom fills, 2 per variant (spec 07 R9.3). Written by Claude Code. */
export const mapZoomExemplars: Exemplar<MapZoomContent>[] = [
  {
    id: 'japan-peak',
    kind: 'place',
    text: 'Now look at Japan. The market peaked in 1989 and took decades to recover.',
    score: {
      variant: 'zoom',
      content: { place: 'Japan', label: 'Japan', note: 'Peaked in 1989' },
      beats: [
        { cue: 'place', word: 3 },
        { cue: 'note', word: 8 },
      ],
      images: [],
    },
  },
  {
    id: 'brazil-coffee',
    kind: 'place',
    text: 'Brazil grows almost a third of the world’s coffee.',
    score: {
      variant: 'zoom',
      content: { place: 'Brazil', label: 'Brazil', note: 'A third of the world’s coffee' },
      beats: [
        { cue: 'place', word: 0 },
        { cue: 'note', word: 3 },
      ],
      images: [],
    },
  },
  {
    id: 'lagos-growth',
    kind: 'place',
    text: 'Lagos adds thousands of new residents every single day.',
    score: {
      variant: 'pin',
      content: { place: 'Lagos', label: 'Lagos', context: 'Fastest growing' },
      beats: [{ cue: 'place', word: 0 }],
      images: [],
    },
  },
  {
    id: 'seoul-startups',
    kind: 'place',
    text: 'The company started in a tiny flat in Seoul with three engineers.',
    score: {
      variant: 'pin',
      content: { place: 'Seoul', label: 'Seoul', note: 'Three engineers, one flat' },
      beats: [{ cue: 'place', word: 8 }],
      images: [],
    },
  },
  {
    id: 'europe-energy',
    kind: 'place',
    text: 'Across Europe, energy prices doubled in a single winter.',
    score: {
      variant: 'spotlight',
      content: { place: 'Europe', label: 'Europe', note: 'Energy prices doubled' },
      beats: [{ cue: 'place', word: 1 }],
      images: [],
    },
  },
  {
    id: 'africa-young',
    kind: 'place',
    text: 'Africa will be home to one in four people on Earth by 2050.',
    score: {
      variant: 'spotlight',
      content: { place: 'Africa', label: 'Africa', note: 'One in four people by 2050' },
      beats: [
        { cue: 'place', word: 0 },
        { cue: 'note', word: 5 },
      ],
      images: [],
    },
  },
];
