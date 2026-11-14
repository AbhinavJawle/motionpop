import { linear, type Ease } from './ease';

/** Progress of `tMs` through the window [startMs, startMs + durMs], clamped to [0, 1]. */
export function progress(tMs: number, startMs: number, durMs: number): number {
  if (durMs <= 0) return tMs >= startMs ? 1 : 0;
  const p = (tMs - startMs) / durMs;
  return p <= 0 ? 0 : p >= 1 ? 1 : p;
}

/** Linear interpolation. */
export function lerp(from: number, to: number, p: number): number {
  return from + (to - from) * p;
}

/**
 * Value of a tween at time `tMs`: holds `from` before the window, `to` after it,
 * and eases between. Pure function of time.
 */
export function tween(
  tMs: number,
  startMs: number,
  durMs: number,
  from: number,
  to: number,
  ease: Ease = linear,
): number {
  return lerp(from, to, ease(progress(tMs, startMs, durMs)));
}
