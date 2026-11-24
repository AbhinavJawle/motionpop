'use client';

import type { StockAudioClip } from '@motionpop/schemas';
import { Music2, Play, Plus, Scissors, Sparkles, X } from 'lucide-react';
import { useMemo, useState, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import {
  MIN_STOCK_SPLIT_MS,
  removeStockAudio,
  splitStockAudio,
  updateStockAudio,
} from '@/lib/commands';
import { openRailPanel } from '@/lib/editor/rail-panel';
import { auditionStockAudio } from '@/lib/sound/use-stock-audio';
import { useEditor } from '@/lib/stores/editor';
import { msToX } from '@/lib/timeline/geometry';
import { STOCK_ROW_HEIGHT, useTimeline } from './timeline-context';

const VOLUME_STEPS = [0.9, 1.2, 0.55, 0.28] as const;
const MIN_CLIP_MS = 250;
const EMPTY_CLIPS: readonly StockAudioClip[] = [];

interface DragPreview {
  id: string;
  startMs: number;
  endMs: number;
  track: number;
}

function nextVolume(current: number): number {
  const idx = VOLUME_STEPS.findIndex((v) => Math.abs(v - current) < 0.08);
  return VOLUME_STEPS[(idx + 1) % VOLUME_STEPS.length] ?? 0.9;
}

/**
 * Multi-lane `Stock Audio` timeline track (spec 45): supports horizontal move, cross-lane
 * vertical drag between audio tracks, left/right trim (advancing `sourceOffsetMs` on left trim),
 * razor split, audition from `sourceOffsetMs`, volume cycling, and delete.
 */
export function StockAudioTrack({
  laneIndex = 0,
  laneCount = 1,
  muted = false,
}: {
  laneIndex?: number;
  laneCount?: number;
  muted?: boolean;
}) {
  const { view, durationMs, clock } = useTimeline();
  const allClips = useEditor((s) => s.project?.stockAudio ?? EMPTY_CLIPS);
  const selectedItem = useEditor((s) => s.selectedItem);
  const selectItem = useEditor((s) => s.selectItem);
  const exec = useEditor((s) => s.exec);
  const setRail = useEditor((s) => s.setRail);
  const [drag, setDrag] = useState<DragPreview | null>(null);

  const clips = useMemo(
    () => allClips.filter((c) => (c.track ?? 0) === laneIndex),
    [allClips, laneIndex],
  );

  const startDrag = (e: PointerEvent, clip: StockAudioClip, mode: 'move' | 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origStart = clip.startMs;
    const origEnd = clip.endMs;
    const origTrack = clip.track ?? 0;
    const origOffset = clip.sourceOffsetMs ?? 0;
    const span = origEnd - origStart;
    const pxPerMs = Math.max(0.0001, view.pxPerMs);
    let latestStart = origStart;
    let latestEnd = origEnd;
    let latestTrack = origTrack;
    let moved = false;
    let finished = false;

    const onMove = (ev: globalThis.PointerEvent) => {
      const dxPx = ev.clientX - startX;
      const dyPx = ev.clientY - startY;
      if (Math.abs(dxPx) > 3 || Math.abs(dyPx) > 3) moved = true;
      const dxMs = Math.round(dxPx / pxPerMs);
      if (mode === 'move') {
        latestStart = Math.max(0, Math.min(Math.max(0, durationMs - span), origStart + dxMs));
        latestEnd = Math.min(durationMs, latestStart + span);
        if (laneCount > 1) {
          const dLane = Math.round(dyPx / STOCK_ROW_HEIGHT);
          latestTrack = Math.max(0, Math.min(laneCount - 1, origTrack + dLane));
        }
      } else if (mode === 'left') {
        latestStart = Math.max(0, Math.min(origEnd - MIN_CLIP_MS, origStart + dxMs));
      } else {
        latestEnd = Math.max(origStart + MIN_CLIP_MS, Math.min(durationMs, origEnd + dxMs));
      }
      setDrag({ id: clip.id, startMs: latestStart, endMs: latestEnd, track: latestTrack });
    };

    const onUp = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setDrag(null);
      if (latestStart !== origStart || latestEnd !== origEnd || latestTrack !== origTrack) {
        const patch: Partial<
          Pick<StockAudioClip, 'startMs' | 'endMs' | 'sourceOffsetMs' | 'track'>
        > = {
          startMs: latestStart,
          endMs: latestEnd,
        };
        if (mode === 'left') {
          patch.sourceOffsetMs = Math.max(0, origOffset + (latestStart - origStart));
        }
        if (latestTrack !== origTrack) {
          patch.track = latestTrack;
        }
        exec(updateStockAudio(clip.id, patch));
        selectItem({ kind: 'stockAudio', id: clip.id });
        clock.seek(latestStart);
      } else if (!moved) {
        selectItem({ kind: 'stockAudio', id: clip.id });
        if (clock.currentMs < origStart || clock.currentMs > origEnd) {
          clock.seek(origStart);
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const splitClipInline = (clip: StockAudioClip) => {
    const playhead = Math.round(clock.currentMs);
    const inClip =
      playhead >= clip.startMs + MIN_STOCK_SPLIT_MS && playhead <= clip.endMs - MIN_STOCK_SPLIT_MS;
    const atMs = inClip ? playhead : Math.round((clip.startMs + clip.endMs) / 2);
    const rightId = `sa-${crypto.randomUUID().slice(0, 8)}`;
    if (exec(splitStockAudio(clip.id, atMs, rightId))) {
      selectItem({ kind: 'stockAudio', id: rightId });
    }
  };

  if (laneIndex === 0 && allClips.length === 0) {
    return (
      <div className={cn('flex h-full items-center px-1', muted && 'opacity-45')}>
        <button
          type="button"
          onClick={() => {
            openRailPanel('audio');
            setRail('audio');
          }}
          className="inline-flex h-[24px] items-center gap-1.5 rounded-md border border-dashed border-flame/45 bg-flame/8 px-2 text-[10.5px] font-medium text-text-2 transition-colors hover:border-flame hover:bg-flame/16 hover:text-text"
        >
          <Plus className="size-3 text-flame" strokeWidth={2} aria-hidden />
          Add SFX / music at playhead
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn('relative h-full w-full', muted && 'opacity-45')}
      data-testid={laneIndex === 0 ? 'stock-audio-track' : `stock-audio-track-${laneIndex}`}
    >
      {clips.length === 0 && laneIndex > 0 && (
        <div className="pointer-events-none flex h-full items-center px-2 text-[10px] text-text-3/70">
          Drag SFX or music clips onto this track to mix in parallel
        </div>
      )}
      {clips.map((clip) => {
        const isDragging = drag?.id === clip.id;
        const sMs = isDragging ? drag.startMs : clip.startMs;
        const eMs = isDragging ? drag.endMs : clip.endMs;
        const dyPx = isDragging ? (drag.track - laneIndex) * STOCK_ROW_HEIGHT : 0;
        const left = msToX(sMs, view);
        const width = Math.max(52, msToX(eMs, view) - left);
        const isSfx = clip.kind === 'sfx';
        const volPct = Math.round(clip.volume * 100);
        const isSelected = selectedItem?.kind === 'stockAudio' && selectedItem.id === clip.id;
        const canSplit = clip.endMs - clip.startMs >= MIN_STOCK_SPLIT_MS * 2;

        return (
          <div
            key={clip.id}
            data-testid={`stock-audio-clip-${clip.id}`}
            style={{
              left,
              width,
              ...(dyPx !== 0 ? { transform: `translateY(${dyPx}px)` } : {}),
            }}
            title={`${clip.name} (${(sMs / 1000).toFixed(1)}s–${(eMs / 1000).toFixed(1)}s · ${volPct}%) · Drag to move${laneCount > 1 ? ' or switch track' : ''}`}
            onPointerDown={(e) => startDrag(e, clip, 'move')}
            className={cn(
              'group absolute top-[3px] flex h-[28px] cursor-grab items-center gap-1 overflow-hidden rounded-[7px] border px-1.5 text-[10.5px] active:cursor-grabbing',
              isSfx
                ? 'border-flame/65 bg-linear-to-r from-flame/24 to-flame/14 text-text'
                : 'border-violet/60 bg-linear-to-r from-violet/24 to-sound/18 text-text',
              isSelected && 'z-10 ring-2 ring-flame/80',
              isDragging && 'z-30 ring-2 ring-flame',
            )}
          >
            {/* Left trim handle */}
            <span
              role="presentation"
              onPointerDown={(e) => startDrag(e, clip, 'left')}
              className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-white/25"
            />
            <button
              type="button"
              aria-label={`Preview ${clip.name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void auditionStockAudio(clip.src, clip.volume, clip.sourceOffsetMs ?? 0);
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded-full bg-black/25 text-text hover:bg-black/45"
            >
              <Play className="size-2.5 translate-x-[0.5px]" strokeWidth={2.2} aria-hidden />
            </button>
            {isSfx ? (
              <Sparkles className="size-2.5 shrink-0 text-flame" strokeWidth={2} aria-hidden />
            ) : (
              <Music2 className="size-2.5 shrink-0 text-violet" strokeWidth={2} aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{clip.name}</span>
            {canSplit && (isSelected || width >= 138) && (
              <button
                type="button"
                aria-label={`Split ${clip.name}`}
                title="Split audio clip at playhead (or midpoint)"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  splitClipInline(clip);
                }}
                className="shrink-0 rounded p-0.5 text-text-2 hover:bg-black/25 hover:text-text"
              >
                <Scissors className="size-2.5" strokeWidth={2.2} aria-hidden />
              </button>
            )}
            {width >= 104 && (
              <button
                type="button"
                title={`Volume: ${volPct}% (click to cycle)`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = nextVolume(clip.volume);
                  exec(updateStockAudio(clip.id, { volume: next }));
                  void auditionStockAudio(clip.src, next, clip.sourceOffsetMs ?? 0);
                }}
                className="shrink-0 rounded bg-paper/85 px-1 py-px text-[9px] font-semibold text-ink tabular-nums hover:bg-paper"
              >
                {volPct}%
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove ${clip.name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                exec(removeStockAudio(clip.id));
              }}
              className="shrink-0 rounded p-0.5 text-text-3 hover:bg-black/25 hover:text-text"
            >
              <X className="size-2.5" strokeWidth={2.2} aria-hidden />
            </button>
            {/* Right trim handle */}
            <span
              role="presentation"
              onPointerDown={(e) => startDrag(e, clip, 'right')}
              className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-white/25"
            />
          </div>
        );
      })}
    </div>
  );
}
