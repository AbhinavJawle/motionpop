// Moved to packages/motion (spec 08 task 4): one compile input for the preview and the render.
import { assetsInUse, projectCompileInput } from '@motionpop/motion/compiler';
import type { ImageRef } from '@motionpop/motion';
import { imageDataUrl } from '@/lib/images/image-store';
import type { CompileInput } from '@motionpop/motion/compiler';
import type { EditorProject } from '@motionpop/schemas';

export {
  compileSlot,
  isRenderable,
  projectCompileInput,
  styleFor,
} from '@motionpop/motion/compiler';

/**
 * The compiler input for the editor preview. The preview player stays muted: the editor plays
 * the voiceover itself as the master clock (spec 04 R5.1), so no `voiceSrc` here.
 */
export function previewCompileInput(project: EditorProject): CompileInput {
  return projectCompileInput(project, {
    mode: 'preview',
    // The globe's imagery, served with CORS for the sandboxed preview (WebGL needs it).
    ...(typeof location !== 'undefined'
      ? { mapsBase: `${location.origin}/api/composition/maps/` }
      : {}),
  });
}

/** A short key of the pictures the preview needs (asset ids), so a recompile happens when they change. */
export function previewImagesKey(project: EditorProject): string {
  return assetsInUse(project)
    .map((a) => `${a.id}:${a.keyed ? 1 : 0}`)
    .join(',');
}

/**
 * The pictures for the preview, as data URLs (the composition iframe can't read the app's blob
 * URLs). A picture that can't be loaded is left out: its scene plays the image-free form.
 */
export async function previewImages(project: EditorProject): Promise<Record<string, ImageRef>> {
  const out: Record<string, ImageRef> = {};
  await Promise.all(
    assetsInUse(project).map(async (a) => {
      const url = await imageDataUrl(a.src as string).catch(() => null);
      if (url)
        out[a.id] = { src: url, width: a.width ?? 1024, height: a.height ?? 1024, keyed: a.keyed };
    }),
  );
  return out;
}
