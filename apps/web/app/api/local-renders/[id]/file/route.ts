import { readFile } from 'node:fs/promises';
import { contentDisposition } from '@motionpop/render';
import { localFile } from '@/lib/renders/local-handlers.server';
import { localBlobs, localDeps } from '@/lib/renders/deps.server';
import { offlineOnly } from '@/lib/renders/mode.server';
import { renderRouteError } from '@/lib/renders/route-support.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/local-renders/{id}/file` (offline mode only): the finished video, as a download. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const blocked = offlineOnly();
    if (blocked) return blocked;
    const { id } = await ctx.params;
    const doc = await localFile(await localDeps(), id);
    if (!doc?.outputPath) return new Response('Not found', { status: 404 });
    const bytes = await readFile((await localBlobs()).localPath(doc.outputPath));
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': 'video/mp4',
        'content-disposition': contentDisposition(doc.title),
        'cache-control': 'private, no-store',
      },
    });
  } catch (err) {
    return renderRouteError(err);
  }
}
