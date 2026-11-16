import 'server-only';
import { loadShare } from '@motionpop/render/store';
import { adminDb } from '@/lib/firebase/admin.server';
import type { RenderMode } from './mode';
import type { SharePageDeps } from './share-page.server';
import { bucket } from './storage.server';

/**
 * The share page's reads (R5.4): the share and its render through Admin, and the video URL. Cloud
 * mode signs a URL for the object; the Storage emulator can't check signatures, so there the page
 * points at `/api/shares/{id}/video`, which streams the object.
 */
export function sharePageDeps(mode: RenderMode): SharePageDeps {
  const db = adminDb();
  return {
    load: (shareId) => loadShare(db, shareId),
    videoUrl: async (shareId, path, ttlMs) => {
      if (mode !== 'cloud') return `/api/shares/${shareId}/video`;
      const [url] = await bucket()
        .file(path)
        .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + ttlMs });
      return url;
    },
  };
}
