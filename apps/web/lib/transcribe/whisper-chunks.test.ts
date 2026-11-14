import { TranscriptSchema } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mixToMono } from '../audio/decode-16k';
import { chunksToWords, isFiller, type WhisperChunk } from './whisper-chunks';

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

  it('property: output always passes the Transcript schema and stays ordered within bounds', () => {
    fc.assert(
      fc.property(
        fc.array(chunkArb, { maxLength: 60 }),
        fc.integer({ min: 0, max: 600_000 }),
        (chunks, dur) => {
          const words = chunksToWords(chunks, dur);
          TranscriptSchema.parse({
            words,
            language: 'en',
            ranOn: 'device',
            timingQuality: 'word',
            cleaned: false,
          });
          words.forEach((w, i) => {
            expect(Number.isInteger(w.startMs) && Number.isInteger(w.endMs)).toBe(true);
            expect(w.startMs).toBeGreaterThanOrEqual(0);
            expect(w.endMs).toBeLessThanOrEqual(dur);
            expect(w.endMs).toBeGreaterThanOrEqual(w.startMs);
            expect(w.text).toBe(w.text.trim());
            if (i > 0) expect(w.startMs).toBeGreaterThanOrEqual(words[i - 1]!.startMs);
          });
        },
      ),
    );
  });
});

describe('isFiller', () => {
  it('flags hesitation sounds only', () => {
    expect(['um', 'Uh,', ' hmm.', 'erm'].every(isFiller)).toBe(true);
    expect(['umbrella', 'like', 'revenue', ''].some(isFiller)).toBe(false);
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
