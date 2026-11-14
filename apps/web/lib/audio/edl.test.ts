import type { Word } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { chunksToWords, type WhisperChunk } from '../transcribe/whisper-chunks';
import {
  buildEdl,
  cleanedDuration,
  DEFAULT_EDL_OPTIONS,
  mapTime,
  retimeWords,
  type CutRange,
} from './edl';
import { keptSegments } from './render-cleaned';

const LAX = { maxCutRatio: 1 };
function w(i: number, text: string, startMs: number, endMs: number): Word {
  return { i, text, startMs, endMs, conf: 1, filler: text === 'um' || text === 'uh' };
}
const total = (cuts: CutRange[]) => cuts.reduce((s, c) => s + c.endMs - c.startMs, 0);

describe('buildEdl rules', () => {
  it('shortens an inner pause longer than 700 ms, keeping 300 ms of silence', () => {
    const edl = buildEdl([w(0, 'a', 0, 500), w(1, 'b', 2000, 2500)], 2500, LAX);
    expect(edl.cuts).toEqual([{ startMs: 650, endMs: 1850 }]);
    expect(edl.pausesShortened).toBe(1);
    expect(edl.fillersRemoved).toBe(0);
  });

  it('leaves a gap of exactly 700 ms alone', () => {
    expect(buildEdl([w(0, 'a', 0, 500), w(1, 'b', 1200, 1700)], 1700).cuts).toEqual([]);
  });

  it('cuts a filler in a short gap', () => {
    const edl = buildEdl(
      [w(0, 'a', 0, 500), w(1, 'um', 500, 800), w(2, 'b', 900, 1400)],
      1400,
      LAX,
    );
    expect(edl.cuts).toEqual([{ startMs: 500, endMs: 800 }]);
    expect(edl.fillersRemoved).toBe(1);
    expect(edl.pausesShortened).toBe(0);
  });

  it('shortens long leading and trailing silence, keeping 300 ms next to the speech', () => {
    const edl = buildEdl([w(0, 'a', 2000, 2500)], 5000, LAX);
    expect(edl.cuts).toEqual([
      { startMs: 0, endMs: 1700 },
      { startMs: 2800, endMs: 5000 },
    ]);
    expect(edl.pausesShortened).toBe(2);
  });

  it('removes a filler at the very start and at the very end', () => {
    const edl = buildEdl(
      [w(0, 'um', 0, 300), w(1, 'a', 400, 900), w(2, 'uh', 1000, 1300)],
      1300,
      LAX,
    );
    expect(edl.cuts).toEqual([
      { startMs: 0, endMs: 300 },
      { startMs: 1000, endMs: 1300 },
    ]);
    expect(edl.fillersRemoved).toBe(2);
  });

  it('counts a filler inside a long pause as removed, in one merged cut', () => {
    const edl = buildEdl(
      [w(0, 'a', 0, 500), w(1, 'um', 1000, 1300), w(2, 'b', 2500, 3000)],
      3000,
      LAX,
    );
    expect(edl.cuts).toEqual([{ startMs: 650, endMs: 2350 }]);
    expect(edl.fillersRemoved).toBe(1);
    expect(edl.pausesShortened).toBe(1);
  });

  it('still removes a filler that sits in the kept silence of a long pause', () => {
    const edl = buildEdl(
      [w(0, 'a', 0, 500), w(1, 'um', 520, 640), w(2, 'b', 2500, 3000)],
      3000,
      LAX,
    );
    expect(edl.fillersRemoved).toBe(1);
    expect(edl.cuts).toEqual([
      { startMs: 520, endMs: 640 },
      { startMs: 650, endMs: 2350 },
    ]);
  });

  it('merges touching cuts', () => {
    const edl = buildEdl(
      [w(0, 'a', 0, 500), w(1, 'um', 500, 800), w(2, 'uh', 800, 1100), w(3, 'b', 1200, 1700)],
      1700,
      LAX,
    );
    expect(edl.cuts).toEqual([{ startMs: 500, endMs: 1100 }]);
    expect(edl.fillersRemoved).toBe(2);
  });

  it('drops cuts shorter than minCutMs', () => {
    const edl = buildEdl(
      [w(0, 'a', 0, 500), w(1, 'um', 510, 525), w(2, 'b', 800, 1300)],
      1300,
      LAX,
    );
    expect(edl.cuts).toEqual([]);
    expect(edl.fillersRemoved).toBe(0);
  });

  it('returns no cuts when there is no speech', () => {
    expect(buildEdl([], 5000)).toEqual({
      cuts: [],
      fillersRemoved: 0,
      pausesShortened: 0,
      skipped: 'no-speech',
    });
    expect(buildEdl([w(0, 'um', 100, 300)], 5000).skipped).toBe('no-speech');
  });

  it('skips cleanup when more than 40 % would go', () => {
    const edl = buildEdl([w(0, 'a', 0, 500), w(1, 'b', 5000, 5500)], 5500);
    expect(edl).toEqual({ cuts: [], fillersRemoved: 0, pausesShortened: 0, skipped: 'too-much' });
  });

  it('keeps cleanup when the cut is exactly at the ratio', () => {
    const edl = buildEdl([w(0, 'a', 0, 500), w(1, 'b', 1500, 2000)], 2000, { maxCutRatio: 0.35 });
    expect(edl.cuts).toEqual([{ startMs: 650, endMs: 1350 }]);
  });
});

