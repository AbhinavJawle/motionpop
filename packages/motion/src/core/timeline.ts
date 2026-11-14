import { eases, type EaseName } from './ease';

export type Key = { t: number; v: number; ease?: EaseName };

/** Overlap between consecutive elements in ms (principle 3 range 150–350). */
export const OVERLAP_MS = 200;
/** Exit duration as a share of the entrance duration (principle 12). */
export const EXIT_RATIO = 0.6;

/**
 * Keyframe track. A key's `ease` shapes the segment from that key to the next
 * (default linear). Holds the first value before the first key and the last after the last.
 */
export function track(keys: Key[]): (tMs: number) => number {
  if (keys.length === 0) throw new Error('track needs at least one key');
  const ks = [...keys].sort((a, b) => a.t - b.t);
  const first = ks[0] as Key;
  const last = ks[ks.length - 1] as Key;
  return (tMs) => {
    if (tMs <= first.t) return first.v;
    if (tMs >= last.t) return last.v;
    for (let i = 0; i < ks.length - 1; i++) {
      const a = ks[i] as Key;
      const b = ks[i + 1] as Key;
      if (tMs >= a.t && tMs < b.t) {
        const p = (tMs - a.t) / (b.t - a.t);
        return a.v + (b.v - a.v) * eases[a.ease ?? 'linear'](p);
      }
    }
    return last.v;
  };
}

/** Evaluate each track at `t - at`. */
export function sequence(
  items: { at: number; track: (t: number) => number }[],
): (tMs: number) => number[] {
  return (tMs) => items.map((item) => item.track(tMs - item.at));
}
