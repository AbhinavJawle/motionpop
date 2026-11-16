import { readFile } from 'node:fs/promises';
import { localFile } from '@/lib/renders/local-handlers.server';
import { localBlobs, localDeps } from '@/lib/renders/deps.server';
import { offlineOnly } from '@/lib/renders/mode.server';
import { renderRouteError } from '@/lib/renders/route-support.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/local-renders/{id}/thumb` (offline mode only): the finished render's `thumb.jpg`. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const blocked = offlineOnly();
    if (blocked) return blocked;
    const { id } = await ctx.params;
    const doc = await localFile(await localDeps(), id);
    if (!doc?.thumbPath) return new Response('Not found', { status: 404 });
    const bytes = await readFile((await localBlobs()).localPath(doc.thumbPath));
    return new Response(new Uint8Array(bytes), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store' },
    });
  } catch (err) {
    return renderRouteError(err);
  }
}
