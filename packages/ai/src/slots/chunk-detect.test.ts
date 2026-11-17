import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { chunkRanges, detectInChunks, type IndexedSlot } from './chunk-detect';

const words = (texts: string[]) => texts.map((text) => ({ text }));

/** Words that sometimes end a sentence, so chunks have real boundaries to choose from. */
const wordArb = fc.constantFrom('the', 'grew', 'forty', 'since', 'end.', 'why?', 'wow!', 'fine…');
const wordsArb = fc.array(wordArb, { maxLength: 160 }).map(words);
const maxArb = fc.integer({ min: 1, max: 40 });

describe('chunkRanges', () => {
  it('splits on sentence ends when the limit allows', () => {
    const w = words(['a', 'b.', 'c', 'd?', 'e', 'f']);
    expect(chunkRanges(w, 4)).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 6 },
    ]);
  });

  it('cuts a sentence longer than the limit at the limit', () => {
    const w = words(['a', 'b', 'c', 'd', 'e.']);
    expect(chunkRanges(w, 2)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 5 },
    ]);
  });

  it('gives no chunks for no words, and rejects a limit below one', () => {
    expect(chunkRanges([], 5)).toEqual([]);
    expect(() => chunkRanges(words(['a']), 0)).toThrow(RangeError);
  });

  it('property: chunks cover every word once, in order, none over the limit', () => {
    fc.assert(
      fc.property(wordsArb, maxArb, (w, max) => {
        const ranges = chunkRanges(w, max);
        let next = 0;
        for (const r of ranges) {
          expect(r.start).toBe(next);
          expect(r.end - r.start).toBeGreaterThanOrEqual(1);
          expect(r.end - r.start).toBeLessThanOrEqual(max);
          next = r.end;
        }
        expect(next).toBe(w.length);
      }),
      { numRuns: 300 },
    );
  });
});

describe('detectInChunks', () => {
  it('shifts each chunk answer to transcript indices and merges them in order', async () => {
    const w = words(['a.', 'b', 'c.', 'd', 'e.']);
    const calls: Array<{ len: number; offset: number }> = [];
    const merged = await detectInChunks(w, 2, async (chunk, offset) => {
      calls.push({ len: chunk.length, offset });
      return [{ wordStart: 0, wordEnd: chunk.length - 1 }];
    });
    // Sentences [0,1), [1,3), [3,5): with a limit of 2 they become three chunks.
    expect(calls).toEqual([
      { len: 1, offset: 0 },
      { len: 2, offset: 1 },
      { len: 2, offset: 3 },
    ]);
    expect(merged).toEqual([
      { wordStart: 0, wordEnd: 0 },
      { wordStart: 1, wordEnd: 2 },
      { wordStart: 3, wordEnd: 4 },
    ]);
  });

  it('drops answers that fall outside their chunk', async () => {
    const w = words(['a', 'b', 'c.']);
    const merged = await detectInChunks(w, 2, async () => [
      { wordStart: 0, wordEnd: 5 },
      { wordStart: 1, wordEnd: 0 },
      { wordStart: 0, wordEnd: 0 },
    ]);
    // The chunk [0,2) keeps {0,0}; the chunk [2,3) keeps its own {0,0}, shifted to {2,2}.
    expect(merged).toEqual([
      { wordStart: 0, wordEnd: 0 },
      { wordStart: 2, wordEnd: 2 },
    ]);
  });

  it('a failing chunk stops the detection', async () => {
    const w = words(['a.', 'b.']);
    await expect(
      detectInChunks(w, 1, async (chunk) => {
        if (chunk[0]?.text === 'b.') throw new Error('device gave up');
        return [];
      }),
    ).rejects.toThrow('device gave up');
  });

  it('property: merged slots stay inside the transcript and never overlap', async () => {
    // Each chunk answers with two disjoint slots (its first word, and its last word when the chunk
    // has two or more). Disjoint chunks then give a merged list with no overlaps.
    await fc.assert(
      fc.asyncProperty(wordsArb, maxArb, async (w, max) => {
        const merged: IndexedSlot[] = await detectInChunks(w, max, async (chunk) => {
          const first: IndexedSlot = { wordStart: 0, wordEnd: 0 };
          return chunk.length >= 2
            ? [first, { wordStart: chunk.length - 1, wordEnd: chunk.length - 1 }]
            : [first];
        });
        for (const s of merged) {
          expect(s.wordStart).toBeGreaterThanOrEqual(0);
          expect(s.wordEnd).toBeGreaterThanOrEqual(s.wordStart);
          expect(s.wordEnd).toBeLessThan(w.length);
        }
        for (let i = 1; i < merged.length; i++) {
          expect(merged[i]!.wordStart).toBeGreaterThan(merged[i - 1]!.wordEnd);
        }
      }),
      { numRuns: 200 },
    );
  });
});
