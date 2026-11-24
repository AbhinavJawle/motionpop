import { z } from 'zod';

/**
 * Video-native editing (spec 18). All times are integer milliseconds. Cuts and kept segments use
 * the source clock (the uploaded video). Punch-ins use the cleaned timeline (the video after cuts).
 *
 * This file must not import from `project.ts`: `project.ts` imports these schemas.
 */

const IntMsSchema = z.number().int().nonnegative();

export const VideoCutKindSchema = z.enum(['silence', 'filler', 'retake', 'ramble', 'manual']);
export type VideoCutKind = z.infer<typeof VideoCutKindSchema>;

/** A removed range of the source video. */
export const VideoCutSchema = z
  .object({
    id: z.string().min(1),
    startMs: IntMsSchema,
    endMs: IntMsSchema,
    kind: VideoCutKindSchema,
    reason: z.string().max(160),
    enabled: z.boolean(),
  })
  .refine((c) => c.endMs > c.startMs, { message: 'endMs must be greater than startMs' });
export type VideoCut = z.infer<typeof VideoCutSchema>;

/** A zoom on the cleaned timeline. `focusX` and `focusY` are 0..1 across the frame. */
export const VideoPunchInSchema = z
  .object({
    id: z.string().min(1),
    startMs: IntMsSchema,
    endMs: IntMsSchema,
    scale: z.number().min(1.05).max(1.4),
    focusX: z.number().min(0).max(1),
    focusY: z.number().min(0).max(1),
    reason: z.string().max(160),
  })
  .refine((p) => p.endMs > p.startMs, { message: 'endMs must be greater than startMs' });
export type VideoPunchIn = z.infer<typeof VideoPunchInSchema>;

/** Where an overlay card sits over the speaker. */
export const OverlayAnchorSchema = z.enum([
  'top-right',
  'top-left',
  'lower-third',
  'side-right',
  'side-left',
  'center',
]);
export type OverlayAnchor = z.infer<typeof OverlayAnchorSchema>;

/** `cutaway` covers the speaker full-screen; `overlay` is a card over them. */
export const SlotPlacementSchema = z.enum(['cutaway', 'overlay']);
export type SlotPlacement = z.infer<typeof SlotPlacementSchema>;

/** Coupled choreography modes for how the speaker video dances with each beat (spec 19 + 20 + 23). */
export const VIDEO_STAGE_MODES = [
  'split-top-stage',
  'top-card',
  'clean',
  'full',
  'split-left',
  'split-right',
  'pip',
  'backdrop',
  'cutaway',
  'split-top-broll',
  'screen-showcase',
  'broll-full',
  'media-card-pop',
] as const;
export const VideoStageModeSchema = z.enum(VIDEO_STAGE_MODES);
export type VideoStageMode = z.infer<typeof VideoStageModeSchema>;

/** Stage modes that display a secondary clip (B-roll, screen recording, or screenshot) from `mediaBin`. */
export const MEDIA_STAGE_MODES = [
  'split-top-broll',
  'screen-showcase',
  'broll-full',
  'media-card-pop',
] as const;
export type MediaStageMode = (typeof MEDIA_STAGE_MODES)[number];
export const isMediaStageMode = (mode: VideoStageMode): mode is MediaStageMode =>
  (MEDIA_STAGE_MODES as readonly string[]).includes(mode);

/** Kinds of secondary media a creator can attach to a project's Media Bin (spec 20). */
export const MEDIA_CLIP_KINDS = ['broll', 'screen-recording', 'screenshot', 'photo'] as const;
export const MediaClipKindSchema = z.enum(MEDIA_CLIP_KINDS);
export type MediaClipKind = z.infer<typeof MediaClipKindSchema>;

/** One AI-identified usable moment inside a B-roll video, screen recording, or screenshot (spec 20). */
export const MediaClipMomentSchema = z
  .object({
    startMs: IntMsSchema,
    endMs: IntMsSchema,
    focusX: z.number().min(0).max(1).default(0.5),
    focusY: z.number().min(0).max(1).default(0.5),
    zoom: z.number().min(1).max(2.4).default(1),
    description: z.string().max(220),
  })
  .refine((m) => m.endMs >= m.startMs, { message: 'endMs must be >= startMs' });
export type MediaClipMoment = z.infer<typeof MediaClipMomentSchema>;

/** One user-uploaded B-roll clip, screen recording, screenshot, or photo in the Media Bin (spec 20). */
export const MediaClipSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  /** Local AudioStore/Blob ref (`idb:…`) or uploaded storage path. */
  src: z.string().min(1),
  kind: MediaClipKindSchema,
  mimeType: z.string().min(1).max(80),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Video duration in ms; omitted for still screenshots/photos. */
  durationMs: z.number().int().positive().optional(),
  /** One-sentence AI visual description populated by `media.index`. */
  summary: z.string().max(320).optional(),
  tags: z.array(z.string().max(40)).max(12).optional(),
  dominantColors: z.array(z.string().max(20)).max(6).optional(),
  moments: z.array(MediaClipMomentSchema).max(8).optional(),
  /** Epoch ms when multimodal indexing finished. */
  indexedAt: IntMsSchema.optional(),
});
export type MediaClip = z.infer<typeof MediaClipSchema>;

