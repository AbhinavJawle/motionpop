import type { SlotTiming } from '@motionpop/schemas';
import type { EaseName } from '../core/ease';

/** What `withTiming` touches: the look's motion block. Works on a style pack and on a look. */
interface HasMotion {
  motion: {
    enterEase: EaseName;
    moveEase: EaseName;
    enterMs: number;
    staggerMs: number;
  };
}

/** The slot's `ease` as the look's two ease names (inspector: Ease in-out, Ease out, Linear). */
const EASES: Record<NonNullable<SlotTiming['ease']>, { enter: EaseName; move: EaseName }> = {
  inOut: { enter: 'inOutCubic', move: 'inOutCubic' },
  out: { enter: 'outExpo', move: 'outCubic' },
  linear: { enter: 'linear', move: 'linear' },
};

/**
 * The style one clip runs with (spec 09 design, "Motion engine: timing"). Pure: the look's
 * `enterMs` and `staggerMs` are divided by `speed` (rounded to whole ms, at least 1) and the two
 * ease names follow `ease`. Unset fields keep the look's values; with nothing to change the same
 * object comes back. `fade` is not a style value: the runtime hands it to the stage as `exit`.
 * Voice sync is unchanged: a slower entrance starts earlier, and a cue still lands on its word.
 */
export function withTiming<T extends HasMotion>(style: T, timing: SlotTiming | undefined): T {
  if (!timing || (timing.speed === undefined && timing.ease === undefined)) return style;
  const speed = timing.speed ?? 1;
  const ease = timing.ease ? EASES[timing.ease] : undefined;
  if (speed === 1 && !ease) return style;
  const m = style.motion;
  return {
    ...style,
    motion: {
      ...m,
      enterMs: Math.max(1, Math.round(m.enterMs / speed)),
      staggerMs: Math.max(1, Math.round(m.staggerMs / speed)),
      ...(ease ? { enterEase: ease.enter, moveEase: ease.move } : {}),
    },
  };
}
