/** Stagger steps in ms (motion principle 4). */
export const STAGGER = { word: 50, item: 90, dot: 25 } as const;

export const STAGGER_RANGE = {
  word: [30, 80],
  item: [60, 120],
  dot: [10, 40],
} as const satisfies Record<keyof typeof STAGGER, readonly [number, number]>;

export type StaggerKind = keyof typeof STAGGER;

/** Clamp a step to the allowed range for its kind. */
export function clampStep(kind: StaggerKind, ms: number): number {
  const [lo, hi] = STAGGER_RANGE[kind];
  return Math.min(hi, Math.max(lo, ms));
}

/** Start offset (ms) of item `i` of `n`. For 0 <= i < n the result is in [0, (n - 1) * stepMs]. */
export function stagger(
  i: number,
  n: number,
  stepMs: number,
  from: 'start' | 'end' | 'center' = 'start',
): number {
  if (from === 'end') return (n - 1 - i) * stepMs;
  if (from === 'center') return Math.abs(i - (n - 1) / 2) * stepMs;
  return i * stepMs;
}
