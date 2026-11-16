import { z } from 'zod';
import { errorResponse, HttpError, verifyRequest } from '@/lib/firebase/verify.server';
import { searchOpenverse } from '@/lib/media/openverse.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Q = z.string().trim().min(2).max(80);

/**
 * `GET /api/media/search?q=` : open-licence pictures (CC0, CC BY) for the Media panel. Signed in
 * with App Check when Firebase is configured; open in offline mode.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) await verifyRequest(req);
    const q = Q.safeParse(new URL(req.url).searchParams.get('q') ?? '');
    if (!q.success) throw new HttpError(400, 'Search for 2–80 characters');
    return Response.json({ results: await searchOpenverse(q.data) });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err);
    return Response.json({ error: 'search-failed' }, { status: 502 });
  }
}
