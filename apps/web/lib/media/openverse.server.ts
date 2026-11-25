import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPrivateAddress } from '@motionpop/render/screenshot';
import { z } from 'zod';
import { readResponseBytesWithLimit } from './stock.server';

/**
 * The open media search (Openverse, CC0 and CC BY only; security-and-cost.md: stock media only
 * CC0 / CC-BY with stored attribution). Anonymous API use; the app sends only the search words.
 * Every answer is parsed with zod, and an image is fetched by id only (never a caller URL), so
 * the route can't be used to fetch arbitrary addresses.
 */
const API = 'https://api.openverse.org/v1/images/';
const UA = 'motionpop-media-search';

const ResultSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullish(),
  creator: z.string().nullish(),
  license: z.string(),
  license_version: z.string().nullish(),
  url: z.string().url(),
  thumbnail: z.string().url().nullish(),
  attribution: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});
const SearchSchema = z.object({ results: z.array(z.unknown()) });

export interface MediaHit {
  id: string;
  title: string;
  thumb: string;
  width: number;
  height: number;
  license: string;
  attribution: string;
}

const attributionOf = (r: z.infer<typeof ResultSchema>) =>
  r.license === 'cc0'
    ? `${r.title ?? 'Untitled'} (CC0)`
    : `"${r.title ?? 'Untitled'}" by ${r.creator ?? 'unknown'}, CC BY ${r.license_version ?? ''}`.trim();

/** The anonymous API said "slow down": the route answers 429 and callers stop for now. */
export class MediaRateLimited extends Error {}

/**
 * Answers kept in this server instance for a few hours (spec 07c R1.4): first-load pictures
 * search the same places and nouns for many projects, and the anonymous API is rate-limited.
 * Only the search words are keys; nothing about the caller is kept.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; hits: MediaHit[] }>();

export async function searchOpenverse(q: string): Promise<MediaHit[]> {
  const key = q.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.hits;
  const hits = await searchUpstream(q);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), hits });
  return hits;
}

async function searchUpstream(q: string): Promise<MediaHit[]> {
  const url = `${API}?${new URLSearchParams({ q, license: 'cc0,by', page_size: '20', mature: 'false' })}`;
  const res = await fetch(url, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 429) throw new MediaRateLimited('search rate-limited');
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  const body = SearchSchema.parse(await res.json());
  return body.results.flatMap((raw) => {
    const r = ResultSchema.safeParse(raw);
    if (!r.success || !['cc0', 'by'].includes(r.data.license)) return [];
    return [
      {
        id: r.data.id,
        title: (r.data.title ?? 'Untitled').slice(0, 120),
        thumb: `/api/media/image?id=${r.data.id}&thumb=1`,
        width: r.data.width ?? 0,
        height: r.data.height ?? 0,
        license: r.data.license,
        attribution: attributionOf(r.data).slice(0, 240),
      },
    ];
  });
}

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const SAFE_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

async function assertPublicHttps(rawUrl: string): Promise<URL> {
  const u = new URL(rawUrl);
  if (u.protocol !== 'https:') throw new Error('not https');
  const host = u.hostname.toLowerCase();
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('private host');
    return u;
  }
  if (/\.(local|internal|localhost|lan|home|corp)$/.test(host) || host === 'localhost') {
    throw new Error('private host');
  }
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0 || !addrs.every((a) => !isPrivateAddress(a.address))) {
    throw new Error('private host');
  }
  return u;
}

async function fetchPublicImage(initialUrl: string): Promise<Response> {
  let current = await assertPublicHttps(initialUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.toString(), {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(15000),
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('bad redirect');
      current = await assertPublicHttps(new URL(loc, current).toString());
      continue;
    }
    return res;
  }
  throw new Error('too many redirects');
}

/** The picture's bytes by Openverse id (full size, or the API's thumbnail). */
export async function fetchOpenverseImage(
  id: string,
  thumb: boolean,
): Promise<{ bytes: ArrayBuffer; type: string; attribution: string }> {
  if (!z.string().uuid().safeParse(id).success) throw new Error('bad id');
  const meta = await fetch(`${API}${id}/`, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!meta.ok) throw new Error(`lookup failed (${meta.status})`);
  const r = ResultSchema.parse(await meta.json());
  if (!['cc0', 'by'].includes(r.license)) throw new Error('licence not allowed');
  // Full images live on the source sites; the thumbnail is served by the API itself.
  const src = thumb ? `${API}${id}/thumb/` : r.url;
  const res = await fetchPublicImage(src);
  const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!res.ok || !SAFE_IMAGE_MIMES.has(type)) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error('not a safe raster image');
  }
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error('too large');
  }
  const bytes = await readResponseBytesWithLimit(res, MAX_BYTES);
  if (!bytes) throw new Error('too large');
  return { bytes: bytes.slice().buffer, type, attribution: attributionOf(r).slice(0, 240) };
}
