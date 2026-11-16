// Producer progress → our status and progress, and the write throttle (spec 08 design §6, R4.2).
import { nextProgress } from '@motionpop/schemas';
import type { JobStage } from './ports';

/** The producer's job statuses that map to each of our stages. */
export function stageOf(producerStatus: string): JobStage {
  return producerStatus === 'encoding' || producerStatus === 'assembling'
    ? 'encoding'
    : 'rendering';
}

/**
 * Our progress for a producer percentage (0–100): `rendering` fills 1–85 and `encoding` fills
 * 85–99, so 100 stays reserved for `done`. Non-numbers count as 0; the result is an integer.
 */
export function mapProgress(stage: JobStage, producerPercent: number): number {
  const p = Number.isFinite(producerPercent) ? Math.min(100, Math.max(0, producerPercent)) : 0;
  return stage === 'rendering' ? 1 + Math.round(p * 0.84) : 85 + Math.round(p * 0.14);
}

export interface ThrottleOptions {
  /** At least this long between two writes (default 1000 ms, R4.2). */
  minIntervalMs: number;
  /** Progress must have moved by at least this much (default 2). */
  minDelta: number;
}

export const DEFAULT_THROTTLE: ThrottleOptions = { minIntervalMs: 1000, minDelta: 2 };

export type ThrottleDecision =
  { write: false } | { write: true; stage: JobStage; progress: number };

/**
 * Decides which progress updates reach the store: a change of stage always, otherwise at most one
 * per `minIntervalMs` and only when progress moved by `minDelta`. The written progress never
 * decreases, whatever the callback order or the clock does. Pure apart from its own state.
 */
export class ProgressThrottle {
  private stage: JobStage = 'rendering';
  private progress = 0;
  private lastWriteAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly opts: ThrottleOptions = DEFAULT_THROTTLE) {}

  offer(stage: JobStage, candidate: number, nowMs: number): ThrottleDecision {
    const next = nextProgress(this.progress, candidate);
    // A stage never goes back (`encoding → rendering` is not a transition).
    const effective: JobStage = this.stage === 'encoding' ? 'encoding' : stage;
    const stageChanged = effective !== this.stage;
    const due =
      nowMs - this.lastWriteAt >= this.opts.minIntervalMs &&
      next - this.progress >= this.opts.minDelta;
    if (!stageChanged && !due) return { write: false };
    this.stage = effective;
    this.progress = next;
    this.lastWriteAt = nowMs;
    return { write: true, stage: effective, progress: next };
  }

  get written(): { stage: JobStage; progress: number } {
    return { stage: this.stage, progress: this.progress };
  }
}
