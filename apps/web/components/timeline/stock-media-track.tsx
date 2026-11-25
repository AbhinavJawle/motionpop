'use client';

import type { StockOverlayClip, StockOverlayLayout } from '@motionpop/schemas';
import { Film, Image as ImageIcon, Plus, Scissors, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import {
  MIN_STOCK_SPLIT_MS,
  removeStockOverlay,
  splitStockOverlay,
  updateStockOverlay,
} from '@/lib/commands';
import { openRailPanel } from '@/lib/editor/rail-panel';
import { seekPreview } from '@/lib/editor/preview-bridge';
import { editorStore, useEditor } from '@/lib/stores/editor';
import { msToX } from '@/lib/timeline/geometry';
import { STOCK_ROW_HEIGHT, useTimeline } from './timeline-context';

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
  track: number;
}

/**
 * Multi-lane `Stock Media` timeline track (spec 45): supports horizontal move, cross-lane
 * vertical drag between visual tracks, left/right edge trim (advancing `sourceOffsetMs` on left
 * trim), razor split, layout cycling, selection, and one-click delete.
 */
export function StockMediaTrack({
  laneIndex = 0,
  laneCount = 1,
  hidden = false,
}: {
  laneIndex?: number;
  laneCount?: number;
  hidden?: boolean;
}) {
  const { view, durationMs, clock } = useTimeline();
  const allClips = useEditor((s) => s.project?.stockOverlays ?? EMPTY_CLIPS);
  const selectedItem = useEditor((s) => s.selectedItem);
  const selectItem = useEditor((s) => s.selectItem);
  const exec = useEditor((s) => s.exec);
  const setRail = useEditor((s) => s.setRail);
  const [drag, setDrag] = useState<DragPreview | null>(null);
  const cleanupDragRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupDragRef.current?.(), []);

  const clips = useMemo(
    () => allClips.filter((c) => (c.track ?? 0) === laneIndex),
    [allClips, laneIndex],
  );

  const startDrag = (e: PointerEvent, clip: StockOverlayClip, mode: 'move' | 'left' | 'right') => {
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
          Pick<StockOverlayClip, 'startMs' | 'endMs' | 'sourceOffsetMs' | 'track'>
        > = {
          startMs: latestStart,
          endMs: latestEnd,
        };
        if (mode === 'left' && clip.kind === 'video') {
          patch.sourceOffsetMs = Math.max(0, origOffset + (latestStart - origStart));
        }
        if (latestTrack !== origTrack) {
          patch.track = latestTrack;
        }
        exec(updateStockOverlay(clip.id, patch));
        selectItem({ kind: 'stockOverlay', id: clip.id });
        clock.seek(latestStart);
      } else if (!moved) {
        selectItem({ kind: 'stockOverlay', id: clip.id });
        if (clock.currentMs < origStart || clock.currentMs > origEnd) {
          clock.seek(origStart);
        }
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (cleanupDragRef.current === cleanup) cleanupDragRef.current = null;
    };
    cleanupDragRef.current?.();
    cleanupDragRef.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const splitClipInline = (clip: StockOverlayClip) => {
    const playhead = Math.round(clock.currentMs);
    const inClip =
      playhead >= clip.startMs + MIN_STOCK_SPLIT_MS && playhead <= clip.endMs - MIN_STOCK_SPLIT_MS;
    const atMs = inClip ? playhead : Math.round((clip.startMs + clip.endMs) / 2);
    const rightId = `ov-${crypto.randomUUID().slice(0, 8)}`;
    if (exec(splitStockOverlay(clip.id, atMs, rightId))) {
      selectItem({ kind: 'stockOverlay', id: rightId });
      seekPreview(atMs);
    }
  };

  if (laneIndex === 0 && allClips.length === 0) {
    return (
      <div className={cn('flex h-full items-center px-1', hidden && 'opacity-45')}>
        <button
          type="button"
          onClick={() => {
            openRailPanel('media');
            setRail('media');
          }}
          className="inline-flex h-[24px] items-center gap-1.5 rounded-md border border-dashed border-mint/45 bg-mint/8 px-2 text-[10.5px] font-medium text-text-2 transition-colors hover:border-mint hover:bg-mint/16 hover:text-text"
        >
          <Plus className="size-3 text-mint" strokeWidth={2} aria-hidden />
          Add stock video / photo at playhead
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn('relative h-full w-full', hidden && 'opacity-45')}
      data-testid={laneIndex === 0 ? 'stock-media-track' : `stock-media-track-${laneIndex}`}
    >
      {clips.length === 0 && laneIndex > 0 && (
        <div className="pointer-events-none flex h-full items-center px-2 text-[10px] text-text-3/70">
          Drag clips vertically onto this track to layer above
        </div>
      )}
      {clips.map((clip) => {
        const isDragging = drag?.id === clip.id;
        const sMs = isDragging ? drag.startMs : clip.startMs;
        const eMs = isDragging ? drag.endMs : clip.endMs;
        const dyPx = isDragging ? (drag.track - laneIndex) * STOCK_ROW_HEIGHT : 0;
        const left = msToX(sMs, view);
        const width = Math.max(46, msToX(eMs, view) - left);
        const isSelected = selectedItem?.kind === 'stockOverlay' && selectedItem.id === clip.id;
        const canSplit = clip.endMs - clip.startMs >= MIN_STOCK_SPLIT_MS * 2;
        const nextLayout =
          LAYOUT_CYCLE[(LAYOUT_CYCLE.indexOf(clip.layout) + 1) % LAYOUT_CYCLE.length] ?? 'card';

        return (
          <div
            key={clip.id}
            data-testid={`stock-overlay-clip-${clip.id}`}
            style={{
              left,
              width,
              ...(dyPx !== 0 ? { transform: `translateY(${dyPx}px)` } : {}),
            }}
            title={`${clip.name} (${(sMs / 1000).toFixed(1)}s–${(eMs / 1000).toFixed(1)}s) · Drag to move${laneCount > 1 ? ' or switch track' : ''}`}
            onPointerDown={(e) => startDrag(e, clip, 'move')}
            className={cn(
              'group absolute top-[3px] flex h-[28px] cursor-grab items-center gap-1 overflow-hidden rounded-[7px] border border-mint/60 bg-linear-to-r from-mint/22 to-mint/14 px-2 text-[10.5px] text-ink active:cursor-grabbing',
              isSelected && 'z-10 border-mint ring-2 ring-mint/80',
              isDragging && 'z-30 ring-2 ring-mint',
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
            {canSplit && (isSelected || width >= 132) && (
              <button
                type="button"
                aria-label={`Split ${clip.name}`}
                title="Split clip at playhead (or midpoint)"
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
