import { keyMomentAbsMs } from '@motionpop/motion/compiler';
import type { Slot } from '@motionpop/schemas';

/** Where a slot's focal element lands (absolute ms), the same moment the export still uses. */
export function slotKeyMoment(slot: Slot): number {
  return keyMomentAbsMs({
    id: slot.id,
    startMs: slot.startMs,
    endMs: slot.endMs,
    componentId: slot.componentId,
    params: slot.params,
  });
}

/**
 * The frame that best shows a finished graphic (spec 32 R4): its key moment, or later when the
 * key moment comes early (count-ups and word reveals are still building there), never in the
 * last 250 ms where exits begin.
 */
export function slotHeroMs(slot: Slot): number {
  const dur = slot.endMs - slot.startMs;
  const late = slot.startMs + Math.round(dur * 0.7);
  const lastGood = Math.max(slot.startMs, slot.endMs - 250);
  return Math.min(Math.max(slotKeyMoment(slot), late), lastGood);
}

/**
 * Spec 32 R4.1: where the editor opens when no time is asked for: the first ready graphic's key
 * moment, else the first slot's, else the start.
 */
export function openingMs(slots: readonly Slot[]): number {
  const sorted = [...slots].sort((a, b) => a.startMs - b.startMs);
  const first = sorted.find((s) => s.status === 'ready') ?? sorted[0];
  return first ? slotHeroMs(first) : 0;
}
