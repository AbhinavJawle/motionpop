import {
  SlotTimingSchema,
  type EditorProject,
  type Slot,
  type SlotTiming,
} from '@motionpop/schemas';
import { CommandRejected } from './command';

export function findSlot(p: EditorProject, id: string): Slot {
  const s = p.slots.find((x) => x.id === id);
  if (!s) throw new CommandRejected(`slot "${id}" does not exist`);
  return s;
}

/** Parses timing with the schema; rejects out-of-range values. Returns undefined for no timing. */
export function parseTiming(t: SlotTiming | null | undefined): SlotTiming | undefined {
  if (t === null || t === undefined) return undefined;
  const r = SlotTimingSchema.safeParse(t);
  if (!r.success) throw new CommandRejected(`invalid timing: ${r.error.issues[0]?.message ?? ''}`);
  return r.data;
}

/** Drops unset keys; an empty object is never stored (the schema's rule), so it becomes undefined. */
export function cleanTiming(t: SlotTiming | undefined): SlotTiming | undefined {
  if (!t) return undefined;
  const out: SlotTiming = {};
  if (t.speed !== undefined) out.speed = t.speed;
  if (t.ease !== undefined) out.ease = t.ease;
  if (t.fade !== undefined) out.fade = t.fade;
  return Object.keys(out).length > 0 ? out : undefined;
}
