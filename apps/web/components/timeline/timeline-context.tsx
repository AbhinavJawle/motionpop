'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react';
import type { PlaybackClock } from '@/lib/editor/playback';
import type { View } from '@/lib/timeline/geometry';

export interface TimelineCtx {
  clock: PlaybackClock;
  view: View;
  /** Width of the time area (right of the label column), in px. */
  widthPx: number;
  durationMs: number;
}

export const TimelineContext = createContext<TimelineCtx | null>(null);

export function useTimeline(): TimelineCtx {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error('useTimeline outside <Timeline>');
  return ctx;
}

/**
 * Subscribes to the playback clock without re-rendering: `onFrame` receives every frame's
 * time and the latest view. Use it to write styles and attributes directly.
 */
export function useFrame(onFrame: (ms: number, view: View) => void): void {
  const { clock, view } = useTimeline();
  const cb = useRef(onFrame);
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    cb.current = onFrame;
    viewRef.current = view;
  });
  useEffect(() => clock.subscribe((ms) => cb.current(ms, viewRef.current)), [clock]);
  // Re-run once when the view changes so positions follow zoom and scroll while paused.
  useEffect(() => cb.current(clock.currentMs, view), [clock, view]);
}

/** Layout constants (spec 38 R7: squeezed from the 300 px Figma frame to 244 px). */
export const TL = {
  height: 244,
  header: 44,
  labelCol: 112,
  rightPad: 64,
  rows: {
    ruler: { top: 44, height: 26 },
    slots: { top: 70, height: 52 },
    words: { top: 122, height: 34 },
    voice: { top: 156, height: 38 },
    audio: { top: 194, height: 34 },
  },
} as const;

export const VIDEO_ROW_HEIGHT = 48;

export interface TimelineRowGeometry {
  top: number;
  height: number;
}

/**
 * Computes timeline height and row positions; voiceover-only projects keep exact Figma geometry
 * (300 px, 4 tracks), while video projects insert a dedicated 56 px `VIDEO` track under `SLOTS`.
 */
export function timelineLayout(hasVideo: boolean): {
  height: number;
  rows: {
    ruler: TimelineRowGeometry;
    slots: TimelineRowGeometry;
    video?: TimelineRowGeometry;
    words: TimelineRowGeometry;
    voice: TimelineRowGeometry;
    audio: TimelineRowGeometry;
  };
} {
  if (!hasVideo) {
    return { height: TL.height, rows: TL.rows };
  }
  const shift = VIDEO_ROW_HEIGHT;
  return {
    height: TL.height + shift,
    rows: {
      ruler: TL.rows.ruler,
      slots: TL.rows.slots,
      video: { top: TL.rows.slots.top + TL.rows.slots.height, height: shift },
      words: { top: TL.rows.words.top + shift, height: TL.rows.words.height },
      voice: { top: TL.rows.voice.top + shift, height: TL.rows.voice.height },
      audio: { top: TL.rows.audio.top + shift, height: TL.rows.audio.height },
    },
  };
}
