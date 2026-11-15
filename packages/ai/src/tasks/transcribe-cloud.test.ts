import fc from 'fast-check';
import { TranscriptSchema } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { createRouter, type AIProvider, type ProviderRequest, type RouterConfig } from '../router';
import {
  checkTranscription,
  hasCoarseTimings,
  toTranscript,
  transcribeCloud,
  transcribeCloudCost,
  TranscribeCloudInputSchema,
  type TranscribeCloudInput,
  type TranscribeCloudOutput,
} from './transcribe-cloud';

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  killSwitch: false,
};
const INPUT: TranscribeCloudInput = {
  audio: { mimeType: 'audio/wav', base64: 'UklGRg==' },
  durationMs: 4000,
  language: 'en',
};
const w = (text: string, startMs: number, endMs: number, conf = 0.9) => ({
  text,
  startMs,
  endMs,
  conf,
});
const GOOD = { words: [w('Um,', 100, 300), w('revenue', 400, 800), w('grew.', 850, 1200)] };

function scripted(answers: string[]): AIProvider & { calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = [];
  return {
    calls,
    generate(req) {
      calls.push(req);
      const text = answers[calls.length - 1];
      if (text === undefined) return Promise.reject(new Error('unexpected call'));
      return Promise.resolve({ text, ranOn: 'cloud' as const });
    },
  };
}
const run = (answers: string[], input = INPUT) => {
  const provider = scripted(answers);
  const router = createRouter({ provider, config: () => CONFIG });
  return { provider, result: router.run(transcribeCloud, input) };
};

describe('transcribeCloudCost', () => {
  it.each([
    [1, 1],
    [60_000, 1],
    [60_001, 2],
    [180_000, 3],
  ])('%i ms costs %i credit(s)', (ms, credits) => {
    expect(transcribeCloudCost(ms)).toBe(credits);
  });
});

describe('transcribe.cloud task', () => {
  it('returns words, sends the audio as media and charges per started minute', async () => {
    const { provider, result } = run([JSON.stringify(GOOD)], { ...INPUT, durationMs: 90_000 });
    const r = await result;
    expect(r.output.words).toHaveLength(3);
    expect(r).toMatchObject({ ranOn: 'cloud', costCredits: 2, attempts: 1 });
    const req = provider.calls[0]!;
    expect(req.mode).toBe('ONLY_IN_CLOUD');
    expect(req.thinking).toBe('LOW');
    expect(req.media).toEqual(INPUT.audio);
    expect(req.prompt).toContain('90000 ms');
  });

  it('repairs an out-of-order answer with the check message', async () => {
    const bad = { words: [w('b', 500, 900), w('a', 100, 400)] };
    const { provider, result } = run([JSON.stringify(bad), JSON.stringify(GOOD)]);
    const r = await result;
    expect(r.attempts).toBe(2);
    expect(provider.calls[1]?.prompt).toContain('before the previous word ends');
  });

  it('does not fall back to another route after two bad answers', async () => {
    const bad = JSON.stringify({ words: [] });
    const { provider, result } = run([bad, bad]);
    await expect(result).rejects.toMatchObject({ reason: 'invalid-output' });
    expect(provider.calls).toHaveLength(2);
  });

  it('rejects non-audio media and non-positive durations', () => {
    expect(
      TranscribeCloudInputSchema.safeParse({
        ...INPUT,
        audio: { mimeType: 'image/png', base64: 'A' },
      }).success,
    ).toBe(false);
    expect(TranscribeCloudInputSchema.safeParse({ ...INPUT, durationMs: 0 }).success).toBe(false);
  });
});

describe('checkTranscription', () => {
  const check = (words: TranscribeCloudOutput['words'], durationMs = 4000) =>
    checkTranscription({ words }, { ...INPUT, durationMs });
  it('accepts a valid list, and an empty list for short audio', () => {
    expect(check(GOOD.words)).toBeNull();
    expect(check([], 2000)).toBeNull();
  });
  it.each([
    ['empty for audio over 2 s', [], 'empty'],
    ['startMs >= endMs', [w('a', 100, 100)], 'startMs >= endMs'],
    ['overlap', [w('a', 100, 500), w('b', 400, 800)], 'before the previous'],
    ['out of order', [w('a', 900, 1000), w('b', 100, 200)], 'before the previous'],
    ['beyond duration + 500', [w('a', 100, 4501)], 'beyond'],
  ])('rejects %s', (_n, words, msg) => {
    expect(check(words)).toContain(msg);
  });
  it('allows an end up to durationMs + 500', () => {
    expect(check([w('a', 100, 4500)])).toBeNull();
  });
});

