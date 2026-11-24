import 'server-only';
import { z } from 'zod';

/**
 * Uncommon Ear API client (https://uncommonear.com/docs/api):
 * - Searches Creative Commons music & sound effects via `GET https://api.uncommonear.com/v1/search`
 * - Resolves audio bytes by track ID via `GET https://api.uncommonear.com/v1/tracks/{id}`
 * - API key stays strictly server-side in `Authorization: Bearer <UNCOMMON_EAR_API_KEY>`.
 */
const API_BASE = 'https://api.uncommonear.com';
const UA = 'Motionpop/1.0 (+https://motionpop.app; audio search)';

export const UNCOMMON_EAR_MUSIC_MOODS = ['upbeat', 'calm', 'epic', 'intense'] as const;
export const UNCOMMON_EAR_MUSIC_GENRES = [
  'electronic',
  'cinematic',
  'ambient',
  'hip-hop',
  'synthwave',
  'jazz',
  'rock',
  'classical',
] as const;
export const UNCOMMON_EAR_SFX_TYPES = [
  'whoosh',
  'impact',
  'ui',
  'foley',
  'footsteps',
  'ambience',
  'nature',
  'vehicles',
  'magic-scifi',
  'horror',
] as const;

const RawTrackSchema = z.object({
  id: z.string().min(1),
  title: z.string().default('Untitled'),
  artist: z.string().nullish(),
  kind: z.enum(['music', 'sfx']),
  duration_s: z.number().nonnegative().default(0),
  bpm: z.number().nullish(),
  tags: z
    .object({
      genre: z.array(z.string()).optional(),
      mood: z.array(z.string()).optional(),
      use: z.array(z.string()).optional(),
      instrument: z.array(z.string()).optional(),
      sfx: z.array(z.string()).optional(),
    })
    .optional(),
  license: z
    .object({
      id: z.string().default('cc0'),
      name: z.string().default('CC0 1.0'),
      url: z.string().optional(),
      status: z.string().optional(),
    })
    .optional(),
  terms: z
    .object({
      commercial: z.boolean().default(true),
      credit: z.string().default('none'),
      share_alike: z.boolean().default(false),
    })
    .optional(),
  attribution: z.enum(['optional', 'requested', 'required']).default('optional'),
  credit_line: z.string().default(''),
  preview_url: z.string().url().nullish(),
  original_url: z.string().url().nullish(),
  page_url: z.string().url().optional(),
});

const RawSearchResponseSchema = z.object({
  tracks: z.array(z.unknown()).default([]),
  total: z.number().int().nonnegative().default(0),
  cursor: z.string().nullish(),
  other_kind: z.enum(['music', 'sfx']).nullish(),
  other_kind_total: z.number().int().nonnegative().nullish(),
});

export interface AudioSearchTrack {
  id: string;
  title: string;
  artist: string;
  kind: 'music' | 'sfx';
  durationS: number;
  bpm: number | null;
  tags: string[];
  licenseId: string;
  licenseName: string;
  commercial: boolean;
  attribution: 'optional' | 'requested' | 'required';
  creditLine: string;
  previewUrl: string | null;
  hasOriginal: boolean;
  pageUrl: string | null;
}

export interface AudioSearchResult {
  tracks: AudioSearchTrack[];
  total: number;
  cursor: string | null;
  otherKind: 'music' | 'sfx' | null;
  otherKindTotal: number | null;
}

export class UncommonEarError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function normalizeTrack(raw: z.infer<typeof RawTrackSchema>): AudioSearchTrack {
  const tagList = [
    ...(raw.tags?.sfx ?? []),
    ...(raw.tags?.mood ?? []),
    ...(raw.tags?.genre ?? []),
    ...(raw.tags?.instrument ?? []),
    ...(raw.tags?.use ?? []),
  ].slice(0, 5);
  return {
    id: raw.id,
    title: raw.title.trim() || 'Untitled',
    artist: raw.artist?.trim() ?? '',
    kind: raw.kind,
    durationS: Math.round(raw.duration_s * 10) / 10,
    bpm: raw.bpm ?? null,
    tags: tagList,
    licenseId: raw.license?.id ?? 'cc0',
    licenseName: raw.license?.name ?? 'CC0 1.0',
    commercial: raw.terms?.commercial ?? true,
    attribution: raw.attribution,
    creditLine: raw.credit_line,
    previewUrl: raw.preview_url ?? null,
    hasOriginal: Boolean(raw.original_url),
    pageUrl: raw.page_url ?? null,
  };
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 250;
const searchCache = new Map<string, { at: number; result: AudioSearchResult }>();

export function buildUncommonEarSearchParams(opts: {
  q?: string;
  kind: 'music' | 'sfx';
  tag?: string;
  cursor?: string;
  limit?: number;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('kind', opts.kind);
  params.set('commercial', 'true');
  params.set('curated', 'true');
  params.set('limit', String(Math.max(1, Math.min(30, opts.limit ?? 12))));

  const q = opts.q?.trim().slice(0, 100);
  if (q) params.set('q', q);
  if (opts.cursor?.trim()) params.set('cursor', opts.cursor.trim());

  const tag = opts.tag?.trim().toLowerCase();
  if (tag) {
    if (opts.kind === 'sfx') {
      if ((UNCOMMON_EAR_SFX_TYPES as readonly string[]).includes(tag)) {
        params.set('sfx', tag);
      }
    } else {
      if ((UNCOMMON_EAR_MUSIC_MOODS as readonly string[]).includes(tag)) {
        params.set('mood', tag);
      } else if ((UNCOMMON_EAR_MUSIC_GENRES as readonly string[]).includes(tag)) {
        params.set('genre', tag);
      }
    }
  }
  return params;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; attempts: number },
): Promise<Response> {
  let lastErr: unknown;
  let lastRes: Response | null = null;
  for (let i = 0; i < opts.attempts; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      if (res.status < 500) return res;
      lastRes = res;
    } catch (err) {
      lastErr = err;
    }
    if (i < opts.attempts - 1) {
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  if (lastRes) return lastRes;
  throw lastErr instanceof Error ? lastErr : new Error('Upstream request failed');
}

export async function searchUncommonEar(
  opts: {
    q?: string;
    kind: 'music' | 'sfx';
    tag?: string;
    cursor?: string;
    limit?: number;
  },
  apiKey: string,
): Promise<AudioSearchResult> {
  const params = buildUncommonEarSearchParams(opts);
  const cacheKey = params.toString();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.result;
  }

  const reqInit: RequestInit = {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': UA,
      Accept: 'application/json',
    },
  };

