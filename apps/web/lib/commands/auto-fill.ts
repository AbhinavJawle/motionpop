import type { EditorProject, Slot, Version } from '@motionpop/schemas';
import { produce } from 'immer';
import { CommandRejected, type Command } from './command';

/**
 * Auto-fill result as one undo step (spec 06 R5.1): new params, a version (`ai-device`), and
 * `ready` when nothing is missing. Undo restores the slot and drops the version. Rejected if
 * the slot changed since the fill started (R5.3: never overwrite the user's edits).
 */
export function applyAutoFill(
  slotId: string,
  expected: Pick<Slot, 'params' | 'startMs' | 'endMs' | 'componentId'>,
  result: { params: Record<string, unknown>; needsInput: string[]; version: Version },
): Command {
  let before: Slot | undefined;
  return {
    label: 'Auto-fill',
    do(p: EditorProject) {
      const slot = p.slots.find((s) => s.id === slotId);
      if (!slot) throw new CommandRejected('the slot is gone');
      if (!sameSlot(slot, expected)) throw new CommandRejected('the slot was edited');
      before = slot;
      return produce(p, (d) => {
        const s = d.slots.find((x) => x.id === slotId);
        if (!s) return;
        s.params = result.params;
        s.currentVersionId = result.version.id;
        s.status = result.needsInput.length === 0 ? 'ready' : 'suggested';
        if (result.needsInput.length > 0) s.needsInput = result.needsInput;
        else delete s.needsInput;
        d.versions.push(result.version);
      });
    },
    undo(p: EditorProject) {
      const prev = before;
      if (!prev) return p;
      return produce(p, (d) => {
        const i = d.slots.findIndex((x) => x.id === slotId);
        if (i >= 0) d.slots[i] = prev;
        d.versions = d.versions.filter((v) => v.id !== result.version.id);
      });
    },
  };
}

export function sameSlot(
  a: Pick<Slot, 'params' | 'startMs' | 'endMs' | 'componentId'>,
  b: Pick<Slot, 'params' | 'startMs' | 'endMs' | 'componentId'>,
): boolean {
  return (
    a.componentId === b.componentId &&
    a.startMs === b.startMs &&
    a.endMs === b.endMs &&
    JSON.stringify(a.params) === JSON.stringify(b.params)
  );
}
