// Which moments the preflight seeks to (spec 08 design §8). Pure, so it loads without Chrome.
import type { CompileSlot } from '@motionpop/motion/compiler';
import { frameToMs, msToFrame } from '@motionpop/schemas';
import { keyMomentAbsMs } from './key-moment';

/**
 * Times (integer ms, ascending, unique) to seek to: one frame after each slot starts, its key
 * moment, and one frame before it ends, all inside the slot.
 */
export function preflightSamples(slots: readonly CompileSlot[]): number[] {
  const times = new Set<number>();
  for (const s of slots) {
    const last = s.endMs - 1;
    const clamp = (t: number) => Math.min(Math.max(t, s.startMs), last);
    times.add(clamp(frameToMs(msToFrame(s.startMs) + 1)));
    times.add(clamp(keyMomentAbsMs(s)));
    times.add(clamp(frameToMs(msToFrame(s.endMs) - 1)));
  }
  return [...times].sort((a, b) => a - b);
}
