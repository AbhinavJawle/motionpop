'use client';

import { Maximize, Pause, Play, Plus, SkipBack, SkipForward } from 'lucide-react';
import { motion } from 'motion/react';
import { useRef } from 'react';
import { Slider } from '@/components/ui/slider';
import { Tooltip } from '@/components/ui/tooltip';
import { formatTimecode } from '@/lib/editor/slot-display';
import { buttonMotion } from '@/lib/motion/presets';
import { clampScroll, DEFAULT_ZOOM_LIMITS, fitView } from '@/lib/timeline/geometry';
import { addSlot } from '@/lib/commands';
import { slotAtPlayhead } from '@/lib/timeline/add-graphic';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { FilmButton } from './film-button';
import { useFrame, useTimeline } from './timeline-context';

const FRAME_MS = 1000 / 30;

/** Zoom slider position (0–100) ↔ px per ms, logarithmic between "fit" and the max zoom. */
export function zoomToSlider(pxPerMs: number, fitPxPerMs: number): number {
  const lo = Math.log(fitPxPerMs);
  const hi = Math.log(DEFAULT_ZOOM_LIMITS.maxPxPerMs);
  if (hi <= lo) return 0;
  return Math.round(((Math.log(pxPerMs) - lo) / (hi - lo)) * 100);
}
export function sliderToZoom(v: number, fitPxPerMs: number): number {
  const lo = Math.log(fitPxPerMs);
  const hi = Math.log(DEFAULT_ZOOM_LIMITS.maxPxPerMs);
  return Math.exp(lo + (Math.max(0, Math.min(100, v)) / 100) * (hi - lo));
}

/** "Add graphic": a drafted slot at the playhead (or the next clause with room), selected. */
function addGraphicHere(atMs: number) {
  const st = editorStore.getState();
  if (!st.project) return;
  const id = `slot-${crypto.randomUUID().slice(0, 8)}`;
  const slot = slotAtPlayhead(st.project, atMs, id, document);
  if (!slot) return st.reject('Add graphic', 'Every part of the voiceover already has a graphic.');
  if (st.exec(addSlot(slot))) st.select(id);
}

/** Timeline header row (editor.png; "Transcript and timeline controls"): 48 px. */
export function TimelineHeader() {
  const isReel = useEditor((st) => Boolean(st.project?.reel && st.project?.video));
  const { clock, durationMs, widthPx, view } = useTimeline();
  const playing = useEditor((s) => s.playing);
  const setView = useEditor((s) => s.setView);
  const timecode = useRef<HTMLSpanElement>(null);

  useFrame((ms) => {
    if (timecode.current) timecode.current.textContent = formatTimecode(ms);
  });

  const fit = fitView(durationMs, widthPx - 64);
  const zoom = zoomToSlider(view.pxPerMs, fit.pxPerMs);
  const setZoom = (v: number) => {
    if (v <= 0) return setView({ ...fit, fit: true });
    const pxPerMs = sliderToZoom(v, fit.pxPerMs);
    // Keep the playhead in view while zooming from the slider.
    const anchorMs = clock.currentMs;
    const anchorX = (anchorMs - view.scrollMs) * view.pxPerMs;
    const scrollMs = clampScroll(anchorMs - anchorX / pxPerMs, pxPerMs, widthPx - 64, durationMs);
    setView({ pxPerMs, scrollMs, fit: false });
  };

  return (
    <div className="@container relative flex h-11 items-center gap-4 border-b border-line pr-6 pl-6">
      <div className="flex min-w-0 flex-1 items-center">
        <span className="relative top-[1px] font-poster text-[24px] leading-none tracking-[0.02em] uppercase">
          Transcript
        </span>
        <span className="ml-3 hidden truncate text-[11px] leading-4 text-text-3 @min-[1080px]:inline">
          Voiceover · {(durationMs / 1000).toFixed(1)}s · synced
        </span>
        <Tooltip content="Add a graphic at the playhead (or shift-drag across words)">
          <motion.button
            type="button"
            {...buttonMotion}
            onClick={() => addGraphicHere(clock.currentMs)}
            className="ml-4 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-[1.5px] border-edge bg-paper px-2.5 text-[12px] leading-4 font-medium text-ink shadow-[2px_2px_0_var(--color-hard)] transition hover:bg-mist"
          >
            <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
            Add graphic
          </motion.button>
        </Tooltip>
      </div>

      <div className="flex shrink-0 items-center">
        <TransportButton
          label="Previous frame"
          onClick={() => clock.seek(clock.currentMs - FRAME_MS)}
        >
          <SkipBack className="size-[18px]" strokeWidth={1.5} />
        </TransportButton>
        <motion.button
          type="button"
          {...buttonMotion}
          aria-label={playing ? 'Pause' : 'Play voiceover'}
          onClick={() => clock.toggle()}
          className="mx-4 flex size-[36px] items-center justify-center rounded-full border-2 border-black bg-flame text-black shadow-[2px_2px_0_var(--color-hard)]"
        >
          {playing ? (
            <Pause className="size-[18px]" strokeWidth={1.5} fill="currentColor" />
          ) : (
            <Play className="ml-0.5 size-[18px]" strokeWidth={1.5} fill="currentColor" />
          )}
        </motion.button>
        <TransportButton label="Next frame" onClick={() => clock.seek(clock.currentMs + FRAME_MS)}>
          <SkipForward className="size-[18px]" strokeWidth={1.5} />
        </TransportButton>
        <span
          ref={timecode}
          aria-label="Current time"
          className="tabular relative top-[2px] ml-5 w-[70px] font-poster text-[26px] leading-none tracking-[0.03em] text-ink"
        >
          {formatTimecode(clock.currentMs)}
        </span>
        <span className="tabular relative top-[2px] ml-[10px] font-poster text-[18px] leading-none tracking-[0.03em] text-time-dim">
          / {formatTimecode(durationMs)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end">
        {/* Film mode (spec 07b; not in the designs): right of the transport, where there is room. */}
        {!isReel && (
          <span className="mr-5">
            <FilmButton />
          </span>
        )}
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setZoom(zoom - 10)}
          className="text-base leading-[21px] text-text-2 hover:text-text"
        >
          −
        </button>
        <Slider
          label="Timeline zoom"
          tone="neutral"
          value={zoom}
          onChange={setZoom}
          className="ml-[18px] w-[98px]"
          format={(v) => (v === 0 ? 'Fit' : `${v}%`)}
        />
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setZoom(zoom + 10)}
          className="ml-[14px] text-[15px] leading-5 text-text-2 hover:text-text"
        >
          +
        </button>
        <Tooltip content="Fit to width">
          <button
            type="button"
            aria-label="Fit timeline"
            onClick={() => setView({ ...fit, fit: true })}
            className="ml-5 text-text-2 hover:text-text"
          >
            <Maximize className="size-4" strokeWidth={1.5} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function TransportButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-ink/70 hover:text-ink"
    >
      {children}
    </button>
  );
}