  let res = await fetchWithRetry(`${API_BASE}/v1/search?${params.toString()}`, reqInit, {
    timeoutMs: 25_000,
    attempts: 3,
  });

  // If curated tier returns 5xx, fall back once to full catalog so search never fails needlessly.
  if (res.status >= 500 && params.get('curated') === 'true') {
    const fallbackParams = new URLSearchParams(params);
    fallbackParams.delete('curated');
    res = await fetchWithRetry(`${API_BASE}/v1/search?${fallbackParams.toString()}`, reqInit, {
      timeoutMs: 25_000,
      attempts: 2,
    });
  }

  if (res.status === 401 || res.status === 403) {
    throw new UncommonEarError('Invalid or unauthorized Uncommon Ear API key', res.status);
  }
  if (res.status === 429) {
    throw new UncommonEarError('Uncommon Ear rate limit reached — try again in a moment', 429);
  }
  if (!res.ok) {
    throw new UncommonEarError(`Uncommon Ear search failed (${res.status})`, res.status);
  }

  const parsed = RawSearchResponseSchema.parse(await res.json());
  const tracks: AudioSearchTrack[] = [];
  for (const item of parsed.tracks) {
    const r = RawTrackSchema.safeParse(item);
    if (r.success && (r.data.preview_url || r.data.original_url)) {
      tracks.push(normalizeTrack(r.data));
    }
  }

  const result: AudioSearchResult = {
    tracks,
    total: parsed.total,
    cursor: parsed.cursor ?? null,
    otherKind: parsed.other_kind ?? null,
    otherKindTotal: parsed.other_kind_total ?? null,
  };

  if (searchCache.size >= CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
  searchCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

const TRACK_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,79}$/;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Resolves and proxies one Uncommon Ear track's audio bytes by its catalog ID (never an arbitrary
 * caller URL), verifying HTTPS, `audio/` content-type, and a 25 MB cap.
 */
export async function fetchUncommonEarTrackAudio(
  trackId: string,
  apiKey: string,
  preferOriginal = false,
): Promise<{
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
  creditLine: string;
  title: string;
}> {
  if (!TRACK_ID_RE.test(trackId)) {
    throw new UncommonEarError('Invalid track id', 400);
  }
  const metaRes = await fetchWithRetry(
    `${API_BASE}/v1/tracks/${encodeURIComponent(trackId)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': UA,
        Accept: 'application/json',
      },
    },
    { timeoutMs: 20_000, attempts: 3 },
  );
  if (metaRes.status === 404) {
    throw new UncommonEarError('Track not found', 404);
  }
  if (!metaRes.ok) {
    throw new UncommonEarError(`Track lookup failed (${metaRes.status})`, metaRes.status);
  }
  const track = RawTrackSchema.parse(await metaRes.json());
  const candidates = preferOriginal
    ? [track.original_url, track.preview_url]
    : [track.preview_url, track.original_url];

  for (const url of candidates) {
    if (!url || !url.startsWith('https://')) continue;
    try {
      const audioRes = await fetch(url, {
        headers: { 'User-Agent': UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(25_000),
      });
      if (!audioRes.ok) continue;
      const contentType = (audioRes.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
      if (
        contentType &&
        !contentType.startsWith('audio/') &&
        contentType !== 'application/octet-stream' &&
        contentType !== 'binary/octet-stream'
      ) {
        continue;
      }
      const len = Number(audioRes.headers.get('content-length') ?? 0);
      if (len > MAX_AUDIO_BYTES) continue;
      const bytes = await audioRes.arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) continue;

      const ext = contentType.includes('wav')
        ? 'wav'
        : contentType.includes('ogg')
          ? 'ogg'
          : contentType.includes('flac')
            ? 'flac'
            : 'mp3';
      const slug = (track.title || track.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
      return {
        bytes,
        contentType:
          !contentType || contentType.includes('octet-stream') ? 'audio/mpeg' : contentType,
        filename: `${slug || track.id}.${ext}`,
        creditLine: track.credit_line,
        title: track.title,
      };
    } catch {
      continue;
    }
  }
  throw new UncommonEarError('Audio stream unavailable for this track', 502);
}
