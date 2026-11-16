import type { Slot } from '@motionpop/schemas';
import { produce } from 'immer';
import { CommandRejected, type Command } from './command';
import { findSlot } from './slot-helpers';

export const PROMPT_MAX = 500;

/** Saves the slot's prompt (trimmed, at most 500 characters). Unchanged text is rejected: no undo step. */
export function setSlotPrompt(slotId: string, prompt: string): Command {
  let before: string | undefined;
  return {
    label: 'Edit prompt',
    do(p) {
      const s = findSlot(p, slotId);
      const next = prompt.trim();
      if (next.length > PROMPT_MAX) {
        throw new CommandRejected(`the prompt is longer than ${PROMPT_MAX} characters`);
      }
      if (next === s.prompt) throw new CommandRejected('the prompt is unchanged');
      before = s.prompt;
      return produce(p, (d) => {
        const target = d.slots.find((x) => x.id === slotId);
        if (target) target.prompt = next;
      });
    },
    undo(p) {
      const prev = before;
      if (prev === undefined) return p;
      return produce(p, (d) => {
        const target = d.slots.find((x) => x.id === slotId);
        if (target) target.prompt = prev;
      });
    },
  };
}

/**
 * A failed Generate on a slot that had no graphic yet: persisted `status: 'failed'` with the
 * error ("Couldn't generate"), so the card shows Retry and "Use a template". Undo restores it.
 */
export function markFailed(slotId: string, error: string): Command {
  let before: Slot | undefined;
  return {
    label: 'Mark failed',
    do(p) {
      before = findSlot(p, slotId);
      const message = error.trim().slice(0, 200) || "Couldn't generate";
      return produce(p, (d) => {
        const target = d.slots.find((x) => x.id === slotId);
        if (!target) return;
        target.status = 'failed';
        target.error = message;
      });
    },
    undo(p) {
      const prev = before;
      if (!prev) return p;
      return produce(p, (d) => {
        const i = d.slots.findIndex((x) => x.id === prev.id);
        if (i >= 0) d.slots[i] = prev;
      });
    },
  };
}
