import 'server-only';
import type { Format, RenderDoc } from '@motionpop/schemas';

// What `/share/{id}` shows (spec 08 R5.4): read on the server through Admin, never by the client.
// The share holds an unguessable id and no owner data; the page shows only the title, the length,
// the format and the video through a signed URL valid for one hour.

/** How long the share page's video URL lives. */
export const SHARE_URL_TTL_MS = 60 * 60 * 1000;

export interface LoadedShareLike {
  shareId: string;
  renderId: string;
  render: RenderDoc;
}

export interface SharePageDeps {
  load: (shareId: string) => Promise<LoadedShareLike | null>;
  /** The URL the `<video>` plays: a signed URL (cloud) or the streaming route (emulator). */
  videoUrl: (shareId: string, outputPath: string, ttlMs: number) => Promise<string>;
  /** A signed URL for the render's still (cloud only), shown before the video plays. */
  posterUrl?: (path: string, ttlMs: number) => Promise<string | null>;
}

export type ShareView =
  | {
      kind: 'found';
      title: string;
      durationMs: number;
      format: Format;
      resolution: string;
      videoUrl: string;
      posterUrl?: string;
      transparent?: true;
    }
  | { kind: 'not-found' };

/** The page's view of a share: found with a signed URL, or not found (missing, revoked, not done). */
export async function loadShareView(deps: SharePageDeps, shareId: string): Promise<ShareView> {
  const loaded = await deps.load(shareId);
  const output = loaded?.render.outputPath;
  if (!loaded || !output) return { kind: 'not-found' };
  const thumb = loaded.render.thumbPath;
  const poster =
    thumb && deps.posterUrl
      ? await deps.posterUrl(thumb, SHARE_URL_TTL_MS).catch(() => null)
      : null;
  return {
    kind: 'found',
    ...(poster ? { posterUrl: poster } : {}),
    ...(loaded.render.transparent ? { transparent: true } : {}),
    title: loaded.render.title,
    durationMs: loaded.render.durationMs,
    format: loaded.render.format,
    resolution: loaded.render.resolution,
    videoUrl: await deps.videoUrl(shareId, output, SHARE_URL_TTL_MS),
  };
}
