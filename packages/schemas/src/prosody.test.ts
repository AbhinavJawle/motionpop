import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { TranscriptSchema } from './transcript';

const word = (i: number) => ({
  i,
  text: 'hi',
  startMs: i * 100,
  endMs: i * 100 + 90,
  conf: 0.9,
  filler: false,
});
const transcript = (n: number, prosody?: unknown) => ({
  words: Array.from({ length: n }, (_, i) => word(i)),
  language: 'en',
  ranOn: 'device',
  timingQuality: 'word',
  cleaned: true,
  ...(prosody === undefined ? {} : { prosody }),
});
const prosody = (stress: unknown[], pauses: unknown[] = []) => ({ v: 1, stress, pauses });

describe('transcript prosody', () => {
  it('still parses without prosody', () => {
    const r = TranscriptSchema.safeParse(transcript(3));
    expect(r.success).toBe(true);
    expect(r.data?.prosody).toBeUndefined();
  });

  it('accepts stress with one integer 0..100 per word', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 40 }), (stress) => {
        const t = transcript(stress.length, prosody(stress, [{ startMs: 0, endMs: 300 }]));
        expect(TranscriptSchema.safeParse(t).success).toBe(true);
      }),
    );
  });

  it('rejects a stress length that differs from the word count', () => {
    fc.assert(
      fc.property(fc.nat({ max: 20 }), fc.nat({ max: 20 }), (words, stressLen) => {
        fc.pre(words !== stressLen);
        const t = transcript(words, prosody(Array(stressLen).fill(50)));
        const r = TranscriptSchema.safeParse(t);
        expect(r.success).toBe(false);
        expect(r.error?.issues.some((i) => i.path.join('.') === 'prosody.stress')).toBe(true);
      }),
    );
  });

  it('rejects stress outside 0..100 or non-integer', () => {
    for (const bad of [-1, 101, 50.5, Number.NaN]) {
      expect(TranscriptSchema.safeParse(transcript(2, prosody([10, bad]))).success).toBe(false);
    }
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ min: 101, max: 10_000 }), fc.integer({ min: -10_000, max: -1 })),
        (bad) => !TranscriptSchema.safeParse(transcript(1, prosody([bad]))).success,
      ),
    );
  });

  it('rejects a wrong version and bad pauses', () => {
    expect(TranscriptSchema.safeParse(transcript(1, { ...prosody([5]), v: 2 })).success).toBe(
      false,
    );
    expect(
      TranscriptSchema.safeParse(transcript(1, prosody([5], [{ startMs: -1, endMs: 5 }]))).success,
    ).toBe(false);
    expect(
      TranscriptSchema.safeParse(transcript(1, prosody([5], [{ startMs: 1.5, endMs: 400 }])))
        .success,
    ).toBe(false);
  });
});
