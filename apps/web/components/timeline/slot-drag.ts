'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { moveSlot, resizeSlot } from '@/lib/commands';
import { editorStore } from '@/lib/stores/editor';
import { dragModeAt, dragRange, type DragResult } from '@/lib/timeline/drag';
import { clampScroll } from '@/lib/timeline/geometry';
import { wordBoundaries } from '@/lib/timeline/snap';
import { TL } from './timeline-context';

/** Pointer travel before a press becomes a drag, so clicks still select. */
const DRAG_THRESHOLD_PX = 3;
/** Edge zone that auto-scrolls a zoomed timeline while dragging, and its speed. */
const EDGE_PX = 12;
const SCROLL_PX_PER_FRAME = 10;

/**
 * Drag a slot card (spec 04 R6.1): the body moves, the 8 px edges resize. While dragging the
 * store holds a `dragPreview` (snapped to words, clamped by neighbours and limits); release
 * commits exactly that range as one MoveSlot / ResizeSlot, so a drag is one undo step.
 * Escape cancels. Near the time area's edges a zoomed timeline scrolls along.
 */
export function startSlotDrag(e: ReactPointerEvent<HTMLElement>, slotId: string): void {
  if (e.button !== 0) return;
  e.stopPropagation();
  const store = editorStore.getState();
  const project = store.project;
  const slot = project?.slots.find((s) => s.id === slotId);
  if (!project || !slot) return;
  store.select(slotId);

  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const mode = dragModeAt(e.clientX - rect.left, rect.width);
  const area = el.closest<HTMLElement>('[data-time-area]');
  const pointerId = e.pointerId;
  const startX = e.clientX;
  const startScroll = store.view.scrollMs;
  const pxPerMs = store.view.pxPerMs;
  const bounds = wordBoundaries(project.transcript.words);
  let lastX = startX;
  let active = false;
  let raf = 0;
  let result: DragResult | null = null;
  el.setPointerCapture(pointerId);

  const update = () => {
    const deltaMs =
      (lastX - startX) / pxPerMs + (editorStore.getState().view.scrollMs - startScroll);
    result = dragRange(project, slotId, mode, deltaMs, pxPerMs, bounds);
    if (result) editorStore.getState().setDragPreview({ slotId, ...result });
  };

  const edgeScroll = () => {
    raf = 0;
    if (!active || !area) return;
    const { view, setView } = editorStore.getState();
    if (view.fit) return;
    const r = area.getBoundingClientRect();
    const dir = lastX < r.left + EDGE_PX ? -1 : lastX > r.right - TL.rightPad - EDGE_PX ? 1 : 0;
    if (dir !== 0) {
      const visible = r.width - TL.rightPad;
      const next = clampScroll(
        view.scrollMs + (dir * SCROLL_PX_PER_FRAME) / view.pxPerMs,
        view.pxPerMs,
        visible,
        project.durationMs,
      );
      if (next !== view.scrollMs) {
        setView({ scrollMs: next });
        update();
      }
    }
    raf = requestAnimationFrame(edgeScroll);
  };

  const onMove = (ev: PointerEvent) => {
    lastX = ev.clientX;
    if (!active && Math.abs(lastX - startX) < DRAG_THRESHOLD_PX) return;
    if (!active) {
      active = true;
      el.dataset.dragging = mode;
    }
    update();
    if (!raf) raf = requestAnimationFrame(edgeScroll);
  };

  const finish = (commit: boolean) => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey, true);
    if (raf) cancelAnimationFrame(raf);
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
    delete el.dataset.dragging;
    const s = editorStore.getState();
    const r = result;
    if (commit && active && r && (r.startMs !== slot.startMs || r.endMs !== slot.endMs)) {
      s.exec(
        mode === 'move'
          ? moveSlot(slotId, r.startMs)
          : resizeSlot(slotId, mode, mode === 'start' ? r.startMs : r.endMs),
      );
    }
    s.setDragPreview(null);
  };
  const onUp = () => finish(true);
  const onCancel = () => finish(false);
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !active) return;
    ev.stopPropagation(); // don't also deselect
    finish(false);
  };

  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey, true);
}
