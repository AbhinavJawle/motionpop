import { sceneTiming, type CompileInput, type CompileSlot } from '@motionpop/motion/compiler';
import { editorialExplainer, stylePacks } from '@motionpop/motion/styles';
import type { EditorProject, Slot } from '@motionpop/schemas';
import { componentFor, isScene } from '../motion/registry';

/** A ready slot whose component (or scene) exists and whose params parse is rendered. */
export function isRenderable(slot: Slot): boolean {
  if (slot.status !== 'ready') return false;
  const c = componentFor(slot.componentId);
  return c !== undefined && c.params.safeParse(slot.params).success;
}

export function styleFor(project: Pick<EditorProject, 'styleId'>) {
  return stylePacks[project.styleId] ?? editorialExplainer;
}

/** One slot for the compiler. Scenes also get the voice: words, stress and pauses (spec 07). */
export function compileSlot(slot: Slot, transcript: EditorProject['transcript']): CompileSlot {
  const base: CompileSlot = {
    id: slot.id,
    startMs: slot.startMs,
    endMs: slot.endMs,
    componentId: slot.componentId,
    params: slot.params,
  };
  if (!isScene(slot.componentId)) return base;
  const t = sceneTiming(slot, transcript);
  return {
    ...base,
    ...(t.words ? { words: t.words } : {}),
    ...(t.stress ? { stress: t.stress } : {}),
    ...(t.pauses ? { pauses: t.pauses } : {}),
    ...(slot.energy ? { energy: slot.energy } : {}),
  };
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
    ...(project.energy ? { energy: project.energy } : {}),
    mode: 'preview',
    slots: project.slots.filter(isRenderable).map((s) => compileSlot(s, project.transcript)),
  };
}
