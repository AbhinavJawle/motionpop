'use client';

import { Scissors, ZoomIn } from 'lucide-react';
import { useState } from 'react';
import { addVideoPunchIn, removeVideoPunchIn, toggleVideoCut } from '@/lib/commands';
import { cn } from '@/lib/cn';
import { useEditor } from '@/lib/stores/editor';

const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/**
 * Compact video edit strip in the preview pane (spec 18 R5.4): only renders when `project.video`
 * exists (zero impact on voiceover-only design checks). Lets creators inspect/toggle AI cuts and
 * add or remove punch-in zooms at the playhead.
 */
export function VideoCutsBar() {
  const video = useEditor((s) => s.project?.video ?? null);
  const durationMs = useEditor((s) => s.project?.durationMs ?? 0);
  const playheadMs = useEditor((s) => s.playheadMs);
  const exec = useEditor((s) => s.exec);
  const [expanded, setExpanded] = useState(false);

  if (!video) return null;

  const enabledCuts = video.cuts.filter((c) => c.enabled);
  const trimmedMs = enabledCuts.reduce((n, c) => n + (c.endMs - c.startMs), 0);
  const activeStage = video.stages?.find((s) => playheadMs >= s.startMs && playheadMs < s.endMs);

  const addPunchAtPlayhead = () => {
    const startMs = Math.max(0, Math.min(Math.max(0, durationMs - 1500), playheadMs));
    const endMs = Math.min(durationMs, startMs + 2500);
    if (endMs <= startMs) return;
    exec(
      addVideoPunchIn({
        id: `punch-${crypto.randomUUID().slice(0, 6)}`,
        startMs,
        endMs,
        scale: 1.16,
        focusX: 0.5,
        focusY: 0.35,
        reason: 'Manual punch-in',
      }),
    );
  };

  return (
    <div
      data-testid="video-cuts-bar"
      className="relative z-10 mb-2 flex w-[720px] max-w-[calc(100%-48px)] flex-col gap-1.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-chip border border-white/8 bg-card/80 px-3 py-1.5 text-[11px] leading-[14px]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1.5 text-text hover:text-violet-ink"
          >
            <Scissors className="size-3.5 text-violet" strokeWidth={1.5} aria-hidden />
            <span>
              {enabledCuts.length}/{video.cuts.length} cuts
              {trimmedMs > 0 ? ` · ${fmtSec(trimmedMs)} trimmed` : ''}
            </span>
          </button>
          <span className="text-text-3">·</span>
          <span className="flex items-center gap-1 text-text-2">
            <ZoomIn className="size-3.5" strokeWidth={1.5} aria-hidden />
            {video.punchIns.length} punch-in{video.punchIns.length === 1 ? '' : 's'}
          </span>
          {activeStage && (
            <>
              <span className="text-text-3">·</span>
              <span
                data-testid="active-stage-pill"
                className="rounded-full bg-violet/16 px-2 py-0.5 font-mono text-[10px] text-violet-ink"
              >
                stage: {activeStage.mode}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={addPunchAtPlayhead}
          className="rounded-full border border-white/10 px-2.5 py-0.5 text-[10.5px] text-text-2 transition-colors hover:border-violet/40 hover:text-text"
        >
          + Punch-in here
        </button>
      </div>

      {expanded && (video.cuts.length > 0 || video.punchIns.length > 0) && (
        <div className="flex flex-wrap gap-1.5 rounded-chip border border-white/8 bg-card px-3 py-2 text-[11px]">
          {video.cuts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => exec(toggleVideoCut(c.id))}
              title={c.enabled ? 'Click to restore this cut' : 'Click to re-enable this cut'}
              className={cn(
                'rounded-full border px-2 py-0.5 transition-colors',
                c.enabled
                  ? 'border-violet/40 bg-violet-sel/60 text-text'
                  : 'border-white/10 text-text-3 line-through hover:text-text',
              )}
            >
              {c.kind} {fmtSec(c.startMs)}–{fmtSec(c.endMs)}
            </button>
          ))}
          {video.punchIns.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => exec(removeVideoPunchIn(p.id))}
              title="Click to remove punch-in"
              className="rounded-full border border-white/10 bg-card-2 px-2 py-0.5 text-text-2 hover:border-ember/40 hover:text-text"
            >
              {p.scale}× @ {fmtSec(p.startMs)} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
