import { z } from 'zod';
import { errorResponse, HttpError, verifyRequest } from '@/lib/firebase/verify.server';
import { MediaRateLimited, searchOpenverse } from '@/lib/media/openverse.server';
import { renderMode } from '@/lib/renders/mode.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Q = z.string().trim().min(2).max(80);

/**
 * `GET /api/media/search?q=` : open-licence pictures (CC0, CC BY) for the Media panel. Signed in
 * with App Check outside offline mode.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    if (renderMode() !== 'offline') await verifyRequest(req);
    const q = Q.safeParse(new URL(req.url).searchParams.get('q') ?? '');
    if (!q.success) throw new HttpError(400, 'Search for 2–80 characters');
    return Response.json({ results: await searchOpenverse(q.data) });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err);
    // Spec 07c: callers (first-load pictures) stop on 429 instead of retrying.
    if (err instanceof MediaRateLimited)
      return Response.json({ error: 'rate-limited' }, { status: 429 });
    return Response.json({ error: 'search-failed' }, { status: 502 });
  }
}