describe('mapTime, retimeWords, cleanedDuration', () => {
  const cuts = [
    { startMs: 1000, endMs: 1500 },
    { startMs: 3000, endMs: 3200 },
  ];
  it('subtracts the cuts before a time and clamps inside a cut', () => {
    expect(mapTime(500, cuts)).toBe(500);
    expect(mapTime(1000, cuts)).toBe(1000);
    expect(mapTime(1250, cuts)).toBe(1000);
    expect(mapTime(1500, cuts)).toBe(1000);
    expect(mapTime(3200, cuts)).toBe(2500);
    expect(mapTime(4000, cuts)).toBe(3300);
  });
  it('computes the cleaned duration', () => {
    expect(cleanedDuration(5000, cuts)).toBe(4300);
    expect(cleanedDuration(5000, [])).toBe(5000);
  });
  it('drops words inside cuts and re-indexes', () => {
    const words = [
      w(0, 'a', 0, 900),
      w(1, 'um', 1000, 1400),
      w(2, 'b', 1600, 2000),
      w(3, 'c', 3300, 3800),
    ];
    const out = retimeWords(words, cuts);
    expect(out.map((x) => [x.i, x.text, x.startMs, x.endMs])).toEqual([
      [0, 'a', 0, 900],
      [1, 'b', 1100, 1500],
      [2, 'c', 2600, 3100],
    ]);
  });
});

describe('agreement with keptSegments (render-cleaned)', () => {
  it('output position of a kept word start equals mapTime', () => {
    const words = [
      w(0, 'a', 0, 500),
      w(1, 'um', 600, 900),
      w(2, 'b', 3000, 3500),
      w(3, 'c', 6000, 6400),
    ];
    const dur = 7000;
    const edl = buildEdl(words, dur, LAX);
    expect(edl.cuts.length).toBeGreaterThan(0);
    const segs = keptSegments(dur, edl.cuts);
    for (const k of words.filter((x) => !x.filler)) {
      const s = segs.find((g) => g.srcStartMs <= k.startMs && k.endMs <= g.srcEndMs);
      expect(s).toBeDefined();
      expect(s!.outStartMs + (k.startMs - s!.srcStartMs)).toBe(mapTime(k.startMs, edl.cuts));
    }
  });
});

