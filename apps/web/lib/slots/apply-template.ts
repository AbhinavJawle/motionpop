import { toast } from 'sonner';
import { applyVersion } from '@/lib/commands';
import type { EditorStore } from '@/lib/stores/editor';
import { newVersion } from './new-version';
import { templateParams } from './template';

/** "Use a template" on a failed slot (R6.9): free, deterministic, a version with source `default`. */
export function applyTemplate(store: EditorStore, slotId: string, doc?: Document): boolean {
  const state = store.getState();
  const project = state.project;
  const slot = project?.slots.find((s) => s.id === slotId);
  if (!project || !slot) return false;
  const params = templateParams(project, slot, doc);
  if (!params) {
    toast('There’s no template for this graphic yet.');
    return false;
  }
  const version = newVersion({
    slotId,
    componentId: slot.componentId,
    params,
    timing: slot.timing,
    source: 'default',
    label: 'Template',
    now: Date.now(),
  });
  return state.exec(applyVersion(slotId, { params, timing: slot.timing, version }));
}
