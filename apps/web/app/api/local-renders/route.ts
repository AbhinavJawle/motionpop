import { apiError } from '@/lib/renders/handlers.server';
import { createLocalRender } from '@/lib/renders/local-handlers.server';
import { localDeps } from '@/lib/renders/deps.server';
import { offlineOnly } from '@/lib/renders/mode.server';
import { renderRouteError, respond } from '@/lib/renders/route-support.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/local-renders` (offline mode only, R7.3): multipart `request` (the render request
 * without a voice path, as JSON text) and `voice` (the audio file). Renders in this process.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const blocked = offlineOnly();
    if (blocked) return blocked;
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return respond(apiError('invalid'));
    }
    const request = form.get('request');
    const voice = form.get('voice');
    const video = form.get('video');
    if (typeof request !== 'string') return respond(apiError('invalid'));
    const file = voice instanceof File ? voice : null;
    const videoFile = video instanceof File ? video : null;
    const clips: Record<string, { type: string; size: number; bytes: Buffer }> = {};
    const overlays: Record<string, { type: string; size: number; bytes: Buffer }> = {};
    const audio: Record<string, { type: string; size: number; bytes: Buffer }> = {};
    for (const [key, val] of form.entries()) {
      if (!(val instanceof File)) continue;
      if (key.startsWith('mediaClip:')) {
        clips[key.slice('mediaClip:'.length)] = {
          type: val.type,
          size: val.size,
          bytes: Buffer.from(await val.arrayBuffer()),
        };
      } else if (key.startsWith('stockOv:')) {
        overlays[key.slice('stockOv:'.length)] = {
          type: val.type,
          size: val.size,
          bytes: Buffer.from(await val.arrayBuffer()),
        };
      } else if (key.startsWith('stockAu:')) {
        audio[key.slice('stockAu:'.length)] = {
          type: val.type,
          size: val.size,
          bytes: Buffer.from(await val.arrayBuffer()),
        };
      }
    }
    return respond(
      await createLocalRender(
        await localDeps(),
        request,
        file
          ? { type: file.type, size: file.size, bytes: Buffer.from(await file.arrayBuffer()) }
          : null,
        videoFile
          ? {
              type: videoFile.type,
              size: videoFile.size,
              bytes: Buffer.from(await videoFile.arrayBuffer()),
            }
          : null,
        { clips, overlays, audio },
      ),
    );
  } catch (err) {
    return renderRouteError(err);
  }
}
