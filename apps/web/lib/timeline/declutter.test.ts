import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { demoWords } from '../projects/fixture';
import { perfProject } from '../projects/perf-fixture';
import { declutterWords, WORD_CHAR_PX } from './declutter';
import { fitView, msToX } from './geometry';

describe('declutterWords', () => {
  it('keeps every demo word at the design fit (68 px per second)', () => {
    expect(declutterWords(demoWords, { pxPerMs: 0.068, scrollMs: 0 })).toHaveLength(
      demoWords.length,
    );
  });

  it('thins 3,000 words at fit to a non-overlapping sample', () => {
    const words = perfProject().transcript.words;
    const kept = declutterWords(words, fitView(961_000, 1224));
    expect(kept.length).toBeGreaterThan(30); // ~30 px per kept word across 1,224 px
    expect(kept.length).toBeLessThan(400);
  });

  it('property: kept words never overlap and keep their order', () => {
    const words = perfProject().transcript.words.slice(0, 400);
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 2, noNaN: true }), (pxPerMs) => {
        const view = { pxPerMs, scrollMs: 0 };
        const kept = declutterWords(words, view);
        for (let k = 1; k < kept.length; k++) {
          const a = kept[k - 1]!;
          const b = kept[k]!;
          expect(b.i).toBeGreaterThan(a.i);
          expect(msToX(b.startMs, view)).toBeGreaterThanOrEqual(
            msToX(a.startMs, view) + a.text.length * WORD_CHAR_PX,
          );
        }
      }),
    );
  });
});
