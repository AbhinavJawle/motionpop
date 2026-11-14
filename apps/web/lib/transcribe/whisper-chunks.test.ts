import { TranscriptSchema } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mixToMono } from '../audio/decode-16k';
import { chunksToWords, isFiller, MIN_WORD_MS, type WhisperChunk } from './whisper-chunks';

const secs = fc.option(fc.double({ min: -5, max: 120, noNaN: true }), { nil: null });
const chunkArb: fc.Arbitrary<WhisperChunk> = fc.record({
  text: fc.oneof(fc.constantFrom(' um', ' revenue', ' grew', ' 40%', '  ', ''), fc.string()),
  timestamp: fc.tuple(secs, secs),
});

describe('chunksToWords', () => {
  it('maps seconds to integer ms and keeps text trimmed', () => {
    const words = chunksToWords(
      [
        { text: ' Revenue', timestamp: [0.12, 0.5] },
        { text: ' um', timestamp: [0.5, 0.81] },
        { text: ' grew.', timestamp: [0.81, null] },
      ],
      2000,
    );
    expect(words.map((w) => [w.text, w.startMs, w.endMs, w.filler])).toEqual([
      ['Revenue', 120, 500, false],
      ['um', 500, 810, true],
      ['grew.', 810, 2000, false],
    ]);
  });

  it('joins a chunk without a leading space onto the previous word', () => {
    const words = chunksToWords(
      [
        { text: ' grew', timestamp: [0.54, 0.96] },
        { text: ' 40', timestamp: [0.96, 1.32] },
        { text: '%', timestamp: [1.32, 1.34] },
        { text: ' since', timestamp: [1.64, 2.46] },
      ],
      3000,
    );
    expect(words.map((w) => [w.i, w.text, w.startMs, w.endMs])).toEqual([
      [0, 'grew', 540, 960],
      [1, '40%', 960, 1340],
      [2, 'since', 1640, 2460],
    ]);
  });

  it('enforces a 40 ms minimum and no overlap on messy input', () => {
    const words = chunksToWords(
      [
        { text: ' a', timestamp: [1, 1] },
        { text: ' b', timestamp: [0.5, 1.2] },
        { text: ' c', timestamp: [null, null] },
        { text: ' d', timestamp: [1.21, 1.22] },
      ],
      3000,
    );
    expect(words.map((w) => [w.startMs, w.endMs])).toEqual([
      [1000, 1040],
      [1040, 1200],
      [1200, 1240],
      [1240, 1280],
    ]);
  });

  it('squeezes words evenly when the audio is too short for 40 ms each', () => {
    const chunks: WhisperChunk[] = ['a', 'b', 'c', 'd'].map((t, i) => ({
      text: ` ${t}`,
      timestamp: [i, i + 1],
    }));
    const words = chunksToWords(chunks, 100);
    expect(words.map((w) => [w.startMs, w.endMs])).toEqual([
      [0, 25],
      [25, 50],
      [50, 75],
      [75, 100],
    ]);
    expect(chunksToWords(chunks, 0).every((w) => w.startMs === 0 && w.endMs === 0)).toBe(true);
  });

  it('property: R2.3 invariants hold for random chunk lists', () => {
    const durArb = fc.oneof(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 600_000 }));
    fc.assert(
      fc.property(fc.array(chunkArb, { maxLength: 60 }), durArb, (chunks, dur) => {
        const words = chunksToWords(chunks, dur);
        TranscriptSchema.parse({
          words,
          language: 'en',
          ranOn: 'device',
          timingQuality: 'word',
          cleaned: false,
        });
        const fits = words.length * MIN_WORD_MS <= dur;
        words.forEach((w, i) => {
          expect(w.i).toBe(i);
          expect(Number.isInteger(w.startMs) && Number.isInteger(w.endMs)).toBe(true);
          expect(w.startMs).toBeGreaterThanOrEqual(0);
          expect(w.endMs).toBeLessThanOrEqual(dur);
          expect(w.endMs).toBeGreaterThanOrEqual(w.startMs);
          if (fits) expect(w.endMs).toBeGreaterThanOrEqual(w.startMs + MIN_WORD_MS);
          expect(w.text).toBe(w.text.trim());
          expect(w.text.length).toBeGreaterThan(0);
          if (i > 0) {
            expect(w.startMs).toBeGreaterThanOrEqual(words[i - 1]!.startMs);
            expect(words[i - 1]!.endMs).toBeLessThanOrEqual(w.startMs);
          }
        });
      }),
      { numRuns: 500 },
    );
  });
});

describe('isFiller', () => {
  it('flags hesitation sounds only', () => {
    expect(['um', 'Uh,', ' hmm.', 'erm'].every(isFiller)).toBe(true);
    expect(['umbrella', 'like', 'revenue', ''].some(isFiller)).toBe(false);
  });

  it('never flags words that can carry meaning', () => {
    const meaningful = [
      'like',
      'so',
      'well',
      'right',
      'okay',
      'I',
      'a',
      'Like,',
      'So.',
      'actually',
      'oh',
      'ok',
      'yeah',
      'no',
    ];
    expect(meaningful.filter(isFiller)).toEqual([]);
  });
});

describe('mixToMono', () => {
  it('averages channels', () => {
    const out = mixToMono([Float32Array.from([1, 0, -1]), Float32Array.from([0, 0, 1])]);
    expect(Array.from(out)).toEqual([0.5, 0, 0]);
  });
  it('returns the single channel unchanged and handles none', () => {
    const ch = Float32Array.from([0.25]);
    expect(mixToMono([ch])).toBe(ch);
    expect(mixToMono([]).length).toBe(0);
  });
});
