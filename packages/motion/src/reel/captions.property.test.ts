// Spec 39 task 7 (R5.2, review 14): for every caption style and random word lists, every chunk
// is within its limits and the chunks run in time order without overlapping.
import type { ReelCaptionStyle, ReelLook } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CAPTION_STYLES, chunkCaptions } from './captions';

const STYLES = Object.keys(CAPTION_STYLES) as ReelCaptionStyle[];

/** 1–200 words of random length with increasing times (gaps of 0–900 ms, so some are long). */
const wordList = fc
  .array(
    fc.record({
      len: fc.integer({ min: 1, max: 24 }),
      dur: fc.integer({ min: 40, max: 600 }),
      gap: fc.integer({ min: 0, max: 900 }),
      end: fc.constantFrom('', '', '', '.', ',', '?'),
    }),
    { minLength: 1, maxLength: 200 },
  )
  .map((items) => {
    let t = 0;
    return items.map((w, i) => {
      const startMs = t + w.gap;
      const endMs = startMs + w.dur;
      t = endMs;
      return { text: (i % 3 === 0 ? 'Ab' : 'cd').padEnd(w.len, 'x') + w.end, startMs, endMs };
    });
  });

describe('caption chunk properties', () => {
  it.each(STYLES)('%s: limits, order and no overlap', (style) => {
    const { maxWords, maxChars } = CAPTION_STYLES[style];
    fc.assert(
      fc.property(wordList, fc.constantFrom<ReelLook>('mono', 'cream'), (words, look) => {
        const chunks = chunkCaptions(words, look, style);
        expect(chunks.length).toBeGreaterThan(0);
        for (const c of chunks) {
          const parts = c.text.split(' ');
          expect(parts.length).toBeLessThanOrEqual(maxWords);
          if (parts.length > 1) expect(c.text.length).toBeLessThanOrEqual(maxChars);
          expect(c.startMs).toBeLessThan(c.endMs);
        }
        for (let i = 1; i < chunks.length; i++) {
          expect(chunks[i]!.startMs).toBeGreaterThanOrEqual(chunks[i - 1]!.startMs);
          expect(chunks[i]!.startMs).toBeGreaterThanOrEqual(chunks[i - 1]!.endMs);
        }
      }),
      { numRuns: 200 },
    );
  });
});
