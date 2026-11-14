'use client';

import { useEffect, useRef } from 'react';
import { peaksForRange } from '@/lib/audio/peaks';
import { msToX } from '@/lib/timeline/geometry';
import { useTimeline } from './timeline-context';

const PITCH = 4; // px between bars
const BAR = 2; // bar width
const MIN_H = 4;
const MAX_H = 31;

/**
 * VOICE track (spec 04 R4.4): waveform bars from worker-computed peaks. Two canvases: a dim
 * base and an ember copy clipped at `--playhead-x`, so playback never redraws.
 */
export function VoiceTrack({ peaks, bucketMs }: { peaks: Float32Array | null; bucketMs: number }) {
  const { view, widthPx, durationMs } = useTimeline();
  const bandLeft = msToX(0, view);
  const bandWidth = msToX(durationMs, view) - bandLeft;
  const base = useRef<HTMLCanvasElement>(null);
  const played = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const height = 46;
    const dpr = window.devicePixelRatio || 1;
    const cols = Math.floor(widthPx / PITCH);
    const startMs = view.scrollMs;
    const endMs = view.scrollMs + (cols * PITCH) / view.pxPerMs;
    const agg = peaks ? peaksForRange(peaks, bucketMs, startMs, endMs, cols) : null;
    let peak = 0;
    if (agg) for (let i = 0; i < agg.length; i++) peak = Math.max(peak, Math.abs(agg[i] ?? 0));

    const paint = (canvas: HTMLCanvasElement | null, color: string) => {
      if (!canvas) return;
      canvas.width = Math.round(widthPx * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${widthPx}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, widthPx, height);
      ctx.fillStyle = color;
      if (!agg || peak === 0) return;
      for (let c = 0; c < cols; c++) {
        const amp = Math.max(Math.abs(agg[c * 2] ?? 0), Math.abs(agg[c * 2 + 1] ?? 0)) / peak;
        if (amp < 0.02) continue;
        const h = MIN_H + amp * (MAX_H - MIN_H);
        ctx.beginPath();
        ctx.roundRect(c * PITCH + PITCH - BAR, height / 2 - h / 2, BAR, h, 1);
        ctx.fill();
      }
    };
    const css = getComputedStyle(document.documentElement);
    paint(base.current, css.getPropertyValue('--color-text').trim() || 'white');
    paint(played.current, css.getPropertyValue('--color-ember').trim() || 'orange');
  }, [peaks, bucketMs, view, widthPx]);

  return (
    <>
      {/* The voiceover band: dim ember, brighter where it has played. */}
      <span
        aria-hidden
        className="absolute top-1 h-[38px] rounded-[7px] border border-ember/25 bg-ember/5"
        style={{ left: bandLeft, width: bandWidth }}
      />
      <span
        aria-hidden
        className="absolute top-1 h-[38px] rounded-[7px] bg-[linear-gradient(90deg,rgb(255_122_61/0.14),rgb(255_122_61/0.22))]"
        style={{
          left: bandLeft,
          width: bandWidth,
          clipPath: `inset(0 calc(100% - (var(--playhead-x) - ${bandLeft}px)) 0 0)`,
        }}
      />
      <span
        aria-hidden
        className="absolute top-2.5 h-6 w-16 -translate-x-1/2 rounded-full bg-ember/7 blur-[2px]"
        style={{ left: 'var(--playhead-x)' }}
      />
      <canvas ref={base} aria-hidden className="absolute top-0 left-0 opacity-35" />
      <canvas
        ref={played}
        aria-label="Voiceover waveform"
        className="absolute top-0 left-0 opacity-80"
        style={{ clipPath: 'inset(0 calc(100% - var(--playhead-x)) 0 0)' }}
      />
    </>
  );
}
