import { errorResponse, HttpError, verifyRequest } from '@/lib/firebase/verify.server';
import { fetchOpenverseImage } from '@/lib/media/openverse.server';
import { renderMode } from '@/lib/renders/mode.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/media/image?id=&thumb=1` : one open-licence picture's bytes by its Openverse id, so the
 * browser can store it (no CORS on the source sites). Thumbnails are open (they are shown as
 * plain <img> tags); full images need the signed-in caller outside offline mode.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const p = new URL(req.url).searchParams;
    const thumb = p.get('thumb') === '1';
    if (!thumb && renderMode() !== 'offline') await verifyRequest(req);
    const img = await fetchOpenverseImage(p.get('id') ?? '', thumb);
    return new Response(img.bytes, {
      headers: {
        'content-type': img.type,
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cache-control': 'private, max-age=86400',
        'x-attribution': encodeURIComponent(img.attribution),
      },
    });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err);
    return Response.json({ error: 'image-failed' }, { status: 502 });
  }
}
