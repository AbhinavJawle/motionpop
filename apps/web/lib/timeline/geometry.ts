/** Pure timeline geometry: ms <-> px, zoom anchoring, ruler ticks. Time is integer ms. */

export type View = { pxPerMs: number; scrollMs: number };
export type ZoomLimits = { minPxPerMs: number; maxPxPerMs: number };
export type RulerTicks = {
  /** Distance between labelled (major) ticks. */
  stepMs: number;
  /** Integer-ms positions of labelled ticks. */
  majors: number[];
  /** Integer-ms positions of unlabelled ticks between majors. */
  minors: number[];
};

export const MAJOR_STEPS_MS = [500, 1000, 2000, 5000, 10000, 30000] as const;
export const MIN_LABEL_SPACING_PX = 64;
export const DEFAULT_ZOOM_LIMITS: ZoomLimits = { minPxPerMs: 0.002, maxPxPerMs: 2 };

const MINOR_STEP_MS: Record<number, number> = {
  500: 100,
  1000: 200,
  2000: 500,
  5000: 1000,
  10000: 2000,
  30000: 5000,
};

export function msToX(ms: number, view: View): number {
  return (ms - view.scrollMs) * view.pxPerMs;
}

export function xToMs(x: number, view: View): number {
  return Math.round(x / view.pxPerMs + view.scrollMs);
}

/** Zoom by `factor` keeping the time under `anchorX` fixed (to within 1 ms). Zoom is clamped. */
export function zoomAt(
  view: View,
  factor: number,
  anchorX: number,
  limits: ZoomLimits = DEFAULT_ZOOM_LIMITS,
): View {
  const pxPerMs = Math.min(limits.maxPxPerMs, Math.max(limits.minPxPerMs, view.pxPerMs * factor));
  const anchorMs = anchorX / view.pxPerMs + view.scrollMs;
  return { pxPerMs, scrollMs: Math.round(anchorMs - anchorX / pxPerMs) };
}

/** A view showing the whole voiceover across `widthPx`. */
export function fitView(durationMs: number, widthPx: number): View {
  const pxPerMs =
    durationMs > 0 && widthPx > 0 ? widthPx / durationMs : DEFAULT_ZOOM_LIMITS.minPxPerMs;
  return { pxPerMs, scrollMs: 0 };
}

export function rulerTicks(view: View, widthPx: number): RulerTicks {
  const last = MAJOR_STEPS_MS[MAJOR_STEPS_MS.length - 1] ?? 30000;
  const stepMs = MAJOR_STEPS_MS.find((s) => s * view.pxPerMs >= MIN_LABEL_SPACING_PX) ?? last;
  const minorStep = MINOR_STEP_MS[stepMs] ?? stepMs;
  const fromMs = Math.max(0, Math.floor(view.scrollMs));
  const toMs = Math.ceil(view.scrollMs + widthPx / view.pxPerMs);
  const majors: number[] = [];
  const minors: number[] = [];
  for (let t = Math.ceil(fromMs / minorStep) * minorStep; t <= toMs; t += minorStep) {
    (t % stepMs === 0 ? majors : minors).push(t);
  }
  return { stepMs, majors, minors };
}
