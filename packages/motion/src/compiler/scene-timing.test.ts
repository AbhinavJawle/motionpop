import { describe, expect, it } from 'vitest';
import { sceneTiming } from './scene-timing';

const words = [
  { text: 'One', startMs: 900, endMs: 1200 },
  { text: 'two', startMs: 1300, endMs: 1600 },
  { text: 'three', startMs: 1700, endMs: 2100 },
  { text: 'four.', startMs: 2300, endMs: 2700 },
];

describe('sceneTiming (spec 07 task 27)', () => {
  it("gives the slot's words relative to its start, clamped into the slot", () => {
    const t = sceneTiming({ startMs: 1000, endMs: 2500, wordStart: 0, wordEnd: 3 }, { words });
    expect(t.text).toEqual(['One', 'two', 'three', 'four.']);
    expect(t.words).toEqual([
      { startMs: 0, endMs: 200 },
      { startMs: 300, endMs: 600 },
      { startMs: 700, endMs: 1100 },
      { startMs: 1300, endMs: 1500 },
    ]);
    expect(t.stress).toBeUndefined();
  });

  it('slices stress per slot word and keeps only the pauses inside the slot', () => {
    const t = sceneTiming(
      { startMs: 1250, endMs: 2800, wordStart: 1, wordEnd: 3 },
      {
        words,
        prosody: {
          stress: [10, 20, 80, 40],
          pauses: [
            { startMs: 200, endMs: 800 },
            { startMs: 2100, endMs: 2300 },
            { startMs: 2700, endMs: 3400 },
          ],
        },
      },
    );
    expect(t.stress).toEqual([20, 80, 40]);
    expect(t.pauses).toEqual([
      { startMs: 850, endMs: 1050 },
      { startMs: 1450, endMs: 1550 },
    ]);
  });

  it('drops stress that does not line up with the words', () => {
    const t = sceneTiming(
      { startMs: 0, endMs: 3000, wordStart: 0, wordEnd: 3 },
      { words, prosody: { stress: [1, 2], pauses: [] } },
    );
    expect(t.stress).toBeUndefined();
    expect(t.pauses).toEqual([]);
  });
});