const secs = fc.option(fc.double({ min: 0, max: 30, noNaN: true }), { nil: null });
const chunkArb: fc.Arbitrary<WhisperChunk> = fc.record({
  text: fc.constantFrom(' um', ' uh', ' revenue', ' grew', ' forty', ' percent'),
  timestamp: fc.tuple(secs, secs),
});
const inputArb = fc.tuple(
  fc.array(chunkArb, { maxLength: 40 }),
  fc.integer({ min: 0, max: 30_000 }),
);
const build = ([chunks, dur]: [WhisperChunk[], number]) => {
  const words = chunksToWords(chunks, dur);
  return { words, dur, edl: buildEdl(words, dur) };
};
const intersects = (x: Word, c: CutRange) => x.startMs < c.endMs && x.endMs > c.startMs;

describe('EDL properties', () => {
  it('cuts are sorted, disjoint, inside the audio and at least minCutMs', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const { dur, edl } = build(inp);
        edl.cuts.forEach((c, k) => {
          expect(Number.isInteger(c.startMs) && Number.isInteger(c.endMs)).toBe(true);
          expect(c.startMs).toBeGreaterThanOrEqual(0);
          expect(c.endMs).toBeLessThanOrEqual(dur);
          expect(c.endMs - c.startMs).toBeGreaterThanOrEqual(DEFAULT_EDL_OPTIONS.minCutMs);
          if (k > 0) expect(c.startMs).toBeGreaterThanOrEqual(edl.cuts[k - 1]!.endMs);
        });
      }),
      { numRuns: 300 },
    );
  });

  it('no non-filler word intersects a cut', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const { words, edl } = build(inp);
        for (const x of words.filter((y) => !y.filler)) {
          expect(edl.cuts.some((c) => intersects(x, c))).toBe(false);
          expect(edl.cuts.some((c) => x.startMs > c.startMs && x.startMs < c.endMs)).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('cuts at most 40 % of the audio, or none', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const { dur, edl } = build(inp);
        expect(total(edl.cuts)).toBeLessThanOrEqual(0.4 * dur);
        if (edl.skipped) expect(edl.cuts).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('retimed words keep duration and order, and stay inside the cleaned audio', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const { words, dur, edl } = build(inp);
        const out = retimeWords(words, edl.cuts);
        const cd = cleanedDuration(dur, edl.cuts);
        const byText = words.filter(
          (x) =>
            !edl.cuts.some(
              (c) =>
                c.startMs <= x.startMs &&
                x.endMs <= c.endMs &&
                (x.endMs > x.startMs || (x.startMs > c.startMs && x.startMs < c.endMs)),
            ),
        );
        expect(out).toHaveLength(byText.length);
        out.forEach((o, k) => {
          const src = byText[k]!;
          expect(o.i).toBe(k);
          expect(o.endMs - o.startMs).toBe(src.endMs - src.startMs);
          expect(o.startMs).toBeGreaterThanOrEqual(0);
          expect(o.endMs).toBeLessThanOrEqual(cd);
          if (k > 0) expect(o.startMs).toBeGreaterThanOrEqual(out[k - 1]!.startMs);
        });
        // Every non-filler word survives.
        expect(out.filter((x) => !x.filler)).toHaveLength(words.filter((x) => !x.filler).length);
      }),
      { numRuns: 300 },
    );
  });

  it('mapTime is monotonic and cleanedDuration = duration - sum of cuts', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const { dur, edl } = build(inp);
        let prev = -1;
        for (let ms = 0; ms <= dur; ms += Math.max(1, Math.floor(dur / 60))) {
          const m = mapTime(ms, edl.cuts);
          expect(m).toBeGreaterThanOrEqual(prev);
          prev = m;
        }
        expect(mapTime(dur, edl.cuts)).toBe(cleanedDuration(dur, edl.cuts));
        expect(cleanedDuration(dur, edl.cuts)).toBe(dur - total(edl.cuts));
      }),
      { numRuns: 300 },
    );
  });
});
