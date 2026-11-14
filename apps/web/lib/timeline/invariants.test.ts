import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GLOBAL_LIMITS } from './constraints';
import { checkDurations, wordsInRange } from './invariants';

const wordsArb = fc
  .array(fc.tuple(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 1, max: 600 })), {
    minLength: 0,
    maxLength: 50,
  })
  .map((parts) => {
    let t = 0;
    return parts.map(([gap, len]) => {
      const w = { startMs: t + gap, endMs: t + gap + len };
      t = w.endMs;
      return w;
    });
  });

describe('wordsInRange', () => {
  it('returns indices whose words intersect the range, and null only when none do', () => {
    fc.assert(
      fc.property(
        wordsArb,
        fc.integer({ min: 0, max: 30_000 }),
        fc.integer({ min: 1, max: 5000 }),
        (words, s, len) => {
          const e = s + len;
          const hits = words
            .map((w, i) => (w.endMs > s && w.startMs < e ? i : -1))
            .filter((i) => i >= 0);
          const r = wordsInRange(words, s, e);
          if (hits.length === 0) {
            expect(r).toBeNull();
          } else {
            expect(r).toEqual({ wordStart: hits[0], wordEnd: hits[hits.length - 1] });
          }
        },
      ),
    );
  });
});

describe('checkDurations', () => {
  it('flags slots outside the limits', () => {
    const slots = [
      { id: 'a', startMs: 0, endMs: 500, componentId: 'x' },
      { id: 'b', startMs: 1000, endMs: 3000, componentId: 'x' },
      { id: 'c', startMs: 4000, endMs: 20_000, componentId: 'x' },
    ];
    const issues = checkDurations(slots, () => GLOBAL_LIMITS);
    expect(issues).toHaveLength(2);
  });
});
