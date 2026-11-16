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
    if (typeof request !== 'string') return respond(apiError('invalid'));
    const file = voice instanceof File ? voice : null;
    return respond(
      await createLocalRender(
        await localDeps(),
        request,
        file
          ? { type: file.type, size: file.size, bytes: Buffer.from(await file.arrayBuffer()) }
          : null,
      ),
    );
  } catch (err) {
    return renderRouteError(err);
  }
}
