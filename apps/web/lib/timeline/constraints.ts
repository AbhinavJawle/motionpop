import { components } from '@motionpop/motion';

/** Move/resize constraints: neighbours, bounds and duration limits. Integer ms. */

export type SlotRange = { id: string; startMs: number; endMs: number; componentId: string };
export type Limits = { minMs: number; maxMs: number };

export const GLOBAL_LIMITS: Limits = { minMs: 1000, maxMs: 12000 };

type DurationInfo = { durationMs: { min: number; max: number } };

/** Global limits intersected with the component's own duration range (unknown id: global). */
export function limitsFor(componentId: string): Limits {
  const registry = components as unknown as Record<string, DurationInfo | undefined>;
  const info = Object.hasOwn(registry, componentId) ? registry[componentId] : undefined;
  if (!info) return GLOBAL_LIMITS;
  const minMs = Math.max(GLOBAL_LIMITS.minMs, info.durationMs.min);
  const maxMs = Math.min(GLOBAL_LIMITS.maxMs, info.durationMs.max);
  return { minMs: Math.round(minMs), maxMs: Math.round(Math.max(minMs, maxMs)) };
}

function neighbours(slots: ReadonlyArray<SlotRange>, self: SlotRange, durationMs: number) {
  let prevEnd = 0;
  let nextStart = durationMs;
  for (const o of slots) {
    if (o.id === self.id) continue;
    if (o.startMs < self.startMs || (o.startMs === self.startMs && o.endMs <= self.endMs)) {
      prevEnd = Math.max(prevEnd, o.endMs);
    } else {
      nextStart = Math.min(nextStart, o.startMs);
    }
  }
  return { prevEnd, nextStart };
}

/** Move keeping duration; stops at neighbours and [0, durationMs]. Returns the new startMs. */
export function clampMove(
  slots: ReadonlyArray<SlotRange>,
  id: string,
  startMs: number,
  durationMs: number,
): number {
  const self = slots.find((s) => s.id === id);
  if (!self) return Math.round(startMs);
  const len = self.endMs - self.startMs;
  const { prevEnd, nextStart } = neighbours(slots, self, durationMs);
  const lo = prevEnd;
  const hi = nextStart - len;
  if (hi < lo) return self.startMs;
  return Math.round(Math.min(hi, Math.max(lo, startMs)));
}

/**
 * Resize one edge to `ms`. Respects neighbours, [0, durationMs] and `limits`; when the free
 * gap is too small for the minimum duration, only neighbours and bounds apply.
 * Returns the new value of the moved edge.
 */
export function clampResize(
  slots: ReadonlyArray<SlotRange>,
  id: string,
  edge: 'start' | 'end',
  ms: number,
  limits: Limits,
  durationMs: number,
): number {
  const self = slots.find((s) => s.id === id);
  if (!self) return Math.round(ms);
  const { prevEnd, nextStart } = neighbours(slots, self, durationMs);
  let lo: number;
  let hi: number;
  if (edge === 'start') {
    lo = Math.max(prevEnd, self.endMs - limits.maxMs);
    hi = self.endMs - limits.minMs;
    if (lo > hi) {
      lo = prevEnd;
      hi = self.endMs - 1;
    }
  } else {
    lo = self.startMs + limits.minMs;
    hi = Math.min(nextStart, self.startMs + limits.maxMs);
    if (lo > hi) {
      lo = self.startMs + 1;
      hi = nextStart;
    }
  }
  if (lo > hi) return edge === 'start' ? self.startMs : self.endMs;
  return Math.round(Math.min(hi, Math.max(lo, ms)));
}
