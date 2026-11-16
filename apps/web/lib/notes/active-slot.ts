import type { Slot } from '@motionpop/schemas';

/** The slot under the playhead (start inclusive, end exclusive), or null. */
export function slotAt(slots: readonly Slot[], ms: number): Slot | null {
  return slots.find((s) => s.startMs <= ms && ms < s.endMs) ?? null;
}

/** A note's time on the project timeline: it is stored relative to its slot (spec 09 D-048). */
export function noteProjectMs(slot: Pick<Slot, 'startMs'>, tMs: number): number {
  return slot.startMs + tMs;
}

/** A note made at `ms` on `slot`: relative to the slot start, never negative, an integer. */
export function noteTimeFor(slot: Pick<Slot, 'startMs' | 'endMs'>, ms: number): number {
  return Math.max(0, Math.min(slot.endMs - slot.startMs - 1, Math.round(ms - slot.startMs)));
}
