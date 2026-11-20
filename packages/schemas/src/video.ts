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

/** The source video the project is built on. */
export const VideoTrackSchema = z.object({
  src: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  originalDurationMs: z.number().int().positive(),
  cuts: z.array(VideoCutSchema).default([]),
  punchIns: z.array(VideoPunchInSchema).default([]),
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
