import { readFile } from 'node:fs/promises';
import { contentDisposition } from '@motionpop/render';
import { renderContainerFor, renderMimeType } from '@motionpop/schemas';
import { parseByteRange } from '@/lib/renders/byte-range';
import { localFile } from '@/lib/renders/local-handlers.server';
import { localBlobs, localDeps } from '@/lib/renders/deps.server';
import { offlineOnly } from '@/lib/renders/mode.server';
import { renderRouteError } from '@/lib/renders/route-support.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/local-renders/{id}/file` (offline mode only): the finished video, supporting Range requests for inline `<video>` scrubbing. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const blocked = offlineOnly();
    if (blocked) return blocked;
    const { id } = await ctx.params;
    const doc = await localFile(await localDeps(), id);
    if (!doc?.outputPath) return new Response('Not found', { status: 404 });
    const container = renderContainerFor(doc);
    const mime = renderMimeType(container);
    const bytes = await readFile((await localBlobs()).localPath(doc.outputPath));
    const total = bytes.byteLength;
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
      const slice = bytes.subarray(range.start, range.end + 1);
      return new Response(new Uint8Array(slice), {
        status: 206,
        headers: {
          'content-type': mime,
          'accept-ranges': 'bytes',
          'content-range': `bytes ${range.start}-${range.end}/${total}`,
          'content-length': String(slice.byteLength),
          'cache-control': 'private, no-store',
        },
      });
    }
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': mime,
        'content-disposition': contentDisposition(doc.title, container),
        'accept-ranges': 'bytes',
        'content-length': String(total),
        'cache-control': 'private, no-store',
      },
    });
  } catch (err) {
    return renderRouteError(err);
  }
}
