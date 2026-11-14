'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react';
import type { PlaybackClock } from '@/lib/editor/playback';
import type { View } from '@/lib/timeline/geometry';

export interface TimelineCtx {
  clock: PlaybackClock;
  view: View;
  /** Width of the time area (right of the 152 px label column), in px. */
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

/** Layout constants measured from the editor frame in design/figma-export.css. */
export const TL = {
  height: 300,
  header: 48,
  labelCol: 152,
  rightPad: 64,
  rows: {
    ruler: { top: 48, height: 38 },
    slots: { top: 86, height: 62 },
    words: { top: 148, height: 46 },
    voice: { top: 194, height: 46 },
    audio: { top: 240, height: 42 },
  },
} as const;
