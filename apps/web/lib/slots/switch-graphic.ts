import { applyVersion } from '@/lib/commands';
import type { EditorStore } from '@/lib/stores/editor';
import { newVersion } from './new-version';
import { GRAPHIC_TYPES } from './graphic-types';
import { templateParams } from './template';

function mentionsType(prompt: string, componentId: string): boolean {
  const name = GRAPHIC_TYPES.find((t) => t.id === componentId)?.name.toLowerCase();
  const p = prompt.toLowerCase();
  return !!name && (p.includes(name) || p.includes(componentId.replace('-', ' ')));
}

/**
 * Turns a slot into another graphic type in one undo step: free and deterministic, with the
 * new type's content drafted from the slot's own words (its template). The creator can then
 * Generate to have the model fill it properly. False when the type has nothing to draft from.
 */
export function switchGraphic(
  store: EditorStore,
  slotId: string,
  componentId: string,
  doc?: Document,
): boolean {
  const state = store.getState();
  const project = state.project;
  const slot = project?.slots.find((s) => s.id === slotId);
  if (!project || !slot || slot.componentId === componentId) return false;
  const params = templateParams(project, { ...slot, componentId }, doc, true);
  if (!params) return false;
  const version = newVersion({
    slotId,
    componentId,
    params,
    timing: slot.timing,
    source: 'default',
    label: 'Switched type',
    now: Date.now(),
  });
  return state.exec(
    applyVersion(slotId, {
      params,
      timing: slot.timing,
      version,
      componentId,
      status: 'ready',
      // The prompt names the old type when Pip wrote it ("…hook statement for…"): clear it so
      // the box prefills again for the new type. A prompt the creator wrote is kept.
      ...(mentionsType(slot.prompt, slot.componentId) ? { prompt: '' } : {}),
    }),
  );
}
