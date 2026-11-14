import { components } from '@motionpop/motion';
import type { CompileInput } from '@motionpop/motion/compiler';
import { editorialExplainer, stylePacks } from '@motionpop/motion/styles';
import type { EditorProject, Slot } from '@motionpop/schemas';

/** A ready slot whose component exists and whose params parse is rendered in the preview. */
export function isRenderable(slot: Slot): boolean {
  if (slot.status !== 'ready') return false;
  const c = (components as Record<string, (typeof components)[string] | undefined>)[
    slot.componentId
  ];
  return c !== undefined && c.params.safeParse(slot.params).success;
}

export function styleFor(project: Pick<EditorProject, 'styleId'>) {
  return stylePacks[project.styleId] ?? editorialExplainer;
}

/**
 * The compiler input for the editor preview. The preview player stays muted: the editor plays
 * the voiceover itself as the master clock (spec 04 R5.1), so no `voiceSrc` here.
 */
export function previewCompileInput(project: EditorProject): CompileInput {
  return {
    format: project.format,
    durationMs: project.durationMs,
    style: styleFor(project),
    mode: 'preview',
    slots: project.slots.filter(isRenderable).map((s) => ({
      id: s.id,
      startMs: s.startMs,
      endMs: s.endMs,
      componentId: s.componentId,
      params: s.params,
    })),
  };
}
