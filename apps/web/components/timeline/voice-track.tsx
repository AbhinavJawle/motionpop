'use client';

import { useEffect, useRef } from 'react';
import { peaksForRange } from '@/lib/audio/peaks';
import { msToX } from '@/lib/timeline/geometry';
import { useEditorTheme } from '@/lib/editor/theme';
import { useTimeline } from './timeline-context';

const PITCH = 4; // px between bars
const BAR = 2; // bar width
const MIN_H = 4;
const MAX_H = 26;

/**
 * VOICE track (spec 04 R4.4): waveform bars from worker-computed peaks. Two canvases: a dim
 * base and a bright copy clipped at `--playhead-x`, so playback never redraws.
 */
export function VoiceTrack({ peaks, bucketMs }: { peaks: Float32Array | null; bucketMs: number }) {
  const { view, widthPx, durationMs } = useTimeline();
  const bandLeft = msToX(0, view);
  const bandWidth = msToX(durationMs, view) - bandLeft;
  const base = useRef<HTMLCanvasElement>(null);
  const played = useRef<HTMLCanvasElement>(null);
  const theme = useEditorTheme((s) => s.theme);

  useEffect(() => {
    const height = 38;
    const dpr = window.devicePixelRatio || 1;
    const cols = Math.floor(widthPx / PITCH);
    const startMs = view.scrollMs;
    const endMs = view.scrollMs + (cols * PITCH) / view.pxPerMs;
    const agg = peaks ? peaksForRange(peaks, bucketMs, startMs, endMs, cols) : null;
    let peak = 0;
    if (agg) for (let i = 0; i < agg.length; i++) peak = Math.max(peak, Math.abs(agg[i] ?? 0));

    const paint = (canvas: HTMLCanvasElement | null, color: string | [string, string]) => {
      if (!canvas) return;
      canvas.width = Math.round(widthPx * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${widthPx}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, widthPx, height);
      if (typeof color === 'string') ctx.fillStyle = color;
      else {
        const g = ctx.createLinearGradient(0, height / 2 - MAX_H / 2, 0, height / 2 + MAX_H / 2);
        g.addColorStop(0, color[0]);
        g.addColorStop(1, color[1]);
        ctx.fillStyle = g;
      }
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
    // Read the colours where the track lives, so the editor's theme applies (spec 38 R8).
    const css = getComputedStyle(base.current ?? document.documentElement);
    const voice = css.getPropertyValue('--color-voice').trim() || '#34d399';
    const voice2 = css.getPropertyValue('--color-voice-2').trim() || '#059669';
    paint(base.current, css.getPropertyValue('--color-text-3').trim() || 'grey');
    paint(played.current, [voice, voice2]);
  }, [peaks, bucketMs, view, widthPx, theme]);

  return (
    <>
      {/* The voiceover band (spec 38 R8): a green wash, brighter where it has played. */}
      <span
        aria-hidden
        className="absolute top-1 h-[30px] rounded-[7px] border border-voice/25 bg-linear-to-r from-voice/[0.06] to-voice-2/[0.1]"
        style={{ left: bandLeft, width: bandWidth }}
      />
      <span
        aria-hidden
        className="absolute top-1 h-[30px] rounded-[7px] bg-linear-to-r from-voice-2/[0.14] to-voice/[0.26]"
        style={{
          left: bandLeft,
          width: bandWidth,
          clipPath: `inset(0 calc(100% - (var(--playhead-x) - ${bandLeft}px)) 0 0)`,
        }}
      />
      <canvas ref={base} aria-hidden className="absolute top-0 left-0 opacity-40" />
      <canvas
        ref={played}
        aria-label="Voiceover waveform"
        className="absolute top-0 left-0"
        style={{ clipPath: 'inset(0 calc(100% - var(--playhead-x)) 0 0)' }}
      />
    </>
  );
}
