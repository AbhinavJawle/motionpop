import {
  APP_CONFIG_DEFAULTS,
  MEDIA_CLIP_KINDS,
  MediaClipKindSchema,
  MediaClipMomentSchema,
  type MediaClipKind,
  type MediaClipMoment,
} from '@motionpop/schemas';
import { z } from 'zod';
import { MEDIA_INDEX_SYSTEM_V1, mediaIndexPromptV1 } from '../prompts/media-index.v1';
import type { Router, TaskDef } from '../router';

export const MediaIndexFrameSchema = z.object({
  atMs: z.number().int().nonnegative(),
  mimeType: z.enum(['image/jpeg', 'image/png']).default('image/jpeg'),
  base64: z.string().min(16),
});

export const MediaIndexClipInputSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  mimeType: z.string().min(1).max(80),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationMs: z.number().int().positive().optional(),
  frames: z.array(MediaIndexFrameSchema).min(1).max(4),
});
export type MediaIndexClipInput = z.infer<typeof MediaIndexClipInputSchema>;

export const MediaIndexInputSchema = z.object({
  clips: z.array(MediaIndexClipInputSchema).min(1).max(6),
});
export type MediaIndexInput = z.infer<typeof MediaIndexInputSchema>;

export const IndexedClipResultSchema = z.object({
  id: z.string().min(1).max(64),
  kind: MediaClipKindSchema,
  summary: z.string().min(1).max(320),
  tags: z.array(z.string().max(40)).max(12),
  dominantColors: z.array(z.string().max(20)).max(6).default([]),
  moments: z.array(MediaClipMomentSchema).max(8),
});
export type IndexedClipResult = z.infer<typeof IndexedClipResultSchema>;

export const MediaIndexOutputSchema = z.object({
  clips: z.array(IndexedClipResultSchema).min(1).max(6),
});
export type MediaIndexOutput = z.infer<typeof MediaIndexOutputSchema>;

/** Clean hand-crafted JSON Schema for Gemini 4 structured output (no Zod v4 `maximum` bugs). */
export function mediaIndexJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      clips: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            kind: { type: 'string', enum: [...MEDIA_CLIP_KINDS] },
            summary: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            dominantColors: { type: 'array', items: { type: 'string' } },
            moments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  startMs: { type: 'integer' },
                  endMs: { type: 'integer' },
                  focusX: { type: 'number' },
                  focusY: { type: 'number' },
                  zoom: { type: 'number' },
                  description: { type: 'string' },
                },
                required: ['startMs', 'endMs', 'focusX', 'focusY', 'zoom', 'description'],
              },
            },
          },
          required: ['id', 'kind', 'summary', 'tags', 'dominantColors', 'moments'],
        },
      },
    },
    required: ['clips'],
  };
}

/**
 * `media.index` (spec 20 R2.1): multimodal clip indexer defaulting to `gemini-4-neon`.
 * Batches up to 6 clips (max 4 keyframes each) and returns structured summaries, tags, and
 * Screen-Studio-style zoomable moments.
 */
export function mediaIndexTask(): TaskDef<MediaIndexInput, MediaIndexOutput> {
  return {
    id: 'media.index',
    input: MediaIndexInputSchema,
    output: MediaIndexOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelStrong || APP_CONFIG_DEFAULTS.modelStrong,
    system: MEDIA_INDEX_SYSTEM_V1,
    prompt: (i) =>
      mediaIndexPromptV1(
        i.clips.map((c) => ({
          id: c.id,
          name: c.name,
          mimeType: c.mimeType,
          width: c.width,
          height: c.height,
          ...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {}),
          frameTimesMs: c.frames.map((f) => f.atMs),
        })),
      ),
    mediaList: (i) =>
      i.clips.flatMap((c) => c.frames.map((f) => ({ mimeType: f.mimeType, base64: f.base64 }))),
    jsonSchema: mediaIndexJsonSchema,
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 1,
    thinking: 'LOW',
    maxOutputTokens: 3072,
  };
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Infers a sensible clip kind from filename & MIME type when offline or falling back. */
export function inferClipKind(name: string, mimeType: string): MediaClipKind {
  const lower = name.toLowerCase();
  if (mimeType.startsWith('image/')) {
    if (/(screen|shot|ui|dash|code|tweet|chart|slide|figma|app)/.test(lower)) return 'screenshot';
    return 'photo';
  }
  if (/(screen|record|demo|walkthrough|loom|ui|app|browser|code|terminal|tutorial)/.test(lower)) {
    return 'screen-recording';
  }
  return 'broll';
}

