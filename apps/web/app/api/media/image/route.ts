import { errorResponse, HttpError, verifyRequest } from '@/lib/firebase/verify.server';
import { fetchOpenverseImage } from '@/lib/media/openverse.server';
import { renderMode } from '@/lib/renders/mode.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const THUMB_WINDOW_MS = 60_000;
const THUMB_MAX_PER_WINDOW = 60;
const thumbHits = new Map<string, number[]>();

function allowThumbRequest(req: Request): boolean {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip'))?.trim() || 'unknown';
  const now = Date.now();
  const recent = (thumbHits.get(ip) ?? []).filter((t) => now - t < THUMB_WINDOW_MS);
  if (recent.length >= THUMB_MAX_PER_WINDOW) {
    thumbHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  if (thumbHits.size > 2000) thumbHits.clear();
  thumbHits.set(ip, recent);
  return true;
}

/**
 * `GET /api/media/image?id=&thumb=1` : one open-licence picture's bytes by its Openverse id, so the
 * browser can store it (no CORS on the source sites). Thumbnails are rendered as plain `<img>` tags
 * (so they are per-IP rate-limited and capped at 2 MB); full images require Auth + App Check
 * outside offline mode.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const p = new URL(req.url).searchParams;
    const thumb = p.get('thumb') === '1';
    if (thumb && renderMode() !== 'offline' && !allowThumbRequest(req)) {
      return Response.json({ error: 'rate-limited' }, { status: 429 });
    }
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
