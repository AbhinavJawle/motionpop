import { errorResponse, HttpError, verifyRequest } from '@/lib/firebase/verify.server';
import { fetchOpenverseImage } from '@/lib/media/openverse.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/media/image?id=&thumb=1` : one open-licence picture's bytes by its Openverse id, so the
 * browser can store it (no CORS on the source sites). Thumbnails are open (they are shown as
 * plain <img> tags); full images need the signed-in caller when Firebase is configured.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const p = new URL(req.url).searchParams;
    const thumb = p.get('thumb') === '1';
    if (!thumb && process.env.NEXT_PUBLIC_FIREBASE_API_KEY) await verifyRequest(req);
    const img = await fetchOpenverseImage(p.get('id') ?? '', thumb);
    return new Response(img.bytes, {
      headers: {
        'content-type': img.type,
        'cache-control': 'private, max-age=86400',
        'x-attribution': encodeURIComponent(img.attribution),
      },
    });
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err);
    return Response.json({ error: 'image-failed' }, { status: 502 });
  }
}