/** Visual archetypes rotated across beats to enforce variety (spec 19). */
export const BEAT_ARCHETYPES = [
  'kinetic-type',
  'hero-stat',
  'callout-hud',
  'data-chart',
  'diagram-flow',
  'comparison-split',
  'map-story',
] as const;
export const BeatArchetypeSchema = z.enum(BEAT_ARCHETYPES);
export type BeatArchetype = z.infer<typeof BeatArchetypeSchema>;

export const PipCornerSchema = z.enum(['bottom-left', 'bottom-right', 'top-left', 'top-right']);
export type PipCorner = z.infer<typeof PipCornerSchema>;

/** One choreographed video stage segment on the cleaned timeline (spec 19 + 20). */
export const VideoStageSegmentSchema = z
  .object({
    id: z.string().min(1),
    startMs: IntMsSchema,
    endMs: IntMsSchema,
    mode: VideoStageModeSchema,
    focusX: z.number().min(0).max(1).default(0.5),
    focusY: z.number().min(0).max(1).default(0.35),
    scaleFrom: z.number().min(1).max(1.35).default(1),
    scaleTo: z.number().min(1).max(1.35).default(1.05),
    pipCorner: PipCornerSchema.optional(),
    /** Optional Media Bin clip bound to this beat (spec 20). */
    clipId: z.string().min(1).max(64).optional(),
    clipStartMs: IntMsSchema.optional(),
    clipEndMs: IntMsSchema.optional(),
    clipFocusX: z.number().min(0).max(1).optional(),
    clipFocusY: z.number().min(0).max(1).optional(),
    clipZoom: z.number().min(1).max(2.4).optional(),
  })
  .refine((s) => s.endMs > s.startMs, { message: 'endMs must be greater than startMs' });
export type VideoStageSegment = z.infer<typeof VideoStageSegmentSchema>;

/** The source video the project is built on. */
export const VideoTrackSchema = z.object({
  src: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  originalDurationMs: z.number().int().positive(),
  /** Compact JPEG keyframe data URL captured at probe time for dashboard/editor thumbnails (spec 41). */
  posterUrl: z.string().max(120_000).optional(),
  cuts: z.array(VideoCutSchema).default([]),
  /** Non-destructive manual razor split points on the source clock (spec 45 R1.3). */
  splits: z.array(IntMsSchema).max(64).optional(),
  punchIns: z.array(VideoPunchInSchema).default([]),
  stages: z.array(VideoStageSegmentSchema).optional(),
  defaultOverlayAnchor: OverlayAnchorSchema.default('top-right'),
});
export type VideoTrack = z.infer<typeof VideoTrackSchema>;

/** A kept range of the source video, with its position on the cleaned timeline. */
export interface KeptSegment {
  startMs: number;
  endMs: number;
  timelineStartMs: number;
  timelineEndMs: number;
}

/**
 * The source ranges that remain after removing the enabled cuts. Cuts are clamped to
 * [0, originalDurationMs], then overlapping or touching cuts are merged. Kept segments are the gaps
 * between them, sorted, non-overlapping and non-empty. Each carries its cumulative cleaned start
 * and end. Kept durations plus merged cut durations always sum to `originalDurationMs`.
 */
export function keptSourceSegments(
  originalDurationMs: number,
  cuts: ReadonlyArray<Pick<VideoCut, 'startMs' | 'endMs' | 'enabled'>>,
): KeptSegment[] {
  const total = Math.max(0, Math.floor(originalDurationMs));
  const clamped = cuts
    .filter((c) => c.enabled)
    .map((c) => ({
      startMs: Math.min(total, Math.max(0, c.startMs)),
      endMs: Math.min(total, Math.max(0, c.endMs)),
    }))
    .filter((c) => c.endMs > c.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged: { startMs: number; endMs: number }[] = [];
  for (const c of clamped) {
    const last = merged[merged.length - 1];
    if (last && c.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, c.endMs);
    } else {
      merged.push({ ...c });
    }
  }

  const kept: { startMs: number; endMs: number }[] = [];
  let cursor = 0;
  for (const c of merged) {
    if (c.startMs > cursor) kept.push({ startMs: cursor, endMs: c.startMs });
    cursor = c.endMs;
  }
  if (total > cursor) kept.push({ startMs: cursor, endMs: total });

  let timeline = 0;
  return kept.map((k) => {
    const seg: KeptSegment = {
      startMs: k.startMs,
      endMs: k.endMs,
      timelineStartMs: timeline,
      timelineEndMs: timeline + (k.endMs - k.startMs),
    };
    timeline = seg.timelineEndMs;
    return seg;
  });
}

