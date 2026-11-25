import 'server-only';

export const ALLOWED_STOCK_PROXY_HOSTS = new Set([
  'cdn.pixabay.com',
  'images.pexels.com',
  'videos.pexels.com',
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
]);

export const ALLOWED_STOCK_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export function parseSafeStockMime(header: string | null): string | null {
  const base = (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return ALLOWED_STOCK_MIME_TYPES.has(base) ? base : null;
}

export async function readResponseBytesWithLimit(
  res: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export const MAX_STOCK_PROXY_BYTES = 28 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'Motionpop/1.0 (+https://motionpop.app; editorial reel stock resolver)';

/**
 * Pixabay terms require caching API responses for 24 hours.
 * Keep up to 500 search queries cached per server instance.
 */
const PIXABAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PIXABAY_CACHE_MAX = 500;
const pixabayCache = new Map<string, { at: number; items: StockMediaItem[] }>();

export interface StockMediaItem {
  id: string;
  provider: 'pixabay' | 'pexels' | 'wikimedia';
  kind: 'video' | 'photo';
  url: string;
  previewUrl: string;
  mimeType: string;
  width: number;
  height: number;
  durationMs?: number;
  title: string;
  attribution: string;
  pageUrl?: string;
}

interface PixabayVideoRendition {
  url?: string;
  width?: number;
  height?: number;
  size?: number;
  thumbnail?: string;
}

interface PixabayVideoHit {
  id?: number;
  pageURL?: string;
  tags?: string;
  duration?: number;
  user?: string;
  videos?: {
    large?: PixabayVideoRendition;
    medium?: PixabayVideoRendition;
    small?: PixabayVideoRendition;
    tiny?: PixabayVideoRendition;
  };
}

interface PixabayImageHit {
  id?: number;
  pageURL?: string;
  tags?: string;
  previewURL?: string;
  webformatURL?: string;
  webformatWidth?: number;
  webformatHeight?: number;
  largeImageURL?: string;
  fullHDURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  user?: string;
}

function pixabayTitleFromTags(tags: string | undefined, fallback: string): string {
  const clean = (tags ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ');
  return clean || fallback;
}

function pickPixabayVideoStream(videos: PixabayVideoHit['videos']): PixabayVideoRendition | null {
  if (!videos) return null;
  // Prefer `small` (640p–720p, fast download) when `medium` is > 14 MB; otherwise prefer `medium` (720p–1080p).
  const medium = videos.medium;
  const small = videos.small;
  if (medium?.url && (medium.size ?? 1) > 0 && (medium.size ?? 0) <= 14 * 1024 * 1024) {
    return medium;
  }
  if (small?.url && (small.size ?? 1) > 0) return small;
  for (const c of [medium, videos.large, videos.tiny]) {
    if (c?.url && (c.size ?? 1) > 0 && (c.size ?? 0) <= MAX_STOCK_PROXY_BYTES) return c;
  }
  return null;
}

export async function searchPixabay(
  query: string,
  kind: 'video' | 'photo',
  orientation: 'portrait' | 'landscape' | 'square',
  limit: number,
  apiKey: string,
): Promise<StockMediaItem[]> {
  const trimmedQ = query.trim().slice(0, 100);
  if (!trimmedQ) return [];
  const cacheKey = `${kind}|${orientation}|${limit}|${trimmedQ.toLowerCase()}`;
  const cached = pixabayCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PIXABAY_CACHE_TTL_MS) {
    return cached.items;
  }

  // Pixabay requires per_page in [3, 200].
  const perPage = Math.max(3, Math.min(20, kind === 'video' ? Math.max(limit * 2, 6) : limit));
  const params = new URLSearchParams({
    key: apiKey,
    q: trimmedQ,
    safesearch: 'true',
    per_page: String(perPage),
  });
  let endpoint: string;
  if (kind === 'video') {
    endpoint = `https://pixabay.com/api/videos/?${params.toString()}`;
  } else {
    params.set('image_type', 'photo');
    params.set(
      'orientation',
      orientation === 'portrait' ? 'vertical' : orientation === 'landscape' ? 'horizontal' : 'all',
    );
    endpoint = `https://pixabay.com/api/?${params.toString()}`;
  }

  const res = await fetch(endpoint, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { hits?: unknown[] };
  const hits = Array.isArray(data.hits) ? data.hits : [];

  let items: StockMediaItem[] = [];
  if (kind === 'video') {
    for (const raw of hits) {
      if (!raw || typeof raw !== 'object') continue;
      const v = raw as PixabayVideoHit;
      const stream = pickPixabayVideoStream(v.videos);
      if (!stream?.url) continue;
      const thumb =
        stream.thumbnail ||
        v.videos?.small?.thumbnail ||
        v.videos?.medium?.thumbnail ||
        v.videos?.tiny?.thumbnail ||
        '';
      items.push({
        id: `pixabay-v-${v.id ?? items.length}`,
        provider: 'pixabay',
        kind: 'video',
        url: stream.url,
        previewUrl: thumb || stream.url,
        mimeType: 'video/mp4',
        width: stream.width ?? 1280,
        height: stream.height ?? 720,
        durationMs: Math.max(2000, Math.round((v.duration ?? 6) * 1000)),
        title: pixabayTitleFromTags(v.tags, trimmedQ),
        attribution: `Pixabay · ${v.user ?? 'Creator'}`,
        ...(v.pageURL ? { pageUrl: v.pageURL } : {}),
      });
    }
    // Pixabay video API has no orientation filter, so prefer matching aspect ratios first.
    if (orientation === 'portrait') {
      items.sort((a, b) => Number(b.height >= b.width) - Number(a.height >= a.width));
    } else if (orientation === 'landscape') {
      items.sort((a, b) => Number(b.width >= b.height) - Number(a.width >= a.height));
    }
    items = items.slice(0, limit);
  } else {
    for (const raw of hits) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as PixabayImageHit;
      const url = p.largeImageURL || p.fullHDURL || p.webformatURL;
      if (!url) continue;
      items.push({
        id: `pixabay-p-${p.id ?? items.length}`,
        provider: 'pixabay',
        kind: 'photo',
        url,
        previewUrl: p.webformatURL || p.previewURL || url,
        mimeType: 'image/jpeg',
        width: p.imageWidth ?? p.webformatWidth ?? 1280,
        height: p.imageHeight ?? p.webformatHeight ?? 853,
        title: pixabayTitleFromTags(p.tags, trimmedQ),
        attribution: `Pixabay · ${p.user ?? 'Creator'}`,
        ...(p.pageURL ? { pageUrl: p.pageURL } : {}),
      });
      if (items.length >= limit) break;
    }
  }

  if (pixabayCache.size >= PIXABAY_CACHE_MAX) {
    const oldest = pixabayCache.keys().next().value;
    if (oldest) pixabayCache.delete(oldest);
  }
  pixabayCache.set(cacheKey, { at: Date.now(), items });
  return items;
}

export async function searchPexels(
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
        url?: string;
        user?: { name?: string };
        video_files?: { link?: string; file_type?: string; width?: number; height?: number }[];
      };
      const files = (v.video_files ?? []).filter(
        (f) => f.link && f.file_type === 'video/mp4' && (f.width ?? 0) <= 1920,
      );
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
        ...(v.url ? { pageUrl: v.url } : {}),
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
      url?: string;
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
      ...(p.url ? { pageUrl: p.url } : {}),
    });
  }
  return out;
}

export async function searchWikimediaCommons(
  query: string,
  limit: number,
): Promise<StockMediaItem[]> {
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

export function isAllowedStockProxyHost(hostname: string): boolean {
  return ALLOWED_STOCK_PROXY_HOSTS.has(hostname.toLowerCase());
}

export function isAllowedStockProxyUrl(url: URL): boolean {
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (ALLOWED_STOCK_PROXY_HOSTS.has(host)) return true;
  // Pixabay photos API returns direct download URLs under https://pixabay.com/get/...;
  // restrict apex pixabay.com strictly to /get/ so HTML pages can never be proxied.
  return host === 'pixabay.com' && url.pathname.startsWith('/get/');
}

export async function fetchAllowlistedStockMedia(initialUrl: URL): Promise<Response | null> {
  let current = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedStockProxyUrl(current)) {
      return null;
    }
    const res = await fetch(current.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'manual',
      signal: AbortSignal.timeout(35_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      try {
        current = new URL(loc, current);
      } catch {
        return null;
      }
      continue;
    }
    return res;
  }
  return null;
}
