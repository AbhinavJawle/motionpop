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

/** Coupled choreography modes for how the speaker video dances with each beat (spec 19). */
export const VIDEO_STAGE_MODES = [
  'full',
  'split-left',
  'split-right',
  'pip',
  'backdrop',
  'cutaway',
] as const;
export const VideoStageModeSchema = z.enum(VIDEO_STAGE_MODES);
export type VideoStageMode = z.infer<typeof VideoStageModeSchema>;

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

/** One choreographed video stage segment on the cleaned timeline (spec 19). */
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
  })
  .refine((s) => s.endMs > s.startMs, { message: 'endMs must be greater than startMs' });
export type VideoStageSegment = z.infer<typeof VideoStageSegmentSchema>;

/** The source video the project is built on. */
export const VideoTrackSchema = z.object({
  src: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  originalDurationMs: z.number().int().positive(),
  cuts: z.array(VideoCutSchema).default([]),
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
    case 'split-left':
      return vertical
        ? { x: 0.05, y: 0.04, w: 0.9, h: 0.42, radiusFrac: 0.028, shadow: 0.42, blurPx: 0, dim: 0, opacity: 1 }
        : { x: 0.03, y: 0.06, w: 0.43, h: 0.88, radiusFrac: 0.024, shadow: 0.42, blurPx: 0, dim: 0, opacity: 1 };
    case 'split-right':
      return vertical
        ? { x: 0.05, y: 0.54, w: 0.9, h: 0.42, radiusFrac: 0.028, shadow: 0.42, blurPx: 0, dim: 0, opacity: 1 }
        : { x: 0.54, y: 0.06, w: 0.43, h: 0.88, radiusFrac: 0.024, shadow: 0.42, blurPx: 0, dim: 0, opacity: 1 };
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
      return { x: 0, y: 0, w: 1, h: 1, radiusFrac: 0, shadow: 0, blurPx: 10, dim: 0.56, opacity: 1 };
    case 'cutaway':
      return { x: 0, y: 0, w: 1, h: 1, radiusFrac: 0, shadow: 0, blurPx: 0, dim: 0, opacity: 0 };
    case 'full':
    default:
      return { x: 0, y: 0, w: 1, h: 1, radiusFrac: 0, shadow: 0, blurPx: 0, dim: 0, opacity: 1 };
  }
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
    shadow: Math.round(box.shadow * 1000) / 1000,
    scale: Math.round(finalScale * 1000) / 1000,
    focusX: finalFocusX,
    focusY: finalFocusY,
    blurPx: Math.round(box.blurPx * 10) / 10,
    dim: Math.round(box.dim * 1000) / 1000,
    opacity: Math.round(box.opacity * 1000) / 1000,
  };
}

/** Builds gapless `VideoStageSegment[]` directly from timed storyboard beats (spec 19). */
export function stagesFromTimedBeats(
  beats: ReadonlyArray<{
    id: string;
    startMs: number;
    endMs: number;
    videoStage?: VideoStageMode;
    focusX?: number;
    focusY?: number;
  }>,
): VideoStageSegment[] {
  return beats.map((b, i) => {
    const mode: VideoStageMode = b.videoStage ?? 'full';
    const alternatingZoom = i % 2 === 0;
    return {
      id: `stage-${b.id}`,
      startMs: b.startMs,
      endMs: b.endMs,
      mode,
      focusX: b.focusX ?? 0.5,
      focusY: b.focusY ?? 0.35,
      scaleFrom: mode === 'backdrop' ? 1.04 : alternatingZoom ? 1.0 : 1.06,
      scaleTo: mode === 'backdrop' ? 1.08 : alternatingZoom ? 1.06 : 1.01,
    };
  });
}