/** Total length of the cleaned timeline. */
export function cleanedDurationFromSegments(segments: readonly KeptSegment[]): number {
  const last = segments[segments.length - 1];
  return last ? last.timelineEndMs : 0;
}

/** One selectable, cuttable display segment on the main Video track (spec 45 R1.3). */
export interface VideoDisplaySegment extends KeptSegment {
  /** Stable key derived from source range. */
  key: string;
  /** Zero-based display order along the cleaned timeline. */
  index: number;
  /** True when the start boundary of this segment is a manual split seam (mergeable). */
  splitAtStart: boolean;
}

/**
 * Partitions `keptSourceSegments` at any interior manual split points (`splits`, on the source
 * clock). Returned segments are strictly sorted, non-overlapping, non-empty, and their timeline
 * durations always sum to `cleanedDurationFromSegments(keptSourceSegments(...))`.
 */
export function videoDisplaySegments(
  originalDurationMs: number,
  cuts: ReadonlyArray<Pick<VideoCut, 'startMs' | 'endMs' | 'enabled'>>,
  splits: readonly number[] | undefined,
): VideoDisplaySegment[] {
  const kept = keptSourceSegments(originalDurationMs, cuts);
  const sortedSplits = [...new Set((splits ?? []).map((n) => Math.floor(n)))].sort((a, b) => a - b);
  const out: VideoDisplaySegment[] = [];
  let timeline = 0;

  for (const seg of kept) {
    const interior = sortedSplits.filter((s) => s > seg.startMs && s < seg.endMs);
    const bounds = [seg.startMs, ...interior, seg.endMs];
    for (let i = 0; i < bounds.length - 1; i++) {
      const startMs = bounds[i]!;
      const endMs = bounds[i + 1]!;
      if (endMs <= startMs) continue;
      const dur = endMs - startMs;
      out.push({
        key: `${startMs}-${endMs}`,
        index: out.length,
        startMs,
        endMs,
        timelineStartMs: timeline,
        timelineEndMs: timeline + dur,
        splitAtStart: i > 0,
      });
      timeline += dur;
    }
  }
  return out;
}

/**
 * The source time shown at a cleaned-timeline time. Times past the end clamp to the last kept
 * source frame. With no segments there is nothing to show, so the result is 0.
 */
export function cleanedToSourceMs(cleanedMs: number, segments: readonly KeptSegment[]): number {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return 0;
  if (cleanedMs <= 0) return first.startMs;
  if (cleanedMs >= last.timelineEndMs) return last.endMs;
  for (const seg of segments) {
    if (cleanedMs >= seg.timelineStartMs && cleanedMs < seg.timelineEndMs) {
      return seg.startMs + (cleanedMs - seg.timelineStartMs);
    }
  }
  return last.endMs;
}

/**
 * The cleaned-timeline time of a source time, or `null` when that source time lies inside a cut.
 * The end of a kept segment (exclusive) maps to `null`.
 */
export function sourceToCleanedMs(
  sourceMs: number,
  segments: readonly KeptSegment[],
): number | null {
  for (const seg of segments) {
    if (sourceMs >= seg.startMs && sourceMs < seg.endMs) {
      return seg.timelineStartMs + (sourceMs - seg.startMs);
    }
  }
  return null;
}

/** The punch-in active at a cleaned-timeline time (start inclusive, end exclusive), or `null`. */
export function activePunchIn(
  cleanedMs: number,
  punchIns: readonly VideoPunchIn[],
): VideoPunchIn | null {
  for (const p of punchIns) {
    if (cleanedMs >= p.startMs && cleanedMs < p.endMs) return p;
  }
  return null;
}

/** Smooth beat-to-beat stage choreography transition duration in ms (spec 19). */
export const STAGE_TRANSITION_MS = 420;
/** Smooth ease-in/out ramp duration for punch-in zooms in ms. */
export const PUNCH_RAMP_MS = 340;

