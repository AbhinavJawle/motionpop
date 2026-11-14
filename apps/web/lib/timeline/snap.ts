/** Word-boundary snapping. Pure; integer ms. */

export type TimedWord = { startMs: number; endMs: number };
export type SnapResult = { ms: number; snapped: boolean };
export type SnapRangeResult = { startMs: number; endMs: number; snapped: boolean };

export const SNAP_THRESHOLD_PX = 8;

/** Sorted, unique word starts and ends. */
export function wordBoundaries(words: ReadonlyArray<TimedWord>): number[] {
  const set = new Set<number>();
  for (const w of words) {
    set.add(w.startMs);
    set.add(w.endMs);
  }
  return [...set].sort((a, b) => a - b);
}

function nearest(ms: number, boundaries: ReadonlyArray<number>): number | undefined {
  let lo = 0;
  let hi = boundaries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((boundaries[mid] ?? 0) < ms) lo = mid + 1;
    else hi = mid;
  }
  const after = boundaries[lo];
  const before = boundaries[lo - 1];
  if (after === undefined) return before;
  if (before === undefined) return after;
  return ms - before <= after - ms ? before : after;
}

export function snap(
  ms: number,
  boundaries: ReadonlyArray<number>,
  pxPerMs: number,
  thresholdPx: number = SNAP_THRESHOLD_PX,
): SnapResult {
  const b = nearest(ms, boundaries);
  if (b !== undefined && Math.abs(b - ms) * pxPerMs <= thresholdPx) return { ms: b, snapped: true };
  return { ms: Math.round(ms), snapped: false };
}

/** Snap a moved range: the edge with the closer snap wins; duration is preserved. */
export function snapRange(
  startMs: number,
  endMs: number,
  boundaries: ReadonlyArray<number>,
  pxPerMs: number,
): SnapRangeResult {
  const duration = Math.round(endMs - startMs);
  const s = snap(startMs, boundaries, pxPerMs);
  const e = snap(endMs, boundaries, pxPerMs);
  const ds = s.snapped ? Math.abs(s.ms - startMs) : Infinity;
  const de = e.snapped ? Math.abs(e.ms - endMs) : Infinity;
  if (ds === Infinity && de === Infinity) {
    const start = Math.round(startMs);
    return { startMs: start, endMs: start + duration, snapped: false };
  }
  if (ds <= de) return { startMs: s.ms, endMs: s.ms + duration, snapped: true };
  return { startMs: e.ms - duration, endMs: e.ms, snapped: true };
}
