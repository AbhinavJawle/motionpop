import { logoSlugs, splitLogoQuery } from '@motionpop/motion/reel-query';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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
  const parsed = QuerySchema.safeParse(new URL(request.url).searchParams.get('q') ?? '');
  if (!parsed.success) return NextResponse.json({ error: 'Bad query' }, { status: 400 });
  const q = parsed.data;
  for (const slug of logoSlugs(q)) {
    const r = await get(`${ICON_CDN}${encodeURIComponent(slug)}`);
    const type = r?.headers.get('content-type') ?? '';
    if (r && type.includes('svg')) {
      const body = await r.text();
      // An SVG we pass to the browser: only a plain icon (no scripts, no external references).
      if (body.length < 60_000 && !/<script|href=["']?(?!#)|on\w+=/i.test(body)) {
        return new NextResponse(body, {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=604800',
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
    const buf = await fav.arrayBuffer();
    // The service answers unknown sites with a tiny generic globe: treat that as "no logo".
    if (buf.byteLength > 1500 && buf.byteLength < 2_000_000) {
      return new NextResponse(buf, {
        headers: {
          'Content-Type': fav.headers.get('content-type') ?? 'image/png',
          'Cache-Control': 'public, max-age=604800',
          'X-Logo-Source': 'favicon',
        },
      });
    }
  }
  return NextResponse.json({ error: 'No logo' }, { status: 404 });
}