/** Evaluated deterministic video stage geometry at one frame time `tMs` (pixel + visual state). */
export interface VideoStageRect {
  mode: VideoStageMode;
  /** Container bounds in frame pixels (0..width, 0..height). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius in frame pixels (0 for full-bleed). */
  radius: number;
  /** When true, only the top two corners are rounded (editorial arched bottom speaker frame, spec 23). */
  topRadiusOnly?: boolean;
  /** Subtle drop shadow alpha (0..1) when framed in split/pip. */
  shadow: number;
  /** Inner video zoom scale (>= 1). */
  scale: number;
  /** Object-position / transform focal point (0..1). */
  focusX: number;
  focusY: number;
  /** Gaussian blur radius in px (used by `backdrop` mode). */
  blurPx: number;
  /** Darkening factor 0..1 (0 = full brightness, 0.58 = dimmed backdrop). */
  dim: number;
  /** Visibility opacity 0..1 (0 during `cutaway`). */
  opacity: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Clamps vertical speaker focus into the safe head/eyes band (0.18..0.50, default 0.33) so split crops never drift to the microphone/chest (spec 24 R5.1). */
export function clampSpeakerFocusY(focusY?: number): number {
  if (typeof focusY !== 'number' || !Number.isFinite(focusY)) return 0.33;
  return Math.max(0.18, Math.min(0.5, focusY));
}

/**
 * Exact CSS `object-position` percentages (`0..100`) that center source point `(focusX, focusY)`
 * inside an `object-fit: cover` container of `(boxW, boxH)` — pixel-identical to FFmpeg's
 * `scale=increase + crop=bw:bh:round(iw*fx-bw/2):round(ih*fy-bh/2)` (spec 24 R5.1).
 */
export function coverObjectPosition(
  focusX: number,
  focusY: number,
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { xPct: number; yPct: number } {
  const sw = Math.max(1, srcW);
  const sh = Math.max(1, srcH);
  const bw = Math.max(1, boxW);
  const bh = Math.max(1, boxH);
  const coverScale = Math.max(bw / sw, bh / sh);
  const renderedW = sw * coverScale;
  const renderedH = sh * coverScale;
  const overflowX = renderedW - bw;
  const overflowY = renderedH - bh;
  const fx = clamp01(focusX);
  const fy = clamp01(focusY);
  const xPos = overflowX > 0.5 ? clamp01((fx * renderedW - bw / 2) / overflowX) : 0.5;
  const yPos = overflowY > 0.5 ? clamp01((fy * renderedH - bh / 2) / overflowY) : 0.5;
  return {
    xPct: Math.round(xPos * 1000) / 10,
    yPct: Math.round(yPos * 1000) / 10,
  };
}
/** Smooth overshoot-free quintic ease-out for choreography transitions. */
const easeOutQuint = (t: number) => 1 - Math.pow(1 - clamp01(t), 5);
/** Smooth cubic ease-in-out for continuous punch-in zoom ramps. */
const easeInOutCubic = (t: number) => {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

interface NormalizedStageBox {
  x: number;
  y: number;
  w: number;
  h: number;
  radiusFrac: number;
  topRadiusOnly?: boolean;
  shadow: number;
  blurPx: number;
  dim: number;
  opacity: number;
}

/** Target normalized layout for each video stage mode (adapts cleanly to 16:9, 9:16, 1:1). */
export function stageBoxForMode(
  mode: VideoStageMode,
  width: number,
  height: number,
  pipCorner: PipCorner = 'bottom-left',
): NormalizedStageBox {
  const vertical = height > width;
  switch (mode) {
    case 'split-top-stage':
      // Crisp 50/50 studio split (spec 24 R2.1): clipped graphic owns top 50%, face-centered
      // speaker owns bottom 50% with zero gap so the seam caption ribbon locks dead-center.
      return vertical
        ? {
            x: 0,
            y: 0.5,
            w: 1,
            h: 0.5,
            radiusFrac: 0,
            shadow: 0,
            blurPx: 0,
            dim: 0,
            opacity: 1,
          }
        : {
            x: 0.54,
            y: 0.06,
            w: 0.43,
            h: 0.88,
            radiusFrac: 0.026,
            shadow: 0.36,
            blurPx: 0,
            dim: 0,
            opacity: 1,
          };
    case 'top-card':
    case 'clean':
      return { x: 0, y: 0, w: 1, h: 1, radiusFrac: 0, shadow: 0, blurPx: 0, dim: 0, opacity: 1 };
    case 'split-left':
      return vertical
        ? {
            x: 0.05,
            y: 0.04,
            w: 0.9,
            h: 0.42,
            radiusFrac: 0.028,
            shadow: 0.42,
            blurPx: 0,
            dim: 0,
            opacity: 1,
          }
        : {
            x: 0.03,
            y: 0.06,
            w: 0.43,
            h: 0.88,
            radiusFrac: 0.024,
            shadow: 0.42,
            blurPx: 0,
            dim: 0,
            opacity: 1,
          };
    case 'split-right':
      return vertical
        ? {
            x: 0.05,
            y: 0.54,
            w: 0.9,
            h: 0.42,
            radiusFrac: 0.028,
            shadow: 0.42,
            blurPx: 0,
            dim: 0,
            opacity: 1,
          }
        : {
            x: 0.54,
            y: 0.06,
            w: 0.43,
            h: 0.88,
            radiusFrac: 0.024,
            shadow: 0.42,
            blurPx: 0,
            dim: 0,
            opacity: 1,
          };
    case 'pip': {
      const pw = vertical ? 0.32 : 0.23;
      const ph = vertical ? 0.2 : 0.27;
      const mx = 0.035;
      const my = 0.045;
      const x = pipCorner.endsWith('right') ? 1 - mx - pw : mx;
      const y = pipCorner.startsWith('top') ? my : 1 - my - ph;
      return { x, y, w: pw, h: ph, radiusFrac: 0.022, shadow: 0.52, blurPx: 0, dim: 0, opacity: 1 };
    }
    case 'backdrop':
      return {
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        radiusFrac: 0,
        shadow: 0,
        blurPx: 10,
        dim: 0.56,
        opacity: 1,
      };
    case 'cutaway':
      return { x: 0, y: 0, w: 1, h: 1, radiusFrac: 0, shadow: 0, blurPx: 0, dim: 0, opacity: 0 };
    case 'split-top-broll':
      return vertical
        ? {
            x: 0.04,
            y: 0.54,
            w: 0.92,
            h: 0.42,
            radiusFrac: 0.028,
            shadow: 0.44,
            blurPx: 0,
            dim: 0,
            opacity: 1,
          }
        : {
            x: 0.03,
            y: 0.08,
            w: 0.42,
            h: 0.84,
            radiusFrac: 0.024,
            shadow: 0.44,
            blurPx: 0,
            dim: 0,
            opacity: 1,
          };
    case 'screen-showcase': {
      const pw = vertical ? 0.3 : 0.21;
      const ph = vertical ? 0.19 : 0.26;
      const mx = 0.04;
      const my = 0.045;
      const x = pipCorner.endsWith('right') ? 1 - mx - pw : mx;
      const y = pipCorner.startsWith('top') ? my : 1 - my - ph;
      return { x, y, w: pw, h: ph, radiusFrac: 0.026, shadow: 0.56, blurPx: 0, dim: 0, opacity: 1 };
    }
    case 'broll-full':
      return { x: 0, y: 0, w: 1, h: 1, radiusFrac: 0, shadow: 0, blurPx: 0, dim: 0, opacity: 0 };
    case 'media-card-pop':
      return vertical
        ? { x: 0, y: 0, w: 1, h: 1, radiusFrac: 0, shadow: 0, blurPx: 2, dim: 0.22, opacity: 1 }
        : {
            x: 0.03,
            y: 0.06,
            w: 0.45,
            h: 0.88,
            radiusFrac: 0.024,
            shadow: 0.4,
            blurPx: 0,
            dim: 0,
            opacity: 1,
          };
    case 'full':
    default:
      return { x: 0, y: 0, w: 1, h: 1, radiusFrac: 0, shadow: 0, blurPx: 0, dim: 0, opacity: 1 };
  }
}

/** Evaluated deterministic secondary-media layer geometry (B-roll, screen recording, screenshot, spec 20). */
export interface MediaLayerRect {
  visible: boolean;
  mode: VideoStageMode;
  clipId: string | null;
  /** Beat start on cleaned timeline (for computing synced media playback time). */
  beatStartMs: number;
  /** Offset into the source clip in ms. */
  clipStartMs: number;
  clipEndMs?: number;
  /** Container bounds in frame pixels (0..width, 0..height). */
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  shadow: number;
  /** Smooth 3D perspective tilt in degrees (non-zero for `screen-showcase` / `media-card-pop`). */
  rotateX: number;
  rotateY: number;
  /** Inner media zoom scale (>= 1). */
  scale: number;
  focusX: number;
  focusY: number;
  /** True when rendered inside a sleek rounded browser/app window frame (`screen-showcase`). */
  framed: boolean;
  /** Opacity 0..1 (springs smoothly in and out across transitions). */
  opacity: number;
  /** Layering order relative to A-roll (`0` = below A-roll PiP, `2` = floating above dimmed A-roll). */
  zIndex: number;
}

interface NormalizedMediaBox {
  x: number;
  y: number;
  w: number;
  h: number;
  radiusFrac: number;
  shadow: number;
  rotateX: number;
  rotateY: number;
  framed: boolean;
  zIndex: number;
}

/** Normalized layout box for secondary media clips across 9:16 and 16:9 formats (spec 20). */
export function mediaBoxForMode(
  mode: VideoStageMode,
  width: number,
  height: number,
): NormalizedMediaBox | null {
  const vertical = height > width;
  switch (mode) {
    case 'split-top-broll':
      return vertical
        ? {
            x: 0.04,
            y: 0.04,
            w: 0.92,
            h: 0.47,
            radiusFrac: 0.028,
            shadow: 0.48,
            rotateX: 0,
            rotateY: 0,
            framed: false,
            zIndex: 1,
          }
        : {
            x: 0.48,
            y: 0.08,
            w: 0.49,
            h: 0.84,
            radiusFrac: 0.024,
            shadow: 0.48,
            rotateX: 0,
            rotateY: 0,
            framed: false,
            zIndex: 1,
          };
    case 'screen-showcase':
      return vertical
        ? {
            x: 0.05,
            y: 0.09,
            w: 0.9,
            h: 0.56,
            radiusFrac: 0.026,
            shadow: 0.6,
            rotateX: 2.5,
            rotateY: -3.5,
            framed: true,
            zIndex: 0,
          }
        : {
            x: 0.14,
            y: 0.09,
            w: 0.8,
            h: 0.78,
            radiusFrac: 0.022,
            shadow: 0.6,
            rotateX: 2.0,
            rotateY: -4.0,
            framed: true,
            zIndex: 0,
          };
    case 'broll-full':
      return {
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        radiusFrac: 0,
        shadow: 0,
        rotateX: 0,
        rotateY: 0,
        framed: false,
        zIndex: 0,
      };
    case 'media-card-pop':
      return vertical
        ? {
            x: 0.08,
            y: 0.12,
            w: 0.84,
            h: 0.42,
            radiusFrac: 0.03,
            shadow: 0.62,
            rotateX: 1.5,
            rotateY: 2.5,
            framed: false,
            zIndex: 2,
          }
        : {
            x: 0.51,
            y: 0.14,
            w: 0.45,
            h: 0.72,
            radiusFrac: 0.026,
            shadow: 0.62,
            rotateX: 1.5,
            rotateY: -3.0,
            framed: false,
            zIndex: 2,
          };
    default:
      return null;
  }
}

const MEDIA_EXIT_MS = 280;

/**
 * Pure deterministic evaluator for the secondary Media Bin layer (B-roll, screen recordings,
 * screenshots) at frame time `cleanedMs` (spec 20 R1.4). Smoothly springs in on entry, smoothly
 * zooms toward `(clipFocusX, clipFocusY, clipZoom)` across `screen-showcase` beats, and glides
 * out across `MEDIA_EXIT_MS` when leaving a media beat so clips never hard-snap.
 */
export function mediaLayerRectAt(
  cleanedMs: number,
  stages: readonly VideoStageSegment[] | undefined,
  width: number,
  height: number,
): MediaLayerRect {
  const hidden: MediaLayerRect = {
    visible: false,
    mode: 'full',
    clipId: null,
    beatStartMs: 0,
    clipStartMs: 0,
    x: 0,
    y: 0,
    w: width,
    h: height,
    radius: 0,
    shadow: 0,
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    focusX: 0.5,
    focusY: 0.5,
    framed: false,
    opacity: 0,
    zIndex: 0,
  };
  if (!stages || stages.length === 0) return hidden;

  let idx = stages.findIndex((s) => cleanedMs >= s.startMs && cleanedMs < s.endMs);
  if (idx < 0) idx = cleanedMs < (stages[0]?.startMs ?? 0) ? 0 : stages.length - 1;
  const cur = stages[idx] as VideoStageSegment;
  const prev = idx > 0 ? stages[idx - 1] : undefined;
  const shortSide = Math.min(width, height);

  const curBox = cur.clipId ? mediaBoxForMode(cur.mode, width, height) : null;
  const prevBox = prev?.clipId ? mediaBoxForMode(prev.mode, width, height) : null;

  // Leaving a media beat into a non-media beat: glide out smoothly instead of popping off.
  if (!curBox) {
    if (
      prev &&
      prevBox &&
      prev.clipId &&
      cleanedMs >= cur.startMs &&
      cleanedMs < cur.startMs + MEDIA_EXIT_MS
    ) {
      const t = easeOutQuint((cleanedMs - cur.startMs) / MEDIA_EXIT_MS);
      const liftY = lerp(0, 0.025, t);
      return {
        visible: true,
        mode: prev.mode,
        clipId: prev.clipId,
        beatStartMs: prev.startMs,
        clipStartMs: prev.clipStartMs ?? 0,
        ...(prev.clipEndMs !== undefined ? { clipEndMs: prev.clipEndMs } : {}),
        x: Math.round(prevBox.x * width * 10) / 10,
        y: Math.round((prevBox.y + liftY) * height * 10) / 10,
        w: Math.round(prevBox.w * width * 10) / 10,
        h: Math.round(prevBox.h * height * 10) / 10,
        radius: Math.round(prevBox.radiusFrac * shortSide * 10) / 10,
        shadow: Math.round(prevBox.shadow * (1 - t) * 1000) / 1000,
        rotateX: prevBox.rotateX,
        rotateY: prevBox.rotateY,
        scale: Math.round(lerp(prev.clipZoom ?? 1.05, 0.96, t) * 1000) / 1000,
        focusX: prev.clipFocusX ?? 0.5,
        focusY: prev.clipFocusY ?? 0.5,
        framed: prevBox.framed,
        opacity: Math.round((1 - t) * 1000) / 1000,
        zIndex: prevBox.zIndex,
      };
    }
    return hidden;
  }

  const curDur = Math.max(1, cur.endMs - cur.startMs);
  const curProg = clamp01((cleanedMs - cur.startMs) / curDur);
  const targetZoom =
    cur.clipZoom ??
    (cur.mode === 'screen-showcase' ? 1.45 : cur.mode === 'broll-full' ? 1.07 : 1.04);
  // Screen-showcase smoothly ramps into the UI focal region after a short settle, then eases gently.
  const zoomCurve =
    cur.mode === 'screen-showcase' ? easeInOutCubic(clamp01((curProg - 0.12) / 0.55)) : curProg;
  const innerScale = lerp(1.0, targetZoom, zoomCurve);

  let x = curBox.x;
  let y = curBox.y;
  let w = curBox.w;
  let h = curBox.h;
  let radiusFrac = curBox.radiusFrac;
  let shadow = curBox.shadow;
  let rotateX = curBox.rotateX;
  let rotateY = curBox.rotateY;
  let opacity = 1;
  let scale = innerScale;

  if (cleanedMs >= cur.startMs && cleanedMs < cur.startMs + STAGE_TRANSITION_MS) {
    const t = easeOutQuint((cleanedMs - cur.startMs) / STAGE_TRANSITION_MS);
    if (prevBox && prev?.clipId === cur.clipId) {
      x = lerp(prevBox.x, curBox.x, t);
      y = lerp(prevBox.y, curBox.y, t);
      w = lerp(prevBox.w, curBox.w, t);
      h = lerp(prevBox.h, curBox.h, t);
      radiusFrac = lerp(prevBox.radiusFrac, curBox.radiusFrac, t);
      shadow = lerp(prevBox.shadow, curBox.shadow, t);
      rotateX = lerp(prevBox.rotateX, curBox.rotateX, t);
      rotateY = lerp(prevBox.rotateY, curBox.rotateY, t);
    } else if (cur.startMs > 0 || cur.mode === 'media-card-pop' || cur.mode === 'screen-showcase') {
      // Smooth spring-in from slightly below & scaled down.
      y = lerp(curBox.y + 0.035, curBox.y, t);
      opacity = t;
      scale = lerp(0.94, innerScale, t);
      rotateX = lerp(curBox.rotateX + 3, curBox.rotateX, t);
    }
  }

  return {
    visible: true,
    mode: cur.mode,
    clipId: cur.clipId ?? null,
    beatStartMs: cur.startMs,
    clipStartMs: cur.clipStartMs ?? 0,
    ...(cur.clipEndMs !== undefined ? { clipEndMs: cur.clipEndMs } : {}),
    x: Math.round(x * width * 10) / 10,
    y: Math.round(y * height * 10) / 10,
    w: Math.round(w * width * 10) / 10,
    h: Math.round(h * height * 10) / 10,
    radius: Math.round(radiusFrac * shortSide * 10) / 10,
    shadow: Math.round(shadow * 1000) / 1000,
    rotateX: Math.round(rotateX * 100) / 100,
    rotateY: Math.round(rotateY * 100) / 100,
    scale: Math.round(scale * 1000) / 1000,
    focusX: cur.clipFocusX ?? 0.5,
    focusY: cur.clipFocusY ?? 0.5,
    framed: curBox.framed,
    opacity: Math.round(opacity * 1000) / 1000,
    zIndex: curBox.zIndex,
  };
}

/** Eased punch-in multiplier at `cleanedMs` (smooth 340 ms ramp in and out, never hard-snapping). */
export function easedPunchInAt(
  cleanedMs: number,
  punchIns: readonly VideoPunchIn[],
): { scale: number; focusX: number; focusY: number } | null {
  const p = activePunchIn(cleanedMs, punchIns);
  if (!p) return null;
  const dur = Math.max(1, p.endMs - p.startMs);
  const ramp = Math.min(PUNCH_RAMP_MS, Math.floor(dur / 3));
  let env = 1;
  if (ramp > 0) {
    const into = cleanedMs - p.startMs;
    const left = p.endMs - cleanedMs;
    if (into < ramp) env = easeInOutCubic(into / ramp);
    else if (left < ramp) env = easeInOutCubic(left / ramp);
  }
  return {
    scale: lerp(1, p.scale, env),
    focusX: p.focusX,
    focusY: p.focusY,
  };
}

/**
 * Pure deterministic video-stage choreography evaluator (spec 19 R1.3).
 * Smoothly springs between consecutive stage segments across `STAGE_TRANSITION_MS`, applies
 * gentle continuous push-in drift inside each beat, and blends eased punch-in zooms cleanly.
 */
export function videoStageRectAt(
  cleanedMs: number,
  stages: readonly VideoStageSegment[] | undefined,
  punchIns: readonly VideoPunchIn[],
  width: number,
  height: number,
): VideoStageRect {
  const shortSide = Math.min(width, height);
  const punch = easedPunchInAt(cleanedMs, punchIns);

  if (!stages || stages.length === 0) {
    return {
      mode: 'full',
      x: 0,
      y: 0,
      w: width,
      h: height,
      radius: 0,
      shadow: 0,
      scale: punch?.scale ?? 1,
      focusX: punch?.focusX ?? 0.5,
      focusY: punch?.focusY ?? 0.38,
      blurPx: 0,
      dim: 0,
      opacity: 1,
    };
  }

  let idx = stages.findIndex((s) => cleanedMs >= s.startMs && cleanedMs < s.endMs);
  if (idx < 0) idx = cleanedMs < (stages[0]?.startMs ?? 0) ? 0 : stages.length - 1;
  const cur = stages[idx] as VideoStageSegment;
  const prev = idx > 0 ? stages[idx - 1] : undefined;

  const target = stageBoxForMode(cur.mode, width, height, cur.pipCorner);
  const curDur = Math.max(1, cur.endMs - cur.startMs);
  const curProg = clamp01((cleanedMs - cur.startMs) / curDur);
  const driftScale = lerp(cur.scaleFrom, cur.scaleTo, curProg);

  let box = target;
  let focusX = cur.focusX;
  let focusY = cur.focusY;
  let scale = driftScale;

  if (prev && cleanedMs >= cur.startMs && cleanedMs < cur.startMs + STAGE_TRANSITION_MS) {
    const t = easeOutQuint((cleanedMs - cur.startMs) / STAGE_TRANSITION_MS);
    const prevBox = stageBoxForMode(prev.mode, width, height, prev.pipCorner);
    box = {
      x: lerp(prevBox.x, target.x, t),
      y: lerp(prevBox.y, target.y, t),
      w: lerp(prevBox.w, target.w, t),
      h: lerp(prevBox.h, target.h, t),
      radiusFrac: lerp(prevBox.radiusFrac, target.radiusFrac, t),
      ...(target.topRadiusOnly || (t < 0.5 && prevBox.topRadiusOnly)
        ? { topRadiusOnly: true }
        : {}),
      shadow: lerp(prevBox.shadow, target.shadow, t),
      blurPx: lerp(prevBox.blurPx, target.blurPx, t),
      dim: lerp(prevBox.dim, target.dim, t),
      opacity: lerp(prevBox.opacity, target.opacity, t),
    };
    focusX = lerp(prev.focusX, cur.focusX, t);
    focusY = lerp(prev.focusY, cur.focusY, t);
    scale = lerp(prev.scaleTo, driftScale, t);
  }

  const finalScale = punch ? Math.max(scale, punch.scale) : scale;
  const finalFocusX = punch ? punch.focusX : focusX;
  const finalFocusY = punch ? punch.focusY : focusY;

  return {
    mode: cur.mode,
    x: Math.round(box.x * width * 10) / 10,
    y: Math.round(box.y * height * 10) / 10,
    w: Math.round(box.w * width * 10) / 10,
    h: Math.round(box.h * height * 10) / 10,
    radius: Math.round(box.radiusFrac * shortSide * 10) / 10,
    ...(box.topRadiusOnly ? { topRadiusOnly: true } : {}),
    shadow: Math.round(box.shadow * 1000) / 1000,
    scale: Math.round(finalScale * 1000) / 1000,
    focusX: finalFocusX,
    focusY: finalFocusY,
    blurPx: Math.round(box.blurPx * 10) / 10,
    dim: Math.round(box.dim * 1000) / 1000,
    opacity: Math.round(box.opacity * 1000) / 1000,
  };
}

const DEFAULT_STAGE_RHYTHM: readonly VideoStageMode[] = [
  'split-top-stage',
  'split-top-stage',
  'clean',
  'split-top-stage',
  'top-card',
  'clean',
];

/** Builds gapless `VideoStageSegment[]` directly from timed storyboard beats (spec 19 + 20 + 24). */
export function stagesFromTimedBeats(
  beats: ReadonlyArray<{
    id: string;
    startMs: number;
    endMs: number;
    videoStage?: VideoStageMode;
    focusX?: number;
    focusY?: number;
    clipId?: string;
    clipStartMs?: number;
    clipEndMs?: number;
    clipFocusX?: number;
    clipFocusY?: number;
    clipZoom?: number;
  }>,
): VideoStageSegment[] {
  return beats.map((b, i) => {
    const mode: VideoStageMode =
      b.videoStage ?? (DEFAULT_STAGE_RHYTHM[i % DEFAULT_STAGE_RHYTHM.length] as VideoStageMode);
    const alternatingZoom = i % 2 === 0;
    return {
      id: `stage-${b.id}`,
      startMs: b.startMs,
      endMs: b.endMs,
      mode,
      focusX: b.focusX ?? 0.5,
      focusY: clampSpeakerFocusY(b.focusY),
      scaleFrom: mode === 'backdrop' ? 1.04 : alternatingZoom ? 1.0 : 1.06,
      scaleTo: mode === 'backdrop' ? 1.08 : alternatingZoom ? 1.06 : 1.01,
      ...(b.clipId ? { clipId: b.clipId } : {}),
      ...(b.clipStartMs !== undefined ? { clipStartMs: b.clipStartMs } : {}),
      ...(b.clipEndMs !== undefined ? { clipEndMs: b.clipEndMs } : {}),
      ...(b.clipFocusX !== undefined ? { clipFocusX: b.clipFocusX } : {}),
      ...(b.clipFocusY !== undefined ? { clipFocusY: b.clipFocusY } : {}),
      ...(b.clipZoom !== undefined ? { clipZoom: b.clipZoom } : {}),
    };
  });
}
