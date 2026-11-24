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

export const VIDEO_ROW_HEIGHT = 44;
export const STOCK_ROW_HEIGHT = 34;

export interface TimelineRowGeometry {
  top: number;
  height: number;
}

/**
 * Computes timeline height and row positions with dedicated `Stock Media` and `Stock Audio`
 * layers so creators can always place, see, drag, trim, and audition stock clips.
 */
export function timelineLayout(hasVideo: boolean): {
  height: number;
  rows: {
    ruler: TimelineRowGeometry;
    slots: TimelineRowGeometry;
    video?: TimelineRowGeometry;
    stockMedia: TimelineRowGeometry;
    words: TimelineRowGeometry;
    voice: TimelineRowGeometry;
    audio: TimelineRowGeometry;
    stockAudio: TimelineRowGeometry;
  };
} {
  let y = TL.rows.slots.top + TL.rows.slots.height;
  let video: TimelineRowGeometry | undefined;
  if (hasVideo) {
    video = { top: y, height: VIDEO_ROW_HEIGHT };
    y += VIDEO_ROW_HEIGHT;
  }
  const stockMedia: TimelineRowGeometry = { top: y, height: STOCK_ROW_HEIGHT };
  y += STOCK_ROW_HEIGHT;
  const words: TimelineRowGeometry = { top: y, height: TL.rows.words.height };
  y += TL.rows.words.height;
  const voice: TimelineRowGeometry = { top: y, height: TL.rows.voice.height };
  y += TL.rows.voice.height;
  const audio: TimelineRowGeometry = { top: y, height: TL.rows.audio.height };
  y += TL.rows.audio.height;
  const stockAudio: TimelineRowGeometry = { top: y, height: STOCK_ROW_HEIGHT };
  y += STOCK_ROW_HEIGHT;

  return {
    height: y + 18,
    rows: {
      ruler: TL.rows.ruler,
      slots: TL.rows.slots,
      ...(video ? { video } : {}),
      stockMedia,
      words,
      voice,
      audio,
      stockAudio,
    },
  };
}
