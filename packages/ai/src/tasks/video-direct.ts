import {
  APP_CONFIG_DEFAULTS,
  OverlayAnchorSchema,
  SlotPlacementSchema,
  VideoCutKindSchema,
  keptSourceSegments,
  sourceToCleanedMs,
  type OverlayAnchor,
  type SlotPlacement,
  type VideoCut,
  type VideoPunchIn,
  type Word,
} from '@motionpop/schemas';
import { z } from 'zod';
import { VIDEO_DIRECT_SYSTEM_V1, videoDirectPromptV1 } from '../prompts/video-direct.v1';
import type { Router, TaskDef } from '../router';

export const VideoDirectFrameSchema = z.object({
  atMs: z.number().int().nonnegative(),
  base64: z.string().min(1),
});

export const VideoDirectInputSchema = z.object({
  format: z.enum(['16:9', '9:16', '1:1']),
  styleId: z.string().min(1),
  durationMs: z.number().int().positive(),
  /** [wordIndex, startMs, endMs, text] on the source clock. */
  words: z
    .array(
      z.tuple([
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
        z.string(),
      ]),
    )
    .min(1)
    .max(3000),
  /** Up to 6 sampled JPEG keyframes from the uploaded video. */
  frames: z.array(VideoDirectFrameSchema).max(6).default([]),
});
export type VideoDirectInput = z.infer<typeof VideoDirectInputSchema>;

export const VideoDirectCutSuggestionSchema = z.object({
  wordStart: z.number().int().nonnegative(),
  wordEnd: z.number().int().nonnegative(),
  kind: VideoCutKindSchema,
  reason: z.string().min(1).max(160),
});

export const VideoDirectPunchInSuggestionSchema = z.object({
  wordStart: z.number().int().nonnegative(),
  wordEnd: z.number().int().nonnegative(),
  scale: z.number().min(1.05).max(1.4),
  focusX: z.number().min(0).max(1),
  focusY: z.number().min(0).max(1),
  reason: z.string().min(1).max(160),
});

export const VideoDirectPlacementSuggestionSchema = z.object({
  wordStart: z.number().int().nonnegative(),
  wordEnd: z.number().int().nonnegative(),
  placement: SlotPlacementSchema,
  anchor: OverlayAnchorSchema,
  reason: z.string().min(1).max(160),
});

export const VideoDirectOutputSchema = z.object({
  summary: z.string().min(1).max(240),
  defaultOverlayAnchor: OverlayAnchorSchema,
  cuts: z.array(VideoDirectCutSuggestionSchema).max(30),
  punchIns: z.array(VideoDirectPunchInSuggestionSchema).max(20),
  placements: z.array(VideoDirectPlacementSuggestionSchema).max(20),
});
export type VideoDirectOutput = z.infer<typeof VideoDirectOutputSchema>;

export interface AudioEdlCutInput {
  startMs: number;
  endMs: number;
  kind?: 'silence' | 'filler';
  reason?: string;
}

export interface DirectedPlacementHint {
  startMs: number;
  endMs: number;
  placement: SlotPlacement;
  anchor: OverlayAnchor;
  reason: string;
}

export interface EnforcedVideoPlan {
  summary: string;
  defaultOverlayAnchor: OverlayAnchor;
  cuts: VideoCut[];
  punchIns: VideoPunchIn[];
  placements: DirectedPlacementHint[];
  source: 'cloud' | 'rules';
  model?: string;
}

/**
 * Clean JSON Schema for Gemini 4 structured output (`responseJsonSchema`): avoids Zod v4's
 * `maximum: 9007199254740991` and `additionalProperties` keywords that Vertex rejects with 400.
 */
export function videoDirectJsonSchema(): Record<string, unknown> {
  const anchors = ['top-right', 'top-left', 'lower-third', 'side-right', 'side-left', 'center'];
  return {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      defaultOverlayAnchor: { type: 'string', enum: anchors },
      cuts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            wordStart: { type: 'integer' },
            wordEnd: { type: 'integer' },
            kind: { type: 'string', enum: ['silence', 'filler', 'retake', 'ramble', 'manual'] },
            reason: { type: 'string' },
          },
          required: ['wordStart', 'wordEnd', 'kind', 'reason'],
        },
      },
      punchIns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            wordStart: { type: 'integer' },
            wordEnd: { type: 'integer' },
            scale: { type: 'number' },
            focusX: { type: 'number' },
            focusY: { type: 'number' },
            reason: { type: 'string' },
          },
          required: ['wordStart', 'wordEnd', 'scale', 'focusX', 'focusY', 'reason'],
        },
      },
      placements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            wordStart: { type: 'integer' },
            wordEnd: { type: 'integer' },
            placement: { type: 'string', enum: ['overlay', 'cutaway'] },
            anchor: { type: 'string', enum: anchors },
            reason: { type: 'string' },
          },
          required: ['wordStart', 'wordEnd', 'placement', 'anchor', 'reason'],
        },
      },
    },
    required: ['summary', 'defaultOverlayAnchor', 'cuts', 'punchIns', 'placements'],
  };
}

