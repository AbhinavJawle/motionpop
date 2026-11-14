'use client';

import { useMemo, useRef } from 'react';
import { msToX, rulerTicks } from '@/lib/timeline/geometry';
import { useFrame, useTimeline } from './timeline-context';

function label(ms: number): string {
  const s = ms / 1000;
  return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`;
}

/**
 * Ruler with labelled major ticks and minor ticks. Labels under the playhead capsule are
 * hidden (spec 04 R5.2). Clicking the ruler seeks.
 */
export function Ruler() {
  const { view, widthPx, clock } = useTimeline();
  const ticks = useMemo(() => rulerTicks(view, widthPx), [view, widthPx]);
  const labels = useRef<Map<number, HTMLSpanElement>>(new Map());

  // Hide a label only while its centre is under the capsule (≈ 42 px wide): editor.png shows
  // "6s" touching the "5.6s" capsule.
  useFrame((ms, v) => {
    const x = msToX(ms, v);
    for (const [t, el] of labels.current) {
      el.style.opacity = Math.abs(msToX(t, v) - x) < 22 ? '0' : '1';
    }
  });

  return (
    <div
      className="absolute inset-x-0 top-0 h-[38px] cursor-pointer"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        clock.seek((e.clientX - rect.left) / view.pxPerMs + view.scrollMs);
      }}
    >
      {ticks.majors.map((t) => (
        <div key={`M${t}`} className="absolute top-0 h-full" style={{ left: msToX(t, view) }}>
          <span
            ref={(el) => {
              if (el) labels.current.set(t, el);
              else labels.current.delete(t);
            }}
            className="absolute top-2 -translate-x-1/2 font-mono text-[9px] leading-3 whitespace-nowrap text-text-3 transition-opacity duration-150"
          >
            {label(t)}
          </span>
          <span className="absolute top-[26px] h-2 w-px bg-white/14" />
        </div>
      ))}
      {ticks.minors.map((t) => (
        <span
          key={`m${t}`}
          className="absolute top-[30px] h-1 w-px bg-white/8"
          style={{ left: msToX(t, view) }}
        />
      ))}
    </div>
  );
}
