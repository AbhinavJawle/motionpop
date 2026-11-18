import { unavailableProviders, type StudioProviders } from '@pireel/studio-engine/providers';
import { z } from 'zod';
import { prepareStudio } from './prepare';
import { hasStudioDocument, takeStudioDocument } from './studio-store';

/**
 * Motionpop's providers for the embedded editor (spec 17, R5): projects come from Motionpop's
 * pipeline, uploads go to the development disk route. AI providers go through `packages/ai`.
 */
const uploadReply = z.object({ url: z.string().min(1), key: z.string().min(1) });

export function motionpopProviders(): StudioProviders {
  return {
    ...unavailableProviders('Coming soon in motionpop'),
    projects: {
      // The edited document from Motionpop's pipeline, once; then Pireel's local draft holds the edits.
      async load(id) {
        const waiting = await takeStudioDocument(id);
        if (waiting) return waiting;
        if (await hasStudioDocument(id)) return null;
        // Opened straight from a link: build it now if this browser has the project's video.
        if (await prepareStudio(id).catch(() => false)) return takeStudioDocument(id);
        return null;
      },
      save: async () => 'skip',
      remove: async () => undefined,
    },
    uploads: {
      async upload(blob, opts) {
        const r = await fetch('/api/local-assets', {
          method: 'POST',
          headers: { 'content-type': opts.contentType || blob.type || 'application/octet-stream' },
          body: blob,
        });
        const json: unknown = await r.json().catch(() => ({}));
        const parsed = uploadReply.safeParse(json);
        if (!r.ok || !parsed.success) throw new Error(`Upload failed (${r.status})`);
        return parsed.data;
      },
    },
  };
}
