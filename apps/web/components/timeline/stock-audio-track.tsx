'use client';

import type { StockAudioClip } from '@motionpop/schemas';
import { Music2, Play, Plus, Sparkles, X } from 'lucide-react';
import { useState, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { removeStockAudio, updateStockAudio } from '@/lib/commands';
import { openRailPanel } from '@/lib/editor/rail-panel';
import { auditionStockAudio } from '@/lib/sound/use-stock-audio';
import { useEditor } from '@/lib/stores/editor';
import { msToX } from '@/lib/timeline/geometry';
import { useTimeline } from './timeline-context';

const VOLUME_STEPS = [0.9, 1.2, 0.55, 0.28] as const;
const MIN_CLIP_MS = 250;
const EMPTY_CLIPS: readonly StockAudioClip[] = [];

interface DragPreview {
  id: string;
  startMs: number;
  endMs: number;
}

function nextVolume(current: number): number {
  const idx = VOLUME_STEPS.findIndex((v) => Math.abs(v - current) < 0.08);
  return VOLUME_STEPS[(idx + 1) % VOLUME_STEPS.length] ?? 0.9;
}

/**
 * Dedicated `Stock Audio` timeline layer: shows placed Uncommon Ear SFX and Music clips with
 * horizontal drag-to-place, edge trim handles, one-click audition, volume cycling, and delete.
 */
export function StockAudioTrack() {
  const { view, durationMs, clock } = useTimeline();
  const clips = useEditor((s) => s.project?.stockAudio ?? EMPTY_CLIPS);
  const exec = useEditor((s) => s.exec);
  const setRail = useEditor((s) => s.setRail);
  const [drag, setDrag] = useState<DragPreview | null>(null);

  const startDrag = (e: PointerEvent, clip: StockAudioClip, mode: 'move' | 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const origStart = clip.startMs;
    const origEnd = clip.endMs;
    const span = origEnd - origStart;
    const pxPerMs = Math.max(0.0001, view.pxPerMs);
    let latestStart = origStart;
    let latestEnd = origEnd;

    const onMove = (ev: globalThis.PointerEvent) => {
      const dxMs = Math.round((ev.clientX - startX) / pxPerMs);
      if (mode === 'move') {
        latestStart = Math.max(0, Math.min(Math.max(0, durationMs - span), origStart + dxMs));
        latestEnd = Math.min(durationMs, latestStart + span);
      } else if (mode === 'left') {
        latestStart = Math.max(0, Math.min(origEnd - MIN_CLIP_MS, origStart + dxMs));
      } else {
        latestEnd = Math.max(origStart + MIN_CLIP_MS, Math.min(durationMs, origEnd + dxMs));
      }
      setDrag({ id: clip.id, startMs: latestStart, endMs: latestEnd });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrag(null);
      if (latestStart !== origStart || latestEnd !== origEnd) {
        exec(updateStockAudio(clip.id, { startMs: latestStart, endMs: latestEnd }));
        clock.seek(latestStart);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (clips.length === 0) {
    return (
      <div className="flex h-full items-center px-1">
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
    <div className="relative h-full w-full" data-testid="stock-audio-track">
      {clips.map((clip) => {
        const sMs = drag?.id === clip.id ? drag.startMs : clip.startMs;
        const eMs = drag?.id === clip.id ? drag.endMs : clip.endMs;
        const left = msToX(sMs, view);
        const width = Math.max(52, msToX(eMs, view) - left);
        const isSfx = clip.kind === 'sfx';
        const volPct = Math.round(clip.volume * 100);

        return (
          <div
            key={clip.id}
            data-testid={`stock-audio-clip-${clip.id}`}
            style={{ left, width }}
            title={`${clip.name} (${(sMs / 1000).toFixed(1)}s–${(eMs / 1000).toFixed(1)}s · ${volPct}%) · Drag to move`}
            onPointerDown={(e) => startDrag(e, clip, 'move')}
            onClick={(e) => {
              e.stopPropagation();
              clock.seek(sMs);
            }}
            className={cn(
              'group absolute top-[3px] flex h-[28px] cursor-grab items-center gap-1 overflow-hidden rounded-[7px] border px-1.5 text-[10.5px] active:cursor-grabbing',
              isSfx
                ? 'border-flame/65 bg-linear-to-r from-flame/24 to-flame/14 text-text'
                : 'border-violet/60 bg-linear-to-r from-violet/24 to-sound/18 text-text',
              drag?.id === clip.id && 'z-20 ring-2 ring-flame',
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
                void auditionStockAudio(clip.src, clip.volume);
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
            {width >= 104 && (
              <button
                type="button"
                title={`Volume: ${volPct}% (click to cycle)`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = nextVolume(clip.volume);
                  exec(updateStockAudio(clip.id, { volume: next }));
                  void auditionStockAudio(clip.src, next);
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
