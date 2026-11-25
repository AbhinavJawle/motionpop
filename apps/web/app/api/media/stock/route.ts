import { NextResponse } from 'next/server';
import { errorResponse, verifyRequest } from '@/lib/firebase/verify.server';
import {
  fetchAllowlistedStockMedia,
  isAllowedStockProxyUrl,
  MAX_STOCK_PROXY_BYTES,
  parseSafeStockMime,
  readResponseBytesWithLimit,
  searchPexels,
  searchPixabay,
  searchWikimediaCommons,
  type StockMediaItem,
} from '@/lib/media/stock.server';
import { renderMode } from '@/lib/renders/mode.server';

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
  if (renderMode() !== 'offline') {
    try {
      await verifyRequest(request);
    } catch (err) {
      return errorResponse(err);
    }
  }
  const { searchParams } = new URL(request.url);
  const proxyUrl = searchParams.get('proxy');

  if (proxyUrl) {
    let parsed: URL;
    try {
      parsed = new URL(proxyUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid proxy URL' }, { status: 400 });
    }
    if (!isAllowedStockProxyUrl(parsed)) {
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
      const safeMime = parseSafeStockMime(upstream.headers.get('content-type'));
      if (!safeMime) {
        await upstream.body.cancel().catch(() => undefined);
        return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 });
      }
      const len = Number(upstream.headers.get('content-length') ?? 0);
      if (len > MAX_STOCK_PROXY_BYTES) {
        await upstream.body.cancel().catch(() => undefined);
        return NextResponse.json({ error: 'Media too large' }, { status: 413 });
      }
      const bytes = await readResponseBytesWithLimit(upstream, MAX_STOCK_PROXY_BYTES);
      if (!bytes) {
        return NextResponse.json({ error: 'Media too large' }, { status: 413 });
      }
      return new NextResponse(bytes.slice().buffer, {
        status: 200,
        headers: {
          'Content-Type': safeMime,
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Content-Disposition': 'attachment',
          'Cache-Control': 'private, max-age=86400',
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
