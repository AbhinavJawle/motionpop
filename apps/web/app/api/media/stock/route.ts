import { NextResponse } from 'next/server';
import {
  fetchAllowlistedStockMedia,
  isAllowedStockProxyHost,
  MAX_STOCK_PROXY_BYTES,
  searchPexels,
  searchPixabay,
  searchWikimediaCommons,
  type StockMediaItem,
} from '@/lib/media/stock.server';

export type { StockMediaItem };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stock B-roll & editorial photo resolver (spec 23 R6.1):
 * - Searches Pixabay first (HD videos & photos with 24 h cache when `PIXABAY_API_KEY` is configured)
 * - Falls back to Pexels (if `PEXELS_API_KEY` is configured), then zero-key Wikimedia Commons
 * - Supports allowlisted binary proxy (`?proxy=<url>`) so clips are saved locally in IndexedDB
 *   with zero permanent hotlinking.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const proxyUrl = searchParams.get('proxy');

  if (proxyUrl) {
    let parsed: URL;
    try {
      parsed = new URL(proxyUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid proxy URL' }, { status: 400 });
    }
    if (parsed.protocol !== 'https:' || !isAllowedStockProxyHost(parsed.hostname)) {
      return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }
    try {
      const upstream = await fetchAllowlistedStockMedia(parsed);
      if (!upstream) {
        return NextResponse.json({ error: 'Redirect host not allowed' }, { status: 403 });
      }
      if (!upstream.ok || !upstream.body) {
        return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 });
      }
      const len = Number(upstream.headers.get('content-length') ?? 0);
      if (len > MAX_STOCK_PROXY_BYTES) {
        return NextResponse.json({ error: 'Media too large' }, { status: 413 });
      }
      const buf = await upstream.arrayBuffer();
      if (buf.byteLength > MAX_STOCK_PROXY_BYTES) {
        return NextResponse.json({ error: 'Media too large' }, { status: 413 });
      }
      const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } catch {
      return NextResponse.json({ error: 'Proxy request failed' }, { status: 502 });
    }
  }

  const q = (searchParams.get('q') ?? '').trim().slice(0, 100);
  if (!q) return NextResponse.json({ items: [] });

  const kind = searchParams.get('kind') === 'photo' ? 'photo' : 'video';
  const orientationParam = searchParams.get('orientation');
  const orientation: 'portrait' | 'landscape' | 'square' =
    orientationParam === 'landscape' || orientationParam === 'square'
      ? orientationParam
      : 'portrait';
  const limit = Math.max(1, Math.min(12, Number(searchParams.get('limit') ?? 4) || 4));
  const pixabayKey = process.env.PIXABAY_API_KEY?.trim();
  const pexelsKey = process.env.PEXELS_API_KEY?.trim();

  let items: StockMediaItem[] = [];
  if (pixabayKey) {
    items = await searchPixabay(q, kind, orientation, limit, pixabayKey).catch(() => []);
    if (items.length === 0 && kind === 'video') {
      items = await searchPixabay(q, 'photo', orientation, limit, pixabayKey).catch(() => []);
    }
  }
  if (items.length === 0 && pexelsKey) {
    items = await searchPexels(q, kind, orientation, limit, pexelsKey).catch(() => []);
    if (items.length === 0 && kind === 'video') {
      items = await searchPexels(q, 'photo', orientation, limit, pexelsKey).catch(() => []);
    }
  }
  if (items.length === 0) {
    items = await searchWikimediaCommons(q, limit).catch(() => []);
  }
  return NextResponse.json(
    { items },
    {
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    },
  );
}
