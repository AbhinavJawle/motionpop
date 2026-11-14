import { inOutSine } from './ease';

/**
 * Subtle continuous push-in over the whole slot (motion-principles.md §7): scale 1 → `amount`.
 * Pure function of time; clamps outside [0, durMs].
 */
export function pushIn(tMs: number, durMs: number, amount = 1.05): number {
  if (durMs <= 0) return amount;
  return 1 + (amount - 1) * inOutSine(tMs / durMs);
}
