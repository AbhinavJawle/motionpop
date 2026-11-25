import { logoSlugs, splitLogoQuery } from '@motionpop/motion/reel-query';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, verifyRequest } from '@/lib/firebase/verify.server';
import { readResponseBytesWithLimit } from '@/lib/media/stock.server';
import { renderMode } from '@/lib/renders/mode.server';

/**
 * Brand logos for reels (spec 26 R3.1): the speaker names a product, the reel shows its logo.
 * Nothing is bundled: the name comes from the user's own words at runtime. Tries the open icon
 * set's CDN by slug (an SVG in the brand colour), then the site's own icon through the public
 * favicon service. Only those two hosts are ever fetched; the query is a short name or domain.
 */
const QuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[\p{L}\p{N} .+&'_|/-]+$/u, 'Plain names only');

const ICON_CDN = 'https://cdn.simpleicons.org/';
const FAVICONS = 'https://www.google.com/s2/favicons';
const UA = 'Motionpop/1.0 (reel logo resolver)';
const SAFE_FAVICON_MIMES = new Set([
  'image/png',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/jpeg',
  'image/webp',
]);
const SANDBOX_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
};

async function get(url: string): Promise<Response | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    });
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (renderMode() !== 'offline') {
    try {
      await verifyRequest(request);
    } catch (err) {
      return errorResponse(err);
    }
  }
  const parsed = QuerySchema.safeParse(new URL(request.url).searchParams.get('q') ?? '');
  if (!parsed.success) return NextResponse.json({ error: 'Bad query' }, { status: 400 });
  const q = parsed.data;
  for (const slug of logoSlugs(q)) {
    const r = await get(`${ICON_CDN}${encodeURIComponent(slug)}`);
    const type = r?.headers.get('content-type') ?? '';
    if (r && type.includes('svg')) {
      const raw = await readResponseBytesWithLimit(r, 60_000);
      const body = raw ? new TextDecoder().decode(raw) : '';
      // An SVG we pass to the browser: only a plain icon (no scripts, foreignObject, or external refs).
      if (
        body.length > 0 &&
        body.length < 60_000 &&
        !/<script|<foreignObject|<animate|<set|href=["']?(?!#)|on\w+=/i.test(body)
      ) {
        return new NextResponse(body, {
          headers: {
            ...SANDBOX_HEADERS,
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'private, max-age=604800',
            'X-Logo-Source': 'icon-set',
          },
        });
      }
    }
  }
  const { name, domain } = splitLogoQuery(q);
  const host =
    domain ?? (/\.[a-z]{2,}$/i.test(name) ? name : `${logoSlugs(q)[0] ?? 'example'}.com`);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host))
    return NextResponse.json({ error: 'No logo' }, { status: 404 });
  const fav = await get(`${FAVICONS}?domain=${encodeURIComponent(host)}&sz=256`);
  if (fav) {
    const rawMime = (fav.headers.get('content-type') ?? 'image/png').split(';')[0]?.trim().toLowerCase() ?? '';
    const safeMime = SAFE_FAVICON_MIMES.has(rawMime) ? rawMime : null;
    if (!safeMime) {
      await fav.body?.cancel().catch(() => undefined);
    } else {
      const bytes = await readResponseBytesWithLimit(fav, 2_000_000);
      // The service answers unknown sites with a tiny generic globe: treat that as "no logo".
      if (bytes && bytes.byteLength > 1500) {
        return new NextResponse(bytes.slice().buffer, {
          headers: {
            ...SANDBOX_HEADERS,
            'Content-Type': safeMime,
            'Cache-Control': 'private, max-age=604800',
            'X-Logo-Source': 'favicon',
          },
        });
      }
    }
  }
  return NextResponse.json({ error: 'No logo' }, { status: 404 });
}
