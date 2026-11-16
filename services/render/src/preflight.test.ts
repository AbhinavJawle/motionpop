import { describe, expect, it } from 'vitest';
import type { CompileSlot } from '@motionpop/motion/compiler';
import { frameToMs, msToFrame } from '@motionpop/schemas';
import { preflightSamples } from './preflight-samples';
import { thumbnailTimeMs } from './thumbnail';

const big = (id: string, startMs: number, endMs: number, keyMomentMs?: number): CompileSlot => ({
  id,
  startMs,
  endMs,
  componentId: 'big-number',
  params: { value: 40, label: 'x', decimals: 0, countFrom: 0 },
  ...(keyMomentMs !== undefined ? { keyMomentMs } : {}),
});

describe('preflightSamples', () => {
  it('samples one frame after the start, the key moment and one frame before the end', () => {
    const times = preflightSamples([big('a', 1000, 4000, 1500)]);
    expect(times).toEqual([frameToMs(msToFrame(1000) + 1), 2500, frameToMs(msToFrame(4000) - 1)]);
  });

  it('stays inside every slot, sorted, unique and whole', () => {
    const slots = [big('b', 6000, 6040, 99_999), big('a', 0, 3000, -50), big('c', 3000, 3001)];
    const times = preflightSamples(slots);
    expect(times).toEqual([...new Set(times)].sort((x, y) => x - y));
    for (const t of times) {
      expect(Number.isInteger(t)).toBe(true);
      expect(slots.some((s) => t >= s.startMs && t < s.endMs)).toBe(true);
    }
  });

  it('falls back to the middle when the params do not parse', () => {
    const bad: CompileSlot = { ...big('a', 0, 4000), params: { value: 'x' } };
    expect(preflightSamples([bad])).toContain(2000);
  });
});

describe('thumbnailTimeMs (R3.5)', () => {
  it('is the first slot’s key moment', () => {
    expect(thumbnailTimeMs([big('b', 9000, 12000), big('a', 2000, 5000, 1000)], 18_000)).toBe(3000);
  });

  it('is one second in when there are no slots, and always inside the video', () => {
    expect(thumbnailTimeMs([], 18_000)).toBe(1000);
    expect(thumbnailTimeMs([], 500)).toBe(frameToMs(msToFrame(500) - 1));
    expect(thumbnailTimeMs([big('a', 0, 4000, 4000)], 4000)).toBeLessThan(4000);
  });
});
