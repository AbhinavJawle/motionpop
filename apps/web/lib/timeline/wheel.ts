import { clampScroll, DEFAULT_ZOOM_LIMITS, fitView, zoomAt, type View } from './geometry';

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  /** WheelEvent.deltaMode: 0 pixels, 1 lines, 2 pages. */
  deltaMode: number;
  /** ⌘ or ctrl held (trackpad pinch sends ctrl). */
  zoom: boolean;
  shift: boolean;
  /** Pointer x inside the time area, in px. */
  anchorX: number;
}

const LINE_PX = 16;
const ZOOM_PER_PX = 0.0025;

/**
 * The view after a wheel event over the timeline (spec 04 R6.3): ⌘/ctrl + wheel zooms
 * anchored at the pointer, never further out than "fit"; shift + wheel or a horizontal
 * trackpad swipe scrolls. Returns null when the event isn't ours (plain vertical wheel,
 * or scrolling while the whole voiceover already fits).
 */
export function wheelView(
  view: View & { fit: boolean },
  visiblePx: number,
  durationMs: number,
  input: WheelInput,
): (View & { fit: boolean }) | null {
  const unit = input.deltaMode === 1 ? LINE_PX : input.deltaMode === 2 ? visiblePx : 1;
  const dx = input.deltaX * unit;
  const dy = input.deltaY * unit;
  const fit = fitView(durationMs, visiblePx);

  if (input.zoom) {
    if (dy === 0) return null;
    const limits = { minPxPerMs: fit.pxPerMs, maxPxPerMs: DEFAULT_ZOOM_LIMITS.maxPxPerMs };
    const next = zoomAt(view, Math.exp(-dy * ZOOM_PER_PX), input.anchorX, limits);
    if (next.pxPerMs <= fit.pxPerMs * 1.0001) return { ...fit, fit: true };
    return {
      pxPerMs: next.pxPerMs,
      scrollMs: clampScroll(next.scrollMs, next.pxPerMs, visiblePx, durationMs),
      fit: false,
    };
  }

  const horizontal = input.shift ? dx || dy : Math.abs(dx) > Math.abs(dy) ? dx : 0;
  if (horizontal === 0 || view.fit) return null;
  const scrollMs = clampScroll(
    view.scrollMs + horizontal / view.pxPerMs,
    view.pxPerMs,
    visiblePx,
    durationMs,
  );
  return { ...view, scrollMs };
}
