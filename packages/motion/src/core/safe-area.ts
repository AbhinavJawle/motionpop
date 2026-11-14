import type { Format } from '../contract';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Text-safe area in frame pixels (motion-principles.md §10).
 * 16:9 and 1:1: 5 % margins. 9:16: platform zones (top 12 %, bottom 20 %, sides 6 %) so captions,
 * usernames and buttons on short-form apps never cover text.
 */
export function safeArea(format: Format, width: number, height: number): Box {
  if (format === '9:16') {
    const x = Math.round(width * 0.06);
    const y = Math.round(height * 0.12);
    return { x, y, width: width - 2 * x, height: height - y - Math.round(height * 0.2) };
  }
  const x = Math.round(width * 0.05);
  const y = Math.round(height * 0.05);
  return { x, y, width: width - 2 * x, height: height - 2 * y };
}

/** True when `inner` lies fully inside `outer` (with `tolerance` px of slack). */
export function contains(outer: Box, inner: Box, tolerance = 0.5): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/**
 * Shrink `box` so that any point inside it, scaled by `amount` around the frame centre, stays inside
 * the original box. Components lay text out in this box so the compiler's camera push-in never
 * moves text out of the safe area. `amount` 1 returns the box unchanged.
 */
export function insetForCamera(box: Box, width: number, height: number, amount: number): Box {
  if (!(amount >= 1)) throw new RangeError(`insetForCamera: amount must be >= 1, got ${amount}`);
  if (amount === 1) return box;
  const axis = (start: number, size: number, centre: number): [number, number] => {
    const lo = Math.max(start, centre + (start - centre) / amount);
    const hi = Math.min(start + size, centre + (start + size - centre) / amount);
    return hi >= lo ? [lo, hi - lo] : [(lo + hi) / 2, 0];
  };
  const [x, w] = axis(box.x, box.width, width / 2);
  const [y, h] = axis(box.y, box.height, height / 2);
  return { x, y, width: w, height: h };
}
