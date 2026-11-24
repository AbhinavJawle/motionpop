'use client';

import type { StockOverlayClip, StockOverlayLayout } from '@motionpop/schemas';
import { Film, Image as ImageIcon, Plus, X } from 'lucide-react';
import { useState, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { removeStockOverlay, updateStockOverlay } from '@/lib/commands';
import { openRailPanel } from '@/lib/editor/rail-panel';
import { seekPreview } from '@/lib/editor/preview-bridge';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { msToX } from '@/lib/timeline/geometry';
import { useTimeline } from './timeline-context';

const LAYOUT_CYCLE: readonly StockOverlayLayout[] = ['card', 'full', 'top', 'pip'];
const LAYOUT_LABEL: Record<StockOverlayLayout, string> = {
  card: 'Card',
  full: 'Full',
  top: 'Top',
  pip: 'PiP',
};
const MIN_CLIP_MS = 400;
const EMPTY_CLIPS: readonly StockOverlayClip[] = [];

interface DragPreview {
  id: string;
  startMs: number;
  endMs: number;
}

/**
 * Dedicated `Stock Media` timeline layer: displays placed Pixabay videos & photos with
 * horizontal drag-to-place, edge trim handles, layout cycle badge, and one-click delete.
 */
export function StockMediaTrack() {
  const { view, durationMs, clock } = useTimeline();
  const clips = useEditor((s) => s.project?.stockOverlays ?? EMPTY_CLIPS);
  const exec = useEditor((s) => s.exec);
  const setRail = useEditor((s) => s.setRail);
  const [drag, setDrag] = useState<DragPreview | null>(null);

  const startDrag = (e: PointerEvent, clip: StockOverlayClip, mode: 'move' | 'left' | 'right') => {
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
        exec(updateStockOverlay(clip.id, { startMs: latestStart, endMs: latestEnd }));
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
            openRailPanel('media');
            setRail('media');
          }}
          className="inline-flex h-[24px] items-center gap-1.5 rounded-md border border-dashed border-mint/45 bg-mint/8 px-2 text-[10.5px] font-medium text-text-2 transition-colors hover:border-mint hover:bg-mint/16 hover:text-text"
        >
          <Plus className="size-3 text-mint" strokeWidth={2} aria-hidden />
          Add Pixabay video / photo at playhead
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" data-testid="stock-media-track">
      {clips.map((clip) => {
        const sMs = drag?.id === clip.id ? drag.startMs : clip.startMs;
        const eMs = drag?.id === clip.id ? drag.endMs : clip.endMs;
        const left = msToX(sMs, view);
        const width = Math.max(46, msToX(eMs, view) - left);
        const nextLayout =
          LAYOUT_CYCLE[(LAYOUT_CYCLE.indexOf(clip.layout) + 1) % LAYOUT_CYCLE.length] ?? 'card';

        return (
          <div
            key={clip.id}
            data-testid={`stock-overlay-clip-${clip.id}`}
            style={{ left, width }}
            title={`${clip.name} (${(sMs / 1000).toFixed(1)}s–${(eMs / 1000).toFixed(1)}s) · Drag to move`}
            onPointerDown={(e) => startDrag(e, clip, 'move')}
            onClick={(e) => {
              e.stopPropagation();
              clock.seek(sMs);
            }}
            className={cn(
              'group absolute top-[3px] flex h-[28px] cursor-grab items-center gap-1 overflow-hidden rounded-[7px] border border-mint/60 bg-linear-to-r from-mint/22 to-mint/14 px-2 text-[10.5px] text-ink active:cursor-grabbing',
              drag?.id === clip.id && 'z-20 ring-2 ring-mint',
            )}
          >
            {/* Left trim handle */}
            <span
              role="presentation"
              onPointerDown={(e) => startDrag(e, clip, 'left')}
              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-mint/40"
            />
            {clip.kind === 'video' ? (
              <Film className="size-3 shrink-0 text-mint-ink" strokeWidth={2} aria-hidden />
            ) : (
              <ImageIcon className="size-3 shrink-0 text-mint-ink" strokeWidth={2} aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate font-medium text-text">{clip.name}</span>
            {width >= 96 && (
              <button
                type="button"
                title={`Layout: ${LAYOUT_LABEL[clip.layout]} (click to switch to ${LAYOUT_LABEL[nextLayout]})`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  exec(updateStockOverlay(clip.id, { layout: nextLayout }));
                  seekPreview(editorStore.getState().playheadMs);
                }}
                className="shrink-0 rounded bg-paper/85 px-1 py-px text-[9px] font-semibold text-ink hover:bg-paper"
              >
                {LAYOUT_LABEL[clip.layout]}
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove ${clip.name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                exec(removeStockOverlay(clip.id));
              }}
              className="shrink-0 rounded p-0.5 text-text-3 hover:bg-black/20 hover:text-text"
            >
              <X className="size-2.5" strokeWidth={2.2} aria-hidden />
            </button>
            {/* Right trim handle */}
            <span
              role="presentation"
              onPointerDown={(e) => startDrag(e, clip, 'right')}
              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-mint/40"
            />
          </div>
        );
      })}
    </div>
  );
}
