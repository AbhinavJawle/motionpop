import type { EditorProject, Slot } from '@motionpop/schemas';
import { sameSlot } from '../commands/auto-fill';

/**
 * Slots auto-fill may touch, in timeline order (spec 06 R5.1, R5.3): still `suggested`, a
 * component that can render (`canFill`), not tried yet, and unchanged since the editor loaded
 * the project (anything the user edited is theirs).
 */
export function autoFillQueue(
  project: EditorProject,
  loaded: ReadonlyMap<string, Slot>,
  tried: ReadonlySet<string>,
  canFill: (componentId: string) => boolean,
): Slot[] {
  return project.slots
    .filter((s) => {
      const original = loaded.get(s.id);
      return (
        s.status === 'suggested' &&
        !tried.has(s.id) &&
        canFill(s.componentId) &&
        original !== undefined &&
        sameSlot(s, original)
      );
    })
    .sort((a, b) => a.startMs - b.startMs);
}
