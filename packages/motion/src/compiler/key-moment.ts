// Moved from services/render (spec 08 task 14) so the export modal's still and the thumbnail use the
// same moment. Where each slot's focal element lands, as the runtime computes it (engine.ts): the slot's own
// key moment, else the component's default, clamped into the slot. The preflight samples it and
// the thumbnail is taken at the first slot's.
import { componentFor } from '../registry';
import type { CompileSlot } from './types';

/** Absolute time (ms from the start of the video) of a slot's key moment. */
export function keyMomentAbsMs(slot: CompileSlot): number {
  const dur = slot.endMs - slot.startMs;
  let wanted = Math.round(dur / 2);
  if (slot.keyMomentMs !== undefined) wanted = slot.keyMomentMs;
  else {
    const c = componentFor(slot.componentId);
    if (c) {
      try {
        wanted = c.keyMomentMs(c.params.parse(slot.params), dur);
      } catch {
        // Bad params fail the slot elsewhere (the preflight); the middle is a fine stand-in.
      }
    }
  }
  const local = Math.min(Math.max(Math.round(Number.isFinite(wanted) ? wanted : 0), 0), dur);
  return slot.startMs + local;
}
