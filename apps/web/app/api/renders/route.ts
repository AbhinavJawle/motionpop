import { apiError, createRender } from '@/lib/renders/handlers.server';
import { createDeps } from '@/lib/renders/deps.server';
import { renderMode } from '@/lib/renders/mode.server';
import { readBodyText, renderRouteError, respond } from '@/lib/renders/route-support.server';
import { verifyRequest } from '@/lib/firebase/verify.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/renders` (spec 08 design §3 step 3): validate the request, charge once, store the
 * snapshot and start the job. Offline mode has its own routes (`/api/local-renders`), so here
 * it answers 404.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const mode = renderMode();
    if (mode === 'offline') return new Response('Not found', { status: 404 });
    const caller = await verifyRequest(req);
    const body = await readBodyText(req);
    if ('tooLarge' in body) return respond(apiError('too-large'));
    return respond(await createRender(createDeps(mode), caller.uid, body.text));
  } catch (err) {
    return renderRouteError(err);
  }
}
