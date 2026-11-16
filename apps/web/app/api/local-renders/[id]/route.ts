import { localStatus } from '@/lib/renders/local-handlers.server';
import { localDeps } from '@/lib/renders/deps.server';
import { offlineOnly } from '@/lib/renders/mode.server';
import { renderRouteError, respond } from '@/lib/renders/route-support.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `GET /api/local-renders/{id}` (offline mode only): the render's status, polled every 500 ms. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const blocked = offlineOnly();
    if (blocked) return blocked;
    const { id } = await ctx.params;
    return respond(await localStatus(await localDeps(), id));
  } catch (err) {
    return renderRouteError(err);
  }
}