/** Deterministic offline/fallback clip indexer (zero AI calls). */
export function fallbackIndexClip(clip: {
  id: string;
  name: string;
  mimeType: string;
  durationMs?: number;
}): IndexedClipResult {
  const kind = inferClipKind(clip.name, clip.mimeType);
  const cleanName = clip.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Uploaded clip';
  const tags = cleanName
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 5);
  const endMs = clip.durationMs ? Math.min(clip.durationMs, 4500) : 4000;
  return {
    id: clip.id,
    kind,
    summary:
      kind === 'screen-recording'
        ? `Screen recording showing ${cleanName}`
        : kind === 'screenshot'
          ? `Screenshot of ${cleanName}`
          : kind === 'photo'
            ? `Photo of ${cleanName}`
            : `B-roll footage of ${cleanName}`,
    tags: tags.length ? tags : [kind],
    dominantColors: [],
    moments: [
      {
        startMs: 0,
        endMs: Math.max(1000, endMs),
        focusX: 0.5,
        focusY: 0.45,
        zoom: kind === 'screen-recording' ? 1.45 : 1.05,
        description: cleanName,
      },
    ],
  };
}

/** Sanitizes and clamps model-returned clip moments to valid clip bounds. */
export function sanitizeIndexedClip(
  raw: IndexedClipResult,
  meta: { id: string; name: string; mimeType: string; durationMs?: number },
): IndexedClipResult {
  const maxMs = meta.durationMs ?? 10_000;
  const moments: MediaClipMoment[] = raw.moments
    .slice(0, 6)
    .map((m) => {
      const startMs = clamp(Math.round(m.startMs), 0, Math.max(0, maxMs - 200));
      const endMs = clamp(Math.round(m.endMs), startMs + 200, Math.max(startMs + 200, maxMs));
      return {
        startMs,
        endMs,
        focusX: Math.round(clamp(m.focusX, 0.1, 0.9) * 100) / 100,
        focusY: Math.round(clamp(m.focusY, 0.1, 0.9) * 100) / 100,
        zoom: Math.round(clamp(m.zoom, 1, 2.2) * 100) / 100,
        description: m.description.trim().slice(0, 220) || raw.summary.slice(0, 220),
      };
    });
  return {
    id: meta.id,
    kind: raw.kind,
    summary: raw.summary.trim().slice(0, 320) || fallbackIndexClip(meta).summary,
    tags: raw.tags
      .map((t) => t.trim().toLowerCase().slice(0, 40))
      .filter(Boolean)
      .slice(0, 10),
    dominantColors: raw.dominantColors.slice(0, 6),
    moments: moments.length ? moments : fallbackIndexClip(meta).moments,
  };
}

/**
 * Runs `media.index` on a batch of clips (defaulting to `gemini-4-neon`), returning sanitized
 * metadata for every clip with deterministic fallback if cloud AI is unavailable.
 */
export async function indexMediaClips(
  router: Router | null,
  clips: readonly MediaIndexClipInput[],
  opts?: { model?: string },
): Promise<{ results: IndexedClipResult[]; source: 'cloud' | 'fallback'; model?: string }> {
  if (clips.length === 0) return { results: [], source: 'fallback' };
  if (!router) {
    return { results: clips.map((c) => fallbackIndexClip(c)), source: 'fallback' };
  }
  const all: IndexedClipResult[] = [];
  let usedCloud = false;
  let usedModel: string | undefined;

  // Batch up to 4 clips per call so total attached keyframes stay <= 16.
  for (let i = 0; i < clips.length; i += 4) {
    const batch = clips.slice(i, i + 4);
    try {
      const res = await router.run(
        mediaIndexTask(),
        { clips: batch },
        {
          mode: 'ONLY_IN_CLOUD',
          allowCloud: false,
          ...(opts?.model ? { model: opts.model } : {}),
        },
      );
      usedCloud = true;
      usedModel = res.model;
      const byId = new Map(res.output.clips.map((c) => [c.id, c]));
      for (const c of batch) {
        const hit = byId.get(c.id);
        all.push(hit ? sanitizeIndexedClip(hit, c) : fallbackIndexClip(c));
      }
    } catch {
      for (const c of batch) all.push(fallbackIndexClip(c));
    }
  }
  return {
    results: all,
    source: usedCloud ? 'cloud' : 'fallback',
    ...(usedModel ? { model: usedModel } : {}),
  };
}
