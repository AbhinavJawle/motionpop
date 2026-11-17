import fc from 'fast-check';
import { customExample } from './example';
import type { CustomParams } from './params';

// motion:check samples for the custom component (spec 15, spec 07b task 10). Every sample is a
// complete, valid graphic from the example, so the checks run on real scripts. The film cases add
// a handover tail (spec 07b): their content may leave the frame during the tail, which is allowed.
const HEADLINES = ['From idea to launch', 'Three steps, one story', 'Plan, build, ship'] as const;

export const arbitrary: fc.Arbitrary<CustomParams> = fc
  .constantFrom(...HEADLINES)
  .map((h) => customExample(h));

export const edgeCases: Record<string, CustomParams> = {
  'show-plain': customExample('A plain graphic'),
  'show-film-out': {
    ...customExample('A film beat, leaving'),
    film: { tailMs: 500, over: 'out', headMs: 0 },
  },
  'show-film-in': {
    ...customExample('A film beat, arriving under'),
    film: { tailMs: 500, over: 'in', headMs: 0 },
  },
};
