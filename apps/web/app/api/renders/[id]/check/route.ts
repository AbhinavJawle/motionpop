import { checkRender } from '@/lib/renders/handlers.server';
import { checkDeps } from '@/lib/renders/deps.server';
import { renderMode } from '@/lib/renders/mode.server';
import { renderRouteError, respond } from '@/lib/renders/route-support.server';
import { verifyRequest } from '@/lib/firebase/verify.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/renders/{id}/check` (R4.6): the client saw no change for 45 s. Fails the render if it
 * is stalled (and refunds it) and answers its state. 404 for a missing render and for someone
 * else's alike.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (renderMode() === 'offline') return new Response('Not found', { status: 404 });
    const caller = await verifyRequest(req);
    const { id } = await ctx.params;
    return respond(await checkRender(checkDeps(), caller.uid, id));
  } catch (err) {
    return renderRouteError(err);
  }
}
