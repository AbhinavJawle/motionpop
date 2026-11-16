// The thumbnail time (spec 08 R3.5): the first rendered slot's key moment, else one second in.
// Shared by the render job (`thumb.jpg`) and the export modal's still (spec 08 task 14).
import { frameToMs, msToFrame } from '@motionpop/schemas';
import { keyMomentAbsMs } from './key-moment';
import type { CompileSlot } from './types';

const FALLBACK_MS = 1000;

/** Always inside the video: at most one frame before its end. */
export function thumbnailTimeMs(slots: readonly CompileSlot[], durationMs: number): number {
  const first = [...slots].sort((a, b) => a.startMs - b.startMs)[0];
  const wanted = first ? keyMomentAbsMs(first) : FALLBACK_MS;
  const last = Math.max(0, frameToMs(msToFrame(durationMs) - 1));
  return Math.min(Math.max(0, wanted), last);
}
