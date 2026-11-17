import { describe, expect, it, vi } from 'vitest';
import type { Router, RunOptions, RunResult } from '../router';
import type { SlotWord } from '../slots/types';
import { detectSlots, type SlotsDetectOutput } from './slots-detect';

/** 25 words in sentences of five: a long transcript for a device limit of 10. */
const WORDS: SlotWord[] = Array.from({ length: 25 }, (_, i) => ({
  text: i % 5 === 4 ? `w${i}.` : `w${i}`,
  startMs: i * 400,
  endMs: i * 400 + 350,
  filler: false,
}));

function fakeRouter(
  behaviour: (opts: RunOptions | undefined) => RunResult<SlotsDetectOutput> | Promise<never>,
) {
  const run = vi.fn(async (_task: unknown, _input: unknown, opts?: RunOptions) => behaviour(opts));
  return { router: { run } as unknown as Router, run };
}

const answer = (opts: RunOptions | undefined): RunResult<SlotsDetectOutput> => ({
  output: { slots: [] },
  ranOn: opts?.mode === 'ONLY_ON_DEVICE' ? 'device' : 'cloud',
  model: 'm',
  costCredits: 0,
  latencyMs: 5,
  attempts: 1,
  cached: false,
});

describe('detectSlots: chunked on-device detection (spec 13b R4.3)', () => {
  it('a long transcript with the device ready is detected on the device, one call per chunk', async () => {
    const { router, run } = fakeRouter(answer);
    await detectSlots(router, WORDS, [], { deviceReady: true, deviceMaxWords: 10 });
    expect(run.mock.calls.length).toBeGreaterThan(1);
    for (const [, , opts] of run.mock.calls) {
      expect(opts).toEqual({ mode: 'ONLY_ON_DEVICE' });
    }
  });

  it('each chunk sends at most the limit of words', async () => {
    const { router, run } = fakeRouter(answer);
    await detectSlots(router, WORDS, [], { deviceReady: true, deviceMaxWords: 10 });
    for (const [, input] of run.mock.calls) {
      expect((input as { words: unknown[] }).words.length).toBeLessThanOrEqual(10);
    }
  });

  it('a chunk that fails twice sends the whole transcript to the cloud', async () => {
    const { router, run } = fakeRouter((opts) => {
      if (opts?.mode === 'ONLY_ON_DEVICE') throw new Error('device failed');
      return answer(undefined);
    });
    await detectSlots(router, WORDS, [], { deviceReady: true, deviceMaxWords: 10 });
    // Two device attempts for the first chunk, then one whole-transcript call with the default mode.
    expect(run.mock.calls.map((c) => c[2])).toEqual([
      { mode: 'ONLY_ON_DEVICE' },
      { mode: 'ONLY_ON_DEVICE' },
      undefined,
    ]);
    const whole = run.mock.calls[2]?.[1] as { words: unknown[] };
    expect(whole.words.length).toBe(WORDS.length);
  });

  it('with the device not ready, the transcript goes to the router as before', async () => {
    const { router, run } = fakeRouter(answer);
    await detectSlots(router, WORDS, [], { deviceReady: false, deviceMaxWords: 10 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[2]).toBeUndefined();
  });

  it('a transcript within the limit is one call, as before', async () => {
    const { router, run } = fakeRouter(answer);
    await detectSlots(router, WORDS.slice(0, 8), [], { deviceReady: true, deviceMaxWords: 10 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[2]).toBeUndefined();
  });
});
