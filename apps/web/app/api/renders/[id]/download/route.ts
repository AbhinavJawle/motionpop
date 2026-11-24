import { Readable } from 'node:stream';
import { downloadRender } from '@/lib/renders/handlers.server';
import { bucket, downloadDeps } from '@/lib/renders/deps.server';
import { renderMode } from '@/lib/renders/mode.server';
import { renderRouteError, respond } from '@/lib/renders/route-support.server';
import { verifyRequest } from '@/lib/firebase/verify.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/renders/{id}/download` (R5.2): the owner of a finished render gets `{ url }`, a signed
 * URL valid 10 minutes that downloads under the title's filename. In emulator mode the Storage
 * emulator can't check signed URLs, so `?stream=1` streams the bytes through this route.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const mode = renderMode();
    if (mode === 'offline') return new Response('Not found', { status: 404 });
    const caller = await verifyRequest(req);
    const { id } = await ctx.params;
    const stream = new URL(req.url).searchParams.get('stream') === '1';
    const result = await downloadRender(downloadDeps(mode), caller.uid, id, { stream });
    if ('stream' in result) {
      const file = bucket().file(result.stream.path);
      return new Response(Readable.toWeb(file.createReadStream()) as ReadableStream, {
        headers: {
          'content-type': result.stream.contentType,
          'content-disposition': result.stream.disposition,
          'cache-control': 'private, no-store',
        },
      });
    }
    return respond(result);
  } catch (err) {
    return renderRouteError(err);
  }
}
