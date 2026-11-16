import { isImageSlot, type EditorProject, type Format, type Slot } from '@motionpop/schemas';
import { componentFor, isScene, lookFor } from '../registry';
import { sceneTiming } from './scene-timing';
import type { CompileInput, CompileSlot } from './types';

/**
 * A slot that renders in `format`: ready, its component or scene exists and supports the format,
 * its params parse, and it has no images. Image slots are left out until spec 07 stores assets
 * (spec 08 review F5). Without a format only the format check is skipped.
 */
export function isRenderable(slot: Slot, format?: Format): boolean {
  if (slot.status !== 'ready') return false;
  if (isImageSlot(slot)) return false;
  const c = componentFor(slot.componentId);
  if (c === undefined) return false;
  if (format !== undefined && !c.formats.includes(format)) return false;
  return c.params.safeParse(slot.params).success;
}

/** The look of a project (see `lookFor`). */
export function styleFor(project: Pick<EditorProject, 'styleId'>) {
  return lookFor(project.styleId);
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

export interface ProjectCompileOptions {
  /** `preview` draws a placeholder for a failed slot; `render` leaves it empty so the job fails. */
  mode: 'preview' | 'render';
  /** The frame to compile for; defaults to the project's own (an export may re-layout). */
  format?: Format;
  background?: 'style' | 'transparent';
  /**
   * Voiceover asset path for the render. The editor preview stays muted and plays the voice
   * itself as the master clock (spec 04 R5.1), so it passes none.
   */
  voiceSrc?: string;
}

/**
 * The one compile input for the editor preview and the render job (spec 08 R3.2). The two only
 * differ in `mode`, `voiceSrc` and `background`, which the caller sets.
 */
export function projectCompileInput(
  project: EditorProject,
  opts: ProjectCompileOptions,
): CompileInput {
  const format = opts.format ?? project.format;
  return {
    format,
    durationMs: project.durationMs,
    style: styleFor(project),
    ...(project.energy ? { energy: project.energy } : {}),
    mode: opts.mode,
    ...(opts.background ? { background: opts.background } : {}),
    ...(opts.voiceSrc ? { voiceSrc: opts.voiceSrc } : {}),
    slots: project.slots
      .filter((s) => isRenderable(s, format))
      .map((s) => compileSlot(s, project.transcript)),
  };
}
