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

/** Layout constants (spec 38 R7 + spec 45 multi-lane track controls). */
export const TL = {
  height: 244,
  header: 44,
  labelCol: 148,
  rightPad: 64,
  footer: 18,
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
export const TIMELINE_MAX_VISIBLE_HEIGHT = 380;

export interface TimelineRowGeometry {
  top: number;
  height: number;
}

export interface TimelineLayoutResult {
  /** Visible outer height of the `<section aria-label="Timeline">`. */
  height: number;
  /** Full virtual height of the timeline (header + ruler + all tracks + footer). */
  contentHeight: number;
  /** Total height of the scrollable tracks canvas (relative to top of `slots`). */
  tracksHeight: number;
  /** Visible height of the tracks viewport between ruler and footer. */
  viewportTracksHeight: number;
  /** True when extra lanes exceed the viewport cap and vertical scrolling is active. */
  scrollable: boolean;
  /** Row geometry relative to the top of the scrollable tracks canvas (`slots.top === 0`). */
  rows: {
    ruler: TimelineRowGeometry;
    slots: TimelineRowGeometry;
    video?: TimelineRowGeometry;
    stockMedia: TimelineRowGeometry;
    stockMediaLanes: TimelineRowGeometry[];
    words: TimelineRowGeometry;
    voice: TimelineRowGeometry;
    audio: TimelineRowGeometry;
    stockAudio: TimelineRowGeometry;
    stockAudioLanes: TimelineRowGeometry[];
  };
}

/**
 * Computes multi-lane timeline geometry with pinned header + ruler and a vertically scrollable
 * track stack (spec 45 R3.1). When only 1 media and 1 audio lane exist, the full stack fits
 * without scrolling.
 */
export function timelineLayout(
  hasVideo: boolean,
  mediaLaneCount = 1,
  audioLaneCount = 1,
): TimelineLayoutResult {
  const mCount = Math.max(1, Math.min(4, Math.floor(mediaLaneCount)));
  const aCount = Math.max(1, Math.min(4, Math.floor(audioLaneCount)));

  let y = 0;
  const slots: TimelineRowGeometry = { top: y, height: TL.rows.slots.height };
  y += TL.rows.slots.height;

  let video: TimelineRowGeometry | undefined;
  if (hasVideo) {
    video = { top: y, height: VIDEO_ROW_HEIGHT };
    y += VIDEO_ROW_HEIGHT;
  }

  const stockMediaLanes: TimelineRowGeometry[] = [];
  for (let i = 0; i < mCount; i++) {
    stockMediaLanes.push({ top: y, height: STOCK_ROW_HEIGHT });
    y += STOCK_ROW_HEIGHT;
  }

  const words: TimelineRowGeometry = { top: y, height: TL.rows.words.height };
  y += TL.rows.words.height;
  const voice: TimelineRowGeometry = { top: y, height: TL.rows.voice.height };
  y += TL.rows.voice.height;
  const audio: TimelineRowGeometry = { top: y, height: TL.rows.audio.height };
  y += TL.rows.audio.height;

  const stockAudioLanes: TimelineRowGeometry[] = [];
  for (let i = 0; i < aCount; i++) {
    stockAudioLanes.push({ top: y, height: STOCK_ROW_HEIGHT });
    y += STOCK_ROW_HEIGHT;
  }

  const tracksHeight = y;
  const chromeHeight = TL.header + TL.rows.ruler.height + TL.footer;
  const contentHeight = chromeHeight + tracksHeight;
  const height = Math.min(contentHeight, TIMELINE_MAX_VISIBLE_HEIGHT);
  const viewportTracksHeight = Math.max(0, height - chromeHeight);

  return {
    height,
    contentHeight,
    tracksHeight,
    viewportTracksHeight,
    scrollable: tracksHeight > viewportTracksHeight,
    rows: {
      ruler: TL.rows.ruler,
      slots,
      ...(video ? { video } : {}),
      stockMedia: stockMediaLanes[0]!,
      stockMediaLanes,
      words,
      voice,
      audio,
      stockAudio: stockAudioLanes[0]!,
      stockAudioLanes,
    },
  };
}
