import { readTimeMs } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { MIN_GAP_MS, scheduleBeats } from './beats';

describe('scheduleBeats with a spanning cue (word-by-word text)', () => {
  const base = {
    words: [{ startMs: 500, endMs: 700 }],
    anchors: [{ cue: 'line', word: 0 }],
    durationMs: 8000,
    enterMs: 400,
    exitMs: 300,
  };

  it('makes the next unanchored cue wait for the span, and reads the last words after it', () => {
    const plan = scheduleBeats({
      ...base,
      cues: [
        { id: 'line', words: 10, spanMs: 2700 },
        { id: 'sub', words: 4 },
      ],
    });
    const [line, sub] = plan.cues;
    expect(line!.landMs).toBe(500);
    expect(sub!.startMs).toBeGreaterThanOrEqual(500 + 2700 + MIN_GAP_MS);
    // Quiet until the span ends plus the read time of the last three words.
    expect(plan.quiet[0]).toEqual({
      cue: 'line',
      startMs: 500,
      endMs: 500 + Math.max(readTimeMs(10), 2700 + readTimeMs(3)),
    });
  });

  it('drops an optional spanning cue that cannot finish before the exit', () => {
    const plan = scheduleBeats({
      ...base,
      durationMs: 2500,
      cues: [{ id: 'line', words: 10, spanMs: 2700, optional: true }],
    });
    expect(plan.dropped).toEqual(['line']);
  });
});
