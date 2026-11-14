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
