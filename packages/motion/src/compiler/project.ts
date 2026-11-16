import { DEFAULT_CAPTIONS, type EditorProject, type Format, type Slot } from '@motionpop/schemas';
import { chunkCaptions } from '../captions/chunk';
import { withBrand } from './brand';
import { componentFor, isScene, lookFor } from '../registry';
import { sceneTiming } from './scene-timing';
import type { CompileCaptions, CompileInput, CompileSlot } from './types';
import type { ImageRef } from '../contract';

/**
 * A slot that renders in `format`: ready, its component or scene exists and supports the format,
 * and its params parse. A scene whose image isn't ready plays its image-free form. Without a
 * format only the format check is skipped.
 */
export function isRenderable(slot: Slot, format?: Format): boolean {
  if (slot.status !== 'ready') return false;
  const c = componentFor(slot.componentId);
  if (c === undefined) return false;
  if (format !== undefined && !c.formats.includes(format)) return false;
  return c.params.safeParse(slot.params).success;
}

/** The look of a project (see `lookFor`), with its brand colours when it has a brand kit. */
export function styleFor(
  project: Pick<EditorProject, 'styleId'> & { brand?: EditorProject['brand'] },
) {
  return withBrand(lookFor(project.styleId), project.brand);
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
  const withTimingField: CompileSlot = slot.timing ? { ...base, timing: { ...slot.timing } } : base;
  // Scenes and custom graphics get the voice (a custom script can land beats on words).
  if (!isScene(slot.componentId) && slot.componentId !== 'custom') return withTimingField;
  const t = sceneTiming(slot, transcript);
  return {
    ...withTimingField,
    ...(t.words ? { words: t.words } : {}),
    ...(t.stress ? { stress: t.stress } : {}),
    ...(t.pauses ? { pauses: t.pauses } : {}),
    ...(slot.energy ? { energy: slot.energy } : {}),
  };
}

/**
 * A new fill (Generate, quick edit) may name a picture by subject without its asset id: point it
 * at the project's ready asset with that subject, so a repaint is never needed after an edit.
 */
export function withAssetIds(slot: Slot, assets: EditorProject['assets']): Slot {
  const images = (slot.params as { images?: unknown }).images;
  if (!Array.isArray(images) || images.length === 0 || !assets?.length) return slot;
  let changed = false;
  const next = images.map((i: unknown) => {
    if (!i || typeof i !== 'object') return i;
    const img = i as { subject?: unknown; assetId?: unknown };
    if (typeof img.assetId === 'string' || typeof img.subject !== 'string') return i;
    const subject = img.subject.trim().toLowerCase();
    const hit = assets.find(
      (a) => a.status === 'ready' && a.subject.trim().toLowerCase() === subject,
    );
    if (!hit) return i;
    changed = true;
    return { ...img, assetId: hit.id };
  });
  return changed ? { ...slot, params: { ...slot.params, images: next } } : slot;
}

/** The ready assets the compiled slots point at (what the preview and render must load). */
export function assetsInUse(
  project: Pick<EditorProject, 'slots' | 'assets'>,
): NonNullable<EditorProject['assets']> {
  const ids = new Set<string>();
  for (const s of project.slots) {
    const images = (withAssetIds(s, project.assets).params as { images?: unknown }).images;
    if (Array.isArray(images))
      for (const i of images) {
        const id = (i as { assetId?: unknown } | null)?.assetId;
        if (typeof id === 'string') ids.add(id);
      }
  }
  return (project.assets ?? []).filter((a) => a.status === 'ready' && a.src && ids.has(a.id));
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
  /** The render's mixed bed (effects and music); the editor plays its own, so it passes none. */
  bedSrc?: string;
  /** Burn in captions; defaults to the project's own setting (spec 12 R3). */
  captions?: boolean;
  /** Ready images by asset id: data URLs in the preview, asset paths in the render. */
  images?: Record<string, ImageRef>;
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
  const slots = project.slots
    .filter((s) => isRenderable(s, format))
    .map((s) => compileSlot(withAssetIds(s, project.assets), project.transcript));
  return {
    format,
    durationMs: project.durationMs,
    style: styleFor(project),
    ...(project.energy ? { energy: project.energy } : {}),
    mode: opts.mode,
    ...(opts.background ? { background: opts.background } : {}),
    ...(opts.voiceSrc ? { voiceSrc: opts.voiceSrc } : {}),
    ...(opts.bedSrc ? { bedSrc: opts.bedSrc } : {}),
    ...captionsFor(project, format, opts.captions, slots),
    ...(opts.images && Object.keys(opts.images).length ? { images: opts.images } : {}),
    slots,
  };
}

/**
 * Scenes that put the spoken words on screen themselves. Captions step aside while one shows,
 * so the viewer never reads the same line twice (founder QA, 2026-11-16).
 */
export const VERBATIM_SCENES: ReadonlySet<string> = new Set([
  'hook-statement',
  'quote',
  'kinetic-headline',
  // A custom graphic fills the frame with its own text (spec 15).
  'custom',
]);

/** The caption groups for a format, computed from the transcript every time (spec 12 R4.5). */
function captionsFor(
  project: EditorProject,
  format: Format,
  override: boolean | undefined,
  slots: readonly CompileSlot[],
): { captions: CompileCaptions } | Record<string, never> {
  const setting = project.captions ?? DEFAULT_CAPTIONS;
  if (!(override ?? setting.enabled)) return {};
  const verbatim = slots.filter((s) => VERBATIM_SCENES.has(s.componentId));
  const groups = chunkCaptions(project.transcript.words, {
    format,
    presetId: setting.presetId,
    ...(project.transcript.prosody ? { stress: project.transcript.prosody.stress } : {}),
  }).filter((g) => !verbatim.some((s) => g.openMs < s.endMs && g.closeMs > s.startMs));
  return groups.length ? { captions: { presetId: setting.presetId, groups } } : {};
}
