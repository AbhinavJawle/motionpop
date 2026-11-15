import fc from 'fast-check';
import type { BeatInput, CueSpec } from './beats';

/** Shared generators for the stage-engine property tests (not part of the public engine API). */

const cueArb = (id: string): fc.Arbitrary<CueSpec> =>
  fc
    .record(
      {
        leadMs: fc.integer({ min: 0, max: 1500 }),
        words: fc.integer({ min: 0, max: 12 }),
        optional: fc.boolean(),
        snap: fc.boolean(),
      },
      { requiredKeys: [] },
    )
    .map((c) => ({ id, ...c }));

/** Monotonic word timings (integer ms) that fit inside `durationMs`. */
const wordsArb = (durationMs: number, count: number) =>
  fc
    .array(fc.integer({ min: 0, max: Math.max(1, durationMs - 100) }), {
      minLength: count,
      maxLength: count,
    })
    .map((starts) =>
      starts
        .sort((a, b) => a - b)
        .map((s, i, all) => ({
          startMs: s,
          endMs: Math.min(durationMs, Math.max(s + 1, Math.min(s + 400, all[i + 1] ?? s + 400))),
        })),
    );

const stressArb = (minLength: number, maxLength: number) =>
  fc.array(fc.oneof(fc.integer({ min: 0, max: 100 }), fc.constantFrom(20, 50, 90)), {
    minLength,
    maxLength,
  });

/** Random beat inputs: 1–6 cues, 0–14 words, anchors that may be out of range or repeated. */
export const beatInputArb: fc.Arbitrary<BeatInput> = fc
  .record({
    durationMs: fc.integer({ min: 1500, max: 12000 }),
    cueCount: fc.integer({ min: 1, max: 6 }),
    wordCount: fc.integer({ min: 0, max: 14 }),
  })
  .chain(({ durationMs, cueCount, wordCount }) => {
    const ids = Array.from({ length: cueCount }, (_, i) => `c${i}`);
    return fc.record({
      durationMs: fc.constant(durationMs),
      cues: fc.tuple(...ids.map(cueArb)),
      words: wordsArb(durationMs, wordCount),
      // Anchors may name unknown cues, repeat a cue, or point outside the words.
      anchors: fc.array(
        fc.record({
          cue: fc.oneof(fc.constantFrom(...ids), fc.constant('ghost')),
          word: fc.integer({ min: -2, max: wordCount + 3 }),
        }),
        { maxLength: 9 },
      ),
      // Stress length may differ from the word count.
      stress: fc.option(fc.oneof(stressArb(wordCount, wordCount), stressArb(0, wordCount + 2)), {
        nil: undefined,
      }),
      enterMs: fc.integer({ min: 100, max: 1200 }),
      exitMs: fc.integer({ min: 0, max: 800 }),
      snapMargin: fc.option(fc.integer({ min: 0, max: 40 }), { nil: undefined }),
    });
  })
  .map(({ stress, snapMargin, ...rest }) => ({
    ...rest,
    ...(stress ? { stress } : {}),
    ...(snapMargin !== undefined ? { snapMargin } : {}),
  }));

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
