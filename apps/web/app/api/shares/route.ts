import { CreateShareRequestSchema } from '@motionpop/schemas';
import { apiError, createShareLink } from '@/lib/renders/handlers.server';
import { shareDeps } from '@/lib/renders/deps.server';
import { renderMode } from '@/lib/renders/mode.server';
import {
  originOf,
  readBodyText,
  renderRouteError,
  respond,
} from '@/lib/renders/route-support.server';
import { verifyRequest } from '@/lib/firebase/verify.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `POST /api/shares { renderId }` (R5.3): the owner of a finished render gets its share id and
 * link, made once and reused. 404 for a missing render and for someone else's alike.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    if (renderMode() === 'offline') return new Response('Not found', { status: 404 });
    const caller = await verifyRequest(req);
    const body = await readBodyText(req, 1000);
    if ('tooLarge' in body) return respond(apiError('too-large'));
    let raw: unknown;
    try {
      raw = JSON.parse(body.text);
    } catch {
      return respond(apiError('invalid'));
    }
    const parsed = CreateShareRequestSchema.safeParse(raw);
    if (!parsed.success) return respond(apiError('invalid'));
    return respond(
      await createShareLink(shareDeps(), caller.uid, parsed.data.renderId, originOf(req)),
    );
  } catch (err) {
    return renderRouteError(err);
  }
}
