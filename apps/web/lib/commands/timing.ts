import type { Slot, SlotTiming } from '@motionpop/schemas';
import { produce } from 'immer';
import { CommandRejected, type Command } from './command';
import { cleanTiming, findSlot, parseTiming } from './slot-helpers';

/**
 * Sets the slot's timing overrides (the ease picker, Fade, a quick edit that said "slower"):
 * merges `patch` over the current timing, a key set to `undefined` goes back to the look's
 * default, `null` clears everything. An empty object is never stored. A change that changes
 * nothing is rejected so it adds no undo step.
 */
export function setSlotTiming(
  slotId: string,
  patch: { [K in keyof SlotTiming]: SlotTiming[K] | undefined } | null,
): Command {
  let before: Slot['timing'] | undefined | null = null;
  return {
    label: 'Set timing',
    do(p) {
      const s = findSlot(p, slotId);
      const merged: SlotTiming = patch === null ? {} : { ...s.timing, ...patch };
      const next = cleanTiming(parseTiming(cleanTiming(merged)));
      if (JSON.stringify(next ?? null) === JSON.stringify(cleanTiming(s.timing) ?? null)) {
        throw new CommandRejected('the timing is already set that way');
      }
      before = s.timing;
      return produce(p, (d) => {
        const target = d.slots.find((x) => x.id === slotId);
        if (!target) return;
        if (next) target.timing = next;
        else delete target.timing;
      });
    },
    undo(p) {
      if (before === null) return p;
      const prev = before;
      return produce(p, (d) => {
        const target = d.slots.find((x) => x.id === slotId);
        if (!target) return;
        if (prev) target.timing = prev;
        else delete target.timing;
      });
    },
  };
}
