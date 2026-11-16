import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SINGLE_MAX_WORDS, singleDurationMs, singleWords } from './single';

describe('single graphic words', () => {
  it('times every word in order, without overlaps, inside the silent track', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[A-Za-z0-9%$.,']{1,14}$/), { maxLength: 40 }),
        (ws) => {
          const words = singleWords(ws.join(' '));
          expect(words.length).toBe(Math.min(ws.length, SINGLE_MAX_WORDS));
          words.forEach((w, i) => {
            expect(w.i).toBe(i);
            expect(w.endMs).toBeGreaterThan(w.startMs);
            if (i > 0) expect(w.startMs).toBeGreaterThan(words[i - 1]!.endMs);
          });
          const last = words[words.length - 1];
          expect(singleDurationMs(words)).toBeGreaterThanOrEqual((last?.endMs ?? 0) + 1000);
        },
      ),
    );
  });

  it('a short line is spread so any scene fits; blank input gives no words', () => {
    expect(singleDurationMs(singleWords('Hello'))).toBe(6200);
    const ws = singleWords('Japan');
    expect(ws[0]!.endMs - ws[0]!.startMs).toBe(4000);
    expect(singleWords('   ')).toEqual([]);
  });
});
