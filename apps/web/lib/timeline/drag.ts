import type { EditorProject } from '@motionpop/schemas';
import { clampMove, clampResize, limitsFor } from './constraints';
import { snap, snapRange, wordBoundaries } from './snap';

export type DragMode = 'move' | 'start' | 'end';

export interface DragResult {
  startMs: number;
  endMs: number;
  /** True when the dragged edge(s) landed on a word boundary (drives the magnetic settle). */
  snapped: boolean;
}

/**
 * Where a slot lands for a drag of `deltaMs` (spec 04 R6.1): snap to word starts/ends within
 * 8 px, then stop at neighbours, bounds and duration limits. Pure; the UI previews this while
 * dragging and commits one MoveSlot/ResizeSlot on release.
 */
export function dragRange(
  project: EditorProject,
  slotId: string,
  mode: DragMode,
  deltaMs: number,
  pxPerMs: number,
  boundaries: ReadonlyArray<number> = wordBoundaries(project.transcript.words),
): DragResult | null {
  const slot = project.slots.find((s) => s.id === slotId);
  if (!slot) return null;
  const len = slot.endMs - slot.startMs;

  if (mode === 'move') {
    const raw = slot.startMs + deltaMs;
    const snapped = snapRange(raw, raw + len, boundaries, pxPerMs);
    const start = clampMove(project.slots, slotId, snapped.startMs, project.durationMs);
    return { startMs: start, endMs: start + len, snapped: snapped.snapped && start === snapped.startMs };
  }

  const limits = limitsFor(slot.componentId);
  const raw = (mode === 'start' ? slot.startMs : slot.endMs) + deltaMs;
  const s = snap(raw, boundaries, pxPerMs);
  const edge = clampResize(project.slots, slotId, mode, s.ms, limits, project.durationMs);
  const landed = s.snapped && edge === s.ms;
  return mode === 'start'
    ? { startMs: edge, endMs: slot.endMs, snapped: landed }
    : { startMs: slot.startMs, endMs: edge, snapped: landed };
}

/** Which part of a card a pointer grabbed: 8 px edge handles, the body otherwise. */
export function dragModeAt(offsetX: number, widthPx: number, handlePx = 8): DragMode {
  if (widthPx < handlePx * 3) return 'move';
  if (offsetX <= handlePx) return 'start';
  if (offsetX >= widthPx - handlePx) return 'end';
  return 'move';
}
