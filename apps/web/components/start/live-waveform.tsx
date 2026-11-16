'use client';

import { useEffect, useRef } from 'react';

const EMBER = '#FF7A3D';
const VIOLET = '#8B7CFF';
const BAR = 3;
const STEP = 5.68;
const LIVE_TAIL = 12;
const FADE_TAIL = 6;

/**
 * The recording waveform (recording.png: x 520–1088, centred at y 603): one bar per 50 ms
 * frame, recorded bars ember, the newest 12 violet, then a few fading violet stubs. Reads
 * `peaks` from a ref on every animation frame, so React never re-renders per frame.
 * `live` false draws the whole take, ember only (review).
 */
export function LiveWaveform({
  peaks,
  live,
  width = 568,
  height = 70,
}: {
  peaks: { current: number[] };
  live: boolean;
  width?: number;
  height?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);
    const slots = Math.floor(width / STEP);
    let raf = 0;
    const bar = (i: number, v: number, color: string, alpha = 1) => {
      const h = Math.max(2, Math.min(1, Math.sqrt(v) * 1.15) * height);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(i * STEP, (height - h) / 2, BAR, h);
    };
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const all = peaks.current;
      if (live) {
        const room = slots - FADE_TAIL;
        const shown = all.slice(-room);
        shown.forEach((v, i) => bar(i, v, i >= shown.length - LIVE_TAIL ? VIOLET : EMBER));
        for (let k = 0; k < FADE_TAIL; k++)
          bar(shown.length + k, 0.02 + 0.03 * (FADE_TAIL - k), VIOLET, 0.5 - k * 0.07);
        raf = requestAnimationFrame(draw);
      } else {
        // The whole take, one bar per slot (max of its frames).
        const per = Math.max(1, all.length / slots);
        for (let i = 0; i < Math.min(slots, all.length); i++) {
          let m = 0;
          for (let j = Math.floor(i * per); j < Math.floor((i + 1) * per); j++)
            m = Math.max(m, all[j] ?? 0);
          bar(i, m, EMBER);
        }
      }
      ctx.globalAlpha = 1;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [peaks, live, width, height]);

  return <canvas ref={canvas} aria-hidden style={{ width, height }} className="block" />;
}