/**
 * `video.direct` (spec 18 R4.2): multimodal video director defaulting to `gemini-4-neon`
 * (`cfg.modelStrong`). Reads the source-clock transcript + sampled video keyframes and outputs
 * smart retake/mistake cuts, punch-in zooms, face-safe overlay anchor, and placement hints.
 */
export function videoDirectTask(): TaskDef<VideoDirectInput, VideoDirectOutput> {
  return {
    id: 'video.direct',
    input: VideoDirectInputSchema,
    output: VideoDirectOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelStrong || APP_CONFIG_DEFAULTS.modelStrong,
    system: VIDEO_DIRECT_SYSTEM_V1,
    prompt: (i) =>
      videoDirectPromptV1({
        format: i.format,
        styleId: i.styleId,
        durationMs: i.durationMs,
        words: i.words,
        frameTimestampsMs: i.frames.map((f) => f.atMs),
      }),
    mediaList: (i) =>
      i.frames.length > 0
        ? i.frames.map((f) => ({ mimeType: 'image/jpeg' as const, base64: f.base64 }))
        : undefined,
    jsonSchema: videoDirectJsonSchema,
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 1,
    thinking: 'LOW',
    maxOutputTokens: 4096,
  };
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Pure enforcer (spec 18 R4.3): converts model word-index suggestions + deterministic audio EDL
 * cuts into strictly valid, non-overlapping, clamped integer-ms `VideoCut[]`, `VideoPunchIn[]`,
 * and cleaned-timeline placement hints. Never removes more than 65% of total duration.
 */
export function enforceVideoDirect(
  output: VideoDirectOutput,
  words: readonly Word[],
  originalDurationMs: number,
  audioEdlCuts: readonly AudioEdlCutInput[] = [],
  meta: { source: 'cloud' | 'rules'; model?: string } = { source: 'cloud' },
): EnforcedVideoPlan {
  const duration = Math.max(1, Math.floor(originalDurationMs));
  const rawCuts: Omit<VideoCut, 'id'>[] = [];

  // 1. Seed with deterministic audio silence/filler cuts first.
  for (const c of audioEdlCuts) {
    const startMs = clamp(Math.round(c.startMs), 0, duration);
    const endMs = clamp(Math.round(c.endMs), 0, duration);
    if (endMs - startMs < 80) continue;
    rawCuts.push({
      startMs,
      endMs,
      kind: c.kind ?? 'silence',
      reason: (c.reason ?? (c.kind === 'filler' ? 'Filler word' : 'Pause')).slice(0, 160),
      enabled: true,
    });
  }

  // 2. Add model editorial cuts mapped from word indices to source ms.
  for (const c of output.cuts) {
    const first = words[c.wordStart];
    const last = words[c.wordEnd];
    if (!first || !last || c.wordStart > c.wordEnd) continue;
    const startMs = clamp(Math.round(first.startMs), 0, duration);
    const endMs = clamp(Math.round(last.endMs), 0, duration);
    if (endMs - startMs < 120) continue;
    rawCuts.push({
      startMs,
      endMs,
      kind: c.kind,
      reason: c.reason.trim().slice(0, 160) || 'Editorial cut',
      enabled: true,
    });
  }

  // 3. Merge overlapping cuts so the stored cut list is strictly sorted & non-overlapping.
  rawCuts.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: Omit<VideoCut, 'id'>[] = [];
  for (const c of rawCuts) {
    const prev = merged[merged.length - 1];
    if (prev && c.startMs <= prev.endMs) {
      prev.endMs = Math.max(prev.endMs, c.endMs);
      // Prefer richer editorial labels over plain silence when merged.
      if (prev.kind === 'silence' && c.kind !== 'silence') {
        prev.kind = c.kind;
        prev.reason = c.reason;
      }
    } else {
      merged.push({ ...c });
    }
  }

  // 4. Safety cap: never disable/cut more than 65% of the recording.
  const maxCutMs = Math.floor(duration * 0.65);
  let cutTotal = 0;
  const cuts: VideoCut[] = [];
  for (const c of merged) {
    const len = c.endMs - c.startMs;
    const withinBudget = cutTotal + len <= maxCutMs;
    if (withinBudget) cutTotal += len;
    cuts.push({
      id: `cut-${cuts.length + 1}`,
      ...c,
      enabled: withinBudget,
    });
  }

  const segments = keptSourceSegments(duration, cuts);
  const cleanedTotal = segments[segments.length - 1]?.timelineEndMs ?? 0;

  // 5. Map punch-ins from source word ranges onto the cleaned timeline, clamped & non-overlapping.
  const punchCandidates: Omit<VideoPunchIn, 'id'>[] = [];
  for (const p of output.punchIns) {
    const first = words[p.wordStart];
    const last = words[p.wordEnd];
    if (!first || !last || p.wordStart > p.wordEnd) continue;
    const cStart = sourceToCleanedMs(first.startMs, segments);
    const cEnd = sourceToCleanedMs(Math.max(first.startMs, last.endMs - 1), segments);
    if (cStart === null || cEnd === null) continue;
    const startMs = clamp(Math.round(cStart), 0, Math.max(0, cleanedTotal - 1));
    const endMs = clamp(Math.round(cEnd + 1), startMs + 1, cleanedTotal);
    if (endMs - startMs < 600) continue;
    punchCandidates.push({
      startMs,
      endMs,
      scale: Math.round(clamp(p.scale, 1.08, 1.3) * 100) / 100,
      focusX: Math.round(clamp(p.focusX, 0.15, 0.85) * 100) / 100,
      focusY: Math.round(clamp(p.focusY, 0.15, 0.85) * 100) / 100,
      reason: p.reason.trim().slice(0, 160) || 'Emphasis punch-in',
    });
  }
  punchCandidates.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const punchIns: VideoPunchIn[] = [];
  for (const p of punchCandidates) {
    const prev = punchIns[punchIns.length - 1];
    if (prev && p.startMs < prev.endMs) continue;
    punchIns.push({ id: `punch-${punchIns.length + 1}`, ...p });
  }

  // 6. Map graphic placement hints onto the cleaned timeline.
  const placements: DirectedPlacementHint[] = [];
  for (const pl of output.placements) {
    const first = words[pl.wordStart];
    const last = words[pl.wordEnd];
    if (!first || !last || pl.wordStart > pl.wordEnd) continue;
    const cStart = sourceToCleanedMs(first.startMs, segments);
    const cEnd = sourceToCleanedMs(Math.max(first.startMs, last.endMs - 1), segments);
    if (cStart === null || cEnd === null || cEnd < cStart) continue;
    placements.push({
      startMs: Math.round(cStart),
      endMs: Math.round(cEnd + 1),
      placement: pl.placement,
      anchor: pl.anchor,
      reason: pl.reason.trim().slice(0, 160),
    });
  }

  return {
    summary: output.summary.trim().slice(0, 240) || 'Edited your video',
    defaultOverlayAnchor: output.defaultOverlayAnchor,
    cuts,
    punchIns,
    placements,
    source: meta.source,
    ...(meta.model ? { model: meta.model } : {}),
  };
}

/** Deterministic offline/fallback video director (zero AI calls). */
export function fallbackVideoDirect(
  words: readonly Word[],
  originalDurationMs: number,
  format: '16:9' | '9:16' | '1:1',
  audioEdlCuts: readonly AudioEdlCutInput[] = [],
): EnforcedVideoPlan {
  const defaultOverlayAnchor: OverlayAnchor = format === '9:16' ? 'top-right' : 'side-right';
  const base = enforceVideoDirect(
    {
      summary: 'Trimmed pauses and fillers, added rhythmic punch-ins and overlay anchors',
      defaultOverlayAnchor,
      cuts: [],
      punchIns: [],
      placements: [],
    },
    words,
    originalDurationMs,
    audioEdlCuts,
    { source: 'rules' },
  );

  // Add subtle alternating 1.15x punch-ins on kept segments longer than 2.4s.
  const segments = keptSourceSegments(originalDurationMs, base.cuts);
  const punchIns: VideoPunchIn[] = [];
  segments.forEach((seg, idx) => {
    const len = seg.timelineEndMs - seg.timelineStartMs;
    if (idx % 2 === 1 && len >= 2400) {
      punchIns.push({
        id: `punch-${punchIns.length + 1}`,
        startMs: seg.timelineStartMs,
        endMs: seg.timelineEndMs,
        scale: 1.15,
        focusX: 0.5,
        focusY: 0.35,
        reason: 'Jump-cut punch-in',
      });
    }
  });
  return { ...base, punchIns };
}

/**
 * Runs `video.direct` through the AI router (defaulting to `gemini-4-neon`, or an explicit
 * `model` override), enforces the plan in code, and falls back deterministically when offline.
 */
export async function directVideo(
  router: Router | null,
  params: {
    format: '16:9' | '9:16' | '1:1';
    styleId: string;
    durationMs: number;
    words: readonly Word[];
    frames?: readonly { atMs: number; base64: string }[];
    audioEdlCuts?: readonly AudioEdlCutInput[];
    model?: string;
  },
): Promise<EnforcedVideoPlan> {
  const edl = params.audioEdlCuts ?? [];
  if (!router || params.words.length === 0) {
    return fallbackVideoDirect(params.words, params.durationMs, params.format, edl);
  }
  try {
    const input: VideoDirectInput = {
      format: params.format,
      styleId: params.styleId,
      durationMs: params.durationMs,
      words: params.words
        .slice(0, 3000)
        .map((w, i) => [i, w.startMs, w.endMs, w.text] as [number, number, number, string]),
      frames: (params.frames ?? []).slice(0, 6),
    };
    const res = await router.run(videoDirectTask(), input, {
      mode: 'ONLY_IN_CLOUD',
      allowCloud: false,
      ...(params.model ? { model: params.model } : {}),
    });
    return enforceVideoDirect(res.output, params.words, params.durationMs, edl, {
      source: 'cloud',
      model: res.model,
    });
  } catch {
    return fallbackVideoDirect(params.words, params.durationMs, params.format, edl);
  }
}
