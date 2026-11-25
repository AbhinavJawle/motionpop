import { Readable } from 'node:stream';
import { parseByteRange } from '@/lib/renders/byte-range';
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
      const [meta] = await file.getMetadata();
      const total = Number(meta.size ?? 0);
      if (total > 0) {
        const range = parseByteRange(req.headers.get('range'), total);
        if (range === 'unsatisfiable') {
          return new Response(null, {
            status: 416,
            headers: {
              'content-range': `bytes */${total}`,
              'accept-ranges': 'bytes',
              'cache-control': 'private, no-store',
            },
          });
        }
        if (range) {
          return new Response(
            Readable.toWeb(file.createReadStream({ start: range.start, end: range.end })) as ReadableStream,
            {
              status: 206,
              headers: {
                'content-type': result.stream.contentType,
                'accept-ranges': 'bytes',
                'content-range': `bytes ${range.start}-${range.end}/${total}`,
                'content-length': String(range.end - range.start + 1),
                'cache-control': 'private, no-store',
              },
            },
          );
        }
      }
      return new Response(Readable.toWeb(file.createReadStream()) as ReadableStream, {
        headers: {
          'content-type': result.stream.contentType,
          'content-disposition': result.stream.disposition,
          'accept-ranges': 'bytes',
          ...(total > 0 ? { 'content-length': String(total) } : {}),
          'cache-control': 'private, no-store',
        },
      });
    }
    return respond(result);
  } catch (err) {
    return renderRouteError(err);
  }
}
