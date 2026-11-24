'use client';

import { useRef } from 'react';
import { msToX } from '@/lib/timeline/geometry';
import { useFrame, useTimeline } from './timeline-context';

/**
 * The playhead line (behind slot cards, spanning every track in the scroll area) and its capsule
 * (pinned in the ruler strip above), both driven by `--playhead-x` without React re-renders.
 */
export function PlayheadLine() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 bottom-0 z-[1] w-[2px] -translate-x-[0.5px] bg-flame"
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
      className="absolute top-[2px] z-30 flex h-[20px] w-12 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border-[1.5px] border-black bg-flame select-none"
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

/** Writes `--playhead-x` (px within the time/ruler areas) every frame. */
export function usePlayheadVar(
  areaRef: React.RefObject<HTMLElement | null>,
  rulerRef?: React.RefObject<HTMLElement | null>,
): void {
  useFrame((ms, v) => {
    const px = `${msToX(ms, v)}px`;
    areaRef.current?.style.setProperty('--playhead-x', px);
    rulerRef?.current?.style.setProperty('--playhead-x', px);
  });
}
