import type { Slot } from '@motionpop/schemas';
import { applyVersion } from '@/lib/commands';
import { sceneFor, schemaFor } from '@/lib/motion/registry';
import { sceneGate } from '@/lib/slots/scene-fill';
import { newVersion } from '@/lib/slots/new-version';
import type { EditorStore } from '@/lib/stores/editor';
import { setField } from './content-form';

export const GATE_WARNING = 'This may not fit. Try a quick edit.';

export type CommitResult =
  { ok: true; changed: boolean; warning: string | null } | { ok: false; error: string };

/**
 * Commits one CONTENT field (spec 09 R2.2 to R2.4). The new params are parsed with the slot's
 * schema: a failure changes nothing and returns the schema's message for the field's error state.
 * A pass becomes one `user` version and one undo step. A scene whose gates object to the new
 * content is still applied (the user decides) and comes back with a warning.
 */
export function commitField(
  store: EditorStore,
  slotId: string,
  field: { path: string; label: string },
  value: unknown,
  opts: {
    now?: number;
    doc?: Document;
    /** Replaces the scene gate check (tests). */
    check?: (params: unknown) => string | null;
  } = {},
): CommitResult {
  const project = store.getState().project;
  const slot: Slot | undefined = project?.slots.find((s) => s.id === slotId);
  if (!project || !slot) return { ok: false, error: 'This graphic is gone.' };
  const schema = schemaFor(slot.componentId);
  if (!schema) return { ok: false, error: 'This graphic isn’t available yet.' };

  const next = setField(slot.params, field.path, value);
  if (JSON.stringify(next) === JSON.stringify(slot.params)) {
    return { ok: true, changed: false, warning: null };
  }
  const parsed = schema.safeParse(next);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: (issue?.message ?? 'That value doesn’t fit.').slice(0, 160) };
  }
  const params = parsed.data as Record<string, unknown>;
  // Parsing can fill defaults; nothing changed for the user then.
  if (JSON.stringify(params) === JSON.stringify(slot.params)) {
    return { ok: true, changed: false, warning: null };
  }

  const scene = sceneFor(slot.componentId);
  const warning = scene
    ? (opts.check ?? sceneGate(scene, project, slot, opts.doc).check)(params) === null
      ? null
      : GATE_WARNING
    : null;

  const version = newVersion({
    slotId,
    componentId: slot.componentId,
    params,
    timing: slot.timing,
    source: 'user',
    label: `Edited ${field.label.toLowerCase()}`,
    now: opts.now ?? Date.now(),
  });
  const ok = store.getState().exec(applyVersion(slotId, { params, timing: slot.timing, version }));
  return ok ? { ok: true, changed: true, warning } : { ok: false, error: 'Couldn’t apply that.' };
}