describe('hasCoarseTimings', () => {
  const seq = (durs: number[], gap = 0) => {
    let t = 0;
    return durs.map((d) => {
      const s = t;
      t += d + gap;
      return { startMs: s, endMs: s + d };
    });
  };
  it.each([
    ['fine word timings', seq([180, 260, 310, 220, 400, 190], 40), 3000, false],
    ['half-second rounded durations', seq([500, 1000, 500, 500, 230]), 4000, true],
    ['two rounded words of four is exactly 50 %', seq([500, 1000, 233, 217]), 4000, true],
    ['a single 500 ms word among fine ones', seq([500, 230, 310, 190]), 3000, false],
    ['median above 1.5 s', seq([1700, 1800, 1650]), 6000, true],
    ['sparse words in long audio', seq([200, 300, 250], 4000), 20_000, true],
    ['sparse words but short audio', seq([200, 300]), 4000, false],
    ['no words', [], 10_000, false],
  ])('%s', (_n, words, durationMs, coarse) => {
    expect(hasCoarseTimings(words, durationMs)).toBe(coarse);
  });
});

describe('toTranscript', () => {
  it('indexes words, flags fillers and reports cloud / word timings for fine input', () => {
    const t = toTranscript(GOOD, { durationMs: 4000, language: 'en' });
    expect(t.words.map((x) => x.i)).toEqual([0, 1, 2]);
    expect(t.words.map((x) => x.filler)).toEqual([true, false, false]);
    expect(t).toMatchObject({
      ranOn: 'cloud',
      timingQuality: 'word',
      cleaned: false,
      language: 'en',
    });
    expect(TranscriptSchema.safeParse(t).success).toBe(true);
  });
  it('marks coarse timings approx', () => {
    const coarse = {
      words: [w('a', 0, 1000), w('b', 1000, 2000), w('c', 2000, 3000), w('d', 3000, 4000)],
    };
    expect(toTranscript(coarse, { durationMs: 4000, language: 'en' }).timingQuality).toBe('approx');
  });
  it('clamps times into [0, durationMs]', () => {
    const t = toTranscript(
      { words: [w('a', 3800, 4200), w('b', 4300, 4400)] },
      { durationMs: 4000, language: 'en' },
    );
    expect(t.words.map((x) => [x.startMs, x.endMs])).toEqual([
      [3800, 4000],
      [4000, 4000],
    ]);
    expect(TranscriptSchema.safeParse(t).success).toBe(true);
  });
});

describe('toTranscript (property)', () => {
  const outputs = fc
    .record({
      durationMs: fc.integer({ min: 1, max: 600_000 }),
      steps: fc.array(
        fc.record({
          gap: fc.integer({ min: 0, max: 3000 }),
          len: fc.integer({ min: 1, max: 3000 }),
          text: fc.constantFrom('um', 'Uh,', 'hello', 'revenue.', '2020'),
          conf: fc.double({ min: 0, max: 1, noNaN: true }),
        }),
        { maxLength: 60 },
      ),
    })
    .map(({ durationMs, steps }) => {
      let t = 0;
      const words = steps.map((s) => {
        const startMs = t + s.gap;
        t = startMs + s.len;
        return { text: s.text, startMs, endMs: t, conf: s.conf };
      });
      return { durationMs, output: { words } };
    });

  it('any output that passes the check becomes a valid, monotonic, in-range transcript', () => {
    fc.assert(
      fc.property(outputs, ({ durationMs, output }) => {
        fc.pre(checkTranscription(output, { ...INPUT, durationMs }) === null);
        const t = toTranscript(output, { durationMs, language: 'en' });
        expect(TranscriptSchema.safeParse(t).success).toBe(true);
        expect(t.words).toHaveLength(output.words.length);
        let prev = 0;
        for (const x of t.words) {
          expect(x.startMs).toBeGreaterThanOrEqual(prev);
          expect(x.endMs).toBeGreaterThanOrEqual(x.startMs);
          expect(x.endMs).toBeLessThanOrEqual(durationMs);
          prev = x.endMs;
        }
      }),
    );
  });
});
