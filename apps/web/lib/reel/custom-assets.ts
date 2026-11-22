import type { ReelCustomAssets, ReelImage } from '@motionpop/motion/reel';
import type { ImageAsset } from '@motionpop/schemas';
import { getImage } from '@/lib/images/image-store';

/**
 * What AI-written reel scenes need in the editor (spec 30): the custom runtime and the reel fonts
 * (fetched once per page), and their pictures as data URLs, since a sandboxed frame has an opaque
 * origin and can't read the page's blob: URLs.
 */
let job: Promise<ReelCustomAssets | null> | null = null;

export function loadReelCustomAssets(): Promise<ReelCustomAssets | null> {
  job ??= Promise.all([
    fetch('/api/composition/reel-custom').then((r) => (r.ok ? r.text() : Promise.reject())),
    fetch('/api/composition/reel-fonts').then((r) => (r.ok ? r.text() : Promise.reject())),
  ])
    .then(([js, fontCss]) => ({ js, fontCss }))
    .catch(() => {
      job = null;
      return null;
    });
  return job;
}

/** The stored pictures `ids` as data URLs with their sizes, keyed by asset id (missing ones left out). */
export async function customPictures(
  ids: readonly string[],
  assets: readonly ImageAsset[] | undefined,
): Promise<Record<string, ReelImage>> {
  const out: Record<string, ReelImage> = {};
  for (const id of ids) {
    const a = assets?.find((x) => x.id === id && x.status === 'ready');
    const blob = a?.src ? await getImage(a.src).catch(() => null) : null;
    if (!a || !blob) continue;
    const src = await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
    if (src) out[id] = { src, w: a.width ?? 1024, h: a.height ?? 1024 };
  }
  return out;
}
