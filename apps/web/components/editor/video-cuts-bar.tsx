'use client';

import { type VideoStageMode } from '@motionpop/schemas';
import { Scissors, ZoomIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  addVideoPunchIn,
  applyResplicedAudio,
  removeVideoPunchIn,
  setSlotVideoStage,
  toggleVideoCut,
} from '@/lib/commands';
import { cn } from '@/lib/cn';
import { subscribePreviewSeek } from '@/lib/editor/preview-bridge';
import { editorStore, selectSlots, useEditor } from '@/lib/stores/editor';
import { respliceProjectAudio } from '@/lib/video/resplice-audio';

const fmtSec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const QUICK_STAGE_CYCLE: readonly VideoStageMode[] = [
  'full',
  'split-left',
  'split-right',
  'pip',
  'backdrop',
  'cutaway',
];

/**
 * Compact video edit strip in the preview pane (spec 18 R5.4): only renders when `project.video`
 * exists (zero impact on voiceover-only design checks). Lets creators inspect/toggle AI cuts,
 * see and switch the live choreography stage, and add or remove punch-in zooms at the playhead.
 */
export function VideoCutsBar() {
  const video = useEditor((s) => s.project?.video ?? null);
  const slots = useEditor(selectSlots);
  const durationMs = useEditor((s) => s.project?.durationMs ?? 0);
  const playheadMs = useEditor((s) => s.playheadMs);
  const exec = useEditor((s) => s.exec);
  const [expanded, setExpanded] = useState(false);
  const [resplicing, setResplicing] = useState(false);
  const [liveStageId, setLiveStageId] = useState<string | null>(null);

  // Track the active stage at 60fps during playback without re-rendering on every frame:
  // only commit state when the playhead crosses into a different stage segment.
  useEffect(() => {
    const resolveStageId = (ms: number): string | null => {
      const stages = editorStore.getState().project?.video?.stages;
      if (!stages?.length) return null;
      const hit = stages.find((s) => ms >= s.startMs && ms < s.endMs) ?? stages[stages.length - 1];
      return hit?.id ?? null;
    };
    return subscribePreviewSeek((ms) => {
      const next = resolveStageId(ms);
      setLiveStageId((prev) => (prev === next ? prev : next));
    });
  }, []);

  if (!video) return null;

  const handleToggleCut = async (cutId: string) => {
    if (resplicing) return;
    exec(toggleVideoCut(cutId));
    const latest = editorStore.getState().project;
    if (!latest?.video) return;
    setResplicing(true);
    try {
      const spliced = await respliceProjectAudio(latest);
      if (spliced) exec(applyResplicedAudio(spliced));
    } catch {
      toast('Video cut updated (audio re-sync skipped).');
    } finally {
      setResplicing(false);
    }
  };

  const enabledCuts = video.cuts.filter((c) => c.enabled);
  const trimmedMs = enabledCuts.reduce((n, c) => n + (c.endMs - c.startMs), 0);
  const activeStage =
    (liveStageId ? video.stages?.find((s) => s.id === liveStageId) : undefined) ??
    video.stages?.find((s) => playheadMs >= s.startMs && playheadMs < s.endMs);
  const activeSlot = activeStage
    ? slots.find((sl) => sl.startMs <= activeStage.startMs + 50 && sl.endMs >= activeStage.endMs - 50)
    : undefined;

  const cycleActiveStage = () => {
    if (!activeStage || !activeSlot) return;
    const idx = QUICK_STAGE_CYCLE.indexOf(activeStage.mode);
    const next = QUICK_STAGE_CYCLE[(idx + 1) % QUICK_STAGE_CYCLE.length]!;
    exec(setSlotVideoStage(activeSlot.id, next));
  };

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
              <button
                type="button"
                data-testid="active-stage-pill"
                onClick={cycleActiveStage}
                title="Click to switch this beat's video layout"
                className="rounded-full bg-violet/16 px-2 py-0.5 font-mono text-[10px] text-violet-ink transition-colors hover:bg-violet/28"
              >
                stage: {activeStage.mode}
              </button>
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
                disabled={resplicing}
                onClick={() => void handleToggleCut(c.id)}
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
