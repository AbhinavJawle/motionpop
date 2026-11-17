import 'server-only';
import { z } from 'zod';

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
  if (!/^https:\/\//.test(src)) throw new Error('not https');
  const res = await fetch(src, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  });
  const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
  if (!res.ok || !type.startsWith('image/')) throw new Error('not an image');
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_BYTES) throw new Error('too large');
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new Error('too large');
  return { bytes, type, attribution: attributionOf(r).slice(0, 240) };
}
