'use client';

import { useRef } from 'react';
import { msToX } from '@/lib/timeline/geometry';
import { useFrame, useTimeline } from './timeline-context';

/**
 * The playhead line (behind slot cards) and its capsule (above everything), drawn at
 * `--playhead-x`, which the frame listener writes on the time area root (spec 04 R5.2).
 */
export function PlayheadLine() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-[20px] bottom-[14px] z-[1] w-[2px] -translate-x-[0.5px] bg-flame"
      style={{ left: 'var(--playhead-x)' }}
    />
  );
}

export function PlayheadCapsule() {
  const { clock, view } = useTimeline();
  const text = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  useFrame((ms) => {
    if (text.current) text.current.textContent = `${(ms / 1000).toFixed(1)}s`;
  });

  const toMs = (clientX: number, el: HTMLElement) => {
    const area = el.parentElement?.getBoundingClientRect();
    return area ? (clientX - area.left) / view.pxPerMs + view.scrollMs : clock.currentMs;
  };

  return (
    <div
      role="slider"
      tabIndex={-1}
      aria-label="Playhead"
      aria-valuemin={0}
      aria-valuenow={Math.round(clock.currentMs)}
      className="absolute top-0 z-30 flex h-[20px] w-12 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border-[1.5px] border-black bg-flame select-none"
      style={{ left: 'var(--playhead-x)' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        clock.pause();
      }}
      onPointerMove={(e) => {
        if (dragging.current) clock.seek(toMs(e.clientX, e.currentTarget), { transient: true });
      }}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        clock.seek(toMs(e.clientX, e.currentTarget));
      }}
    >
      <span
        ref={text}
        className="tabular font-mono text-[10px] leading-[13px] font-semibold text-black"
      >
        {(clock.currentMs / 1000).toFixed(1)}s
      </span>
    </div>
  );
}

/** Writes `--playhead-x` (px within the time area) every frame. */
export function usePlayheadVar(ref: React.RefObject<HTMLElement | null>): void {
  useFrame((ms, v) => {
    ref.current?.style.setProperty('--playhead-x', `${msToX(ms, v)}px`);
  });
}
