'use client';

import {
  Maximize,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { SyncedChip } from '@/components/ui/chip';
import { Slider } from '@/components/ui/slider';
import { Tooltip } from '@/components/ui/tooltip';
import { formatTimecode } from '@/lib/editor/slot-display';
import { buttonMotion } from '@/lib/motion/presets';
import { clampScroll, DEFAULT_ZOOM_LIMITS, fitView } from '@/lib/timeline/geometry';
import { addSlot } from '@/lib/commands';
import { slotAtPlayhead } from '@/lib/timeline/add-graphic';
import { editorStore, useEditor } from '@/lib/stores/editor';
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
    <div className="relative flex h-12 items-center border-b border-white/6 pt-2 pr-[31px] pl-6">
      <div className="relative flex h-full items-center">
        <span className="text-[13px] leading-[17px] font-medium">Transcript</span>
        <span aria-hidden className="absolute bottom-0 left-0 h-0.5 w-16 rounded-full bg-violet" />
      </div>
      <span className="ml-[25px] text-[11px] leading-[14px] text-text-2">
        Voiceover · {(durationMs / 1000).toFixed(1)}s
      </span>
      <span className="ml-[39px]">
        <SyncedChip />
      </span>
      <Tooltip content="Add a graphic at the playhead (or shift-drag across words)">
        <motion.button
          type="button"
          {...buttonMotion}
          onClick={() => addGraphicHere(clock.currentMs)}
          className="ml-4 inline-flex h-7 items-center gap-1.5 rounded-chip border border-violet/40 bg-violet/12 px-2.5 text-[12px] leading-4 font-medium text-violet-ink transition-colors hover:bg-violet/20"
        >
          <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
          Add graphic
        </motion.button>
      </Tooltip>

      <div className="absolute left-[calc(50%-165px)] flex items-center">
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
          className="mx-[19px] flex size-[38px] items-center justify-center rounded-full bg-text text-bg shadow-violet-glow"
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
          className="tabular ml-[27px] w-[55px] font-mono text-[13px] leading-[17px] text-text"
        >
          {formatTimecode(clock.currentMs)}
        </span>
        <span className="tabular ml-[23px] font-mono text-[11px] leading-[14px] text-time-dim">
          / {formatTimecode(durationMs)}
        </span>
      </div>

      <div className="ml-auto flex items-center">
        <Tooltip content="Timeline settings">
          <button
            type="button"
            aria-label="Timeline settings"
            onClick={() => toast('Timeline settings are on their way.')}
            className="text-text-2 hover:text-text"
          >
            <SlidersHorizontal className="size-[17px]" strokeWidth={1.5} />
          </button>
        </Tooltip>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setZoom(zoom - 10)}
          className="ml-[22px] text-base leading-[21px] text-text-2 hover:text-text"
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
            className="ml-[31px] text-text-2 hover:text-text"
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
      className="text-text-2 hover:text-text"
    >
      {children}
    </button>
  );
}
