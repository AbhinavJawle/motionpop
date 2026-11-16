import { applyVersion, deleteSlot, duplicateSlot } from '@/lib/commands';
import { newVersion } from '@/lib/slots/new-version';
import { templateParams } from '@/lib/slots/template';
import type { EditorStore } from '@/lib/stores/editor';

/** The ⋯ menu's three actions (spec 09 R1.2). Each is one undoable command; none throws. */

/** ⌘D: copies the slot into the next free gap and selects the copy. */
export function duplicateSlotAction(store: EditorStore, slotId: string, now = Date.now()): boolean {
  const s = store.getState();
  const newId = `slot-${now.toString(36)}`;
  const ok = s.exec(duplicateSlot(slotId, newId));
  if (ok) s.select(newId);
  return ok;
}

export function deleteSlotAction(store: EditorStore, slotId: string): boolean {
  return store.getState().exec(deleteSlot(slotId));
}

export type TemplateOutcome = 'applied' | 'unavailable' | 'rejected';

/**
 * "Use a template" (R6.9): the scene's safe default from the spoken words, or the component's
 * defaults, as a version with `source: 'default'`. Free. `unavailable` when the graphic has no
 * template (a component that is not built yet), so the UI can say so.
 */
export function applyTemplateAction(
  store: EditorStore,
  slotId: string,
  doc?: Document,
  now = Date.now(),
): TemplateOutcome {
  const s = store.getState();
  const project = s.project;
  const slot = project?.slots.find((x) => x.id === slotId);
  if (!project || !slot) return 'rejected';
  const params = templateParams(project, slot, doc);
  if (!params) return 'unavailable';
  const version = newVersion({
    slotId,
    componentId: slot.componentId,
    params,
    source: 'default',
    label: 'Template',
    now,
  });
  // A template resets the feel too: no timing overrides.
  return s.exec(applyVersion(slotId, { params, version })) ? 'applied' : 'rejected';
}
