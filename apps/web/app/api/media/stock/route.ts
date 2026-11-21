import { NextResponse } from 'next/server';

const ALLOWED_PROXY_HOSTS = new Set([
  'images.pexels.com',
  'videos.pexels.com',
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
]);

const MAX_PROXY_BYTES = 28 * 1024 * 1024;
const USER_AGENT = 'Motionpop/1.0 (+https://motionpop.app; editorial reel stock resolver)';

export interface StockMediaItem {
  id: string;
  provider: 'pexels' | 'wikimedia';
  kind: 'video' | 'photo';
  url: string;
  previewUrl: string;
  mimeType: string;
  width: number;
  height: number;
  durationMs?: number;
  title: string;
  attribution: string;
}

async function searchPexels(
  query: string,
  kind: 'video' | 'photo',
  orientation: 'portrait' | 'landscape' | 'square',
  limit: number,
  apiKey: string,
): Promise<StockMediaItem[]> {
  const endpoint =
    kind === 'video'
      ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${limit}`
      : `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation}&per_page=${limit}`;
  const res = await fetch(endpoint, {
    headers: { Authorization: apiKey, 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Record<string, unknown>;

  if (kind === 'video') {
    const videos = Array.isArray(data['videos']) ? data['videos'] : [];
    const out: StockMediaItem[] = [];
    for (const raw of videos) {
      if (!raw || typeof raw !== 'object') continue;
      const v = raw as {
        id?: number;
        duration?: number;
        image?: string;
        user?: { name?: string };
        video_files?: { link?: string; file_type?: string; width?: number; height?: number }[];
      };
      const files = (v.video_files ?? []).filter(
        (f) => f.link && f.file_type === 'video/mp4' && (f.width ?? 0) <= 1920,
      );
      // Prefer ~720p–1080p MP4 for crisp quality without huge download size.
      files.sort((a, b) => Math.abs((a.width ?? 0) - 1080) - Math.abs((b.width ?? 0) - 1080));
      const best = files[0];
      if (!best?.link) continue;
      out.push({
        id: `pexels-v-${v.id ?? out.length}`,
        provider: 'pexels',
        kind: 'video',
        url: best.link,
        previewUrl: v.image ?? best.link,
        mimeType: 'video/mp4',
        width: best.width ?? 720,
        height: best.height ?? 1280,
        durationMs: Math.max(2000, Math.round((v.duration ?? 6) * 1000)),
        title: query,
        attribution: `Pexels · ${v.user?.name ?? 'Creator'}`,
      });
    }
    return out;
  }

  const photos = Array.isArray(data['photos']) ? data['photos'] : [];
  const out: StockMediaItem[] = [];
  for (const raw of photos) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as {
      id?: number;
      width?: number;
      height?: number;
      alt?: string;
      photographer?: string;
      src?: { large2x?: string; large?: string; medium?: string };
    };
    const url = p.src?.large2x ?? p.src?.large ?? p.src?.medium;
    if (!url) continue;
    out.push({
      id: `pexels-p-${p.id ?? out.length}`,
      provider: 'pexels',
      kind: 'photo',
      url,
      previewUrl: p.src?.medium ?? url,
      mimeType: 'image/jpeg',
      width: p.width ?? 1080,
      height: p.height ?? 1350,
      title: p.alt || query,
      attribution: `Pexels · ${p.photographer ?? 'Photographer'}`,
    });
  }
  return out;
}

async function searchWikimediaCommons(query: string, limit: number): Promise<StockMediaItem[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
    `&gsrnamespace=6&gsrlimit=${Math.min(12, limit * 3)}&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}` +
    `&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1280&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          pageid?: number;
          title?: string;
          imageinfo?: {
            thumburl?: string;
            url?: string;
            mime?: string;
            width?: number;
            height?: number;
            thumbwidth?: number;
            thumbheight?: number;
          }[];
        }
      >;
    };
  };
  const pages = Object.values(data.query?.pages ?? {});
  const out: StockMediaItem[] = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const mime = info.mime ?? '';
    if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') continue;
    const mediaUrl = info.thumburl ?? info.url;
    if (!mediaUrl) continue;
    const w = info.thumbwidth ?? info.width ?? 1280;
    const h = info.thumbheight ?? info.height ?? 960;
    if (w < 400 || h < 300) continue;
    out.push({
      id: `wiki-${p.pageid ?? out.length}`,
      provider: 'wikimedia',
      kind: 'photo',
      url: mediaUrl,
      previewUrl: mediaUrl,
      mimeType: mime,
      width: w,
      height: h,
      title: (p.title ?? query).replace(/^File:/, '').replace(/\.[^.]+$/, ''),
      attribution: 'Wikimedia Commons',
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Stock B-roll & editorial photo resolver (spec 23 R6.1):
 * - Searches Pexels (HD vertical videos & photos when `PEXELS_API_KEY` is configured)
 * - Falls back automatically to zero-key Wikimedia Commons photography
 * - Supports allowlisted binary proxy (`?proxy=<url>`) so the browser stores clips cleanly in IndexedDB.
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
    if (parsed.protocol !== 'https:' || !ALLOWED_PROXY_HOSTS.has(parsed.hostname)) {
      return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }
    try {
      const upstream = await fetch(parsed.toString(), {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      if (!upstream.ok || !upstream.body) {
        return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 });
      }
      const len = Number(upstream.headers.get('content-length') ?? 0);
      if (len > MAX_PROXY_BYTES) {
        return NextResponse.json({ error: 'Media too large' }, { status: 413 });
      }
      const buf = await upstream.arrayBuffer();
      if (buf.byteLength > MAX_PROXY_BYTES) {
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

  const q = (searchParams.get('q') ?? '').trim().slice(0, 120);
  if (!q) return NextResponse.json({ items: [] });

  const kind = searchParams.get('kind') === 'photo' ? 'photo' : 'video';
  const orientationParam = searchParams.get('orientation');
  const orientation: 'portrait' | 'landscape' | 'square' =
    orientationParam === 'landscape' || orientationParam === 'square' ? orientationParam : 'portrait';
  const limit = Math.max(1, Math.min(8, Number(searchParams.get('limit') ?? 4) || 4));
  const pexelsKey = process.env.PEXELS_API_KEY?.trim();

  let items: StockMediaItem[] = [];
  if (pexelsKey) {
    items = await searchPexels(q, kind, orientation, limit, pexelsKey).catch(() => []);
    if (items.length === 0 && kind === 'video') {
      items = await searchPexels(q, 'photo', orientation, limit, pexelsKey).catch(() => []);
    }
  }
  if (items.length === 0) {
    items = await searchWikimediaCommons(q, limit).catch(() => []);
  }
  return NextResponse.json({ items });
}
