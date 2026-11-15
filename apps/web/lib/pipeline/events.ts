import type { Slot, Word } from '@motionpop/schemas';

/** The Processing screen's steps, in pipeline order (D-024: transcribe before cleaning). */
export const PIPELINE_STEPS = ['transcribe', 'clean', 'moments', 'suggest'] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];
export type StepState = 'pending' | 'active' | 'done' | 'skipped' | 'failed';

/** Events from `runPipeline` (internal, typed; nothing here crosses a trust boundary). */
export type PipelineEvent =
  | { type: 'step'; step: PipelineStep; state: Exclude<StepState, 'pending'>; detail?: string }
  | { type: 'progress'; step: 'transcribe'; stage: 'loading' | 'transcribing'; percent?: number }
  | { type: 'words'; words: Word[]; durationMs: number }
  | { type: 'peaks'; peaks: Float32Array; bucketMs: number; durationMs: number }
  | { type: 'slots'; slots: Slot[] }
  | { type: 'done'; projectId: string }
  | { type: 'error'; step: PipelineStep | 'intake'; message: string };

export class PipelineError extends Error {
  constructor(
    readonly step: PipelineStep | 'intake',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PipelineError';
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Removed 7 ums and 3 long pauses" (screens.md), for any counts. */
export function cleanupSummary(fillersRemoved: number, pausesShortened: number): string {
  const parts: string[] = [];
  if (fillersRemoved > 0) parts.push(plural(fillersRemoved, 'um', 'ums'));
  if (pausesShortened > 0) parts.push(plural(pausesShortened, 'long pause', 'long pauses'));
  return parts.length === 0 ? 'Nothing to clean up' : `Removed ${parts.join(' and ')}`;
}

/** "Found 3 moments" / "No moments found" (spec 06 R4.1). */
export function momentsSummary(n: number): string {
  return n === 0 ? 'No moments found' : `Found ${plural(n, 'moment', 'moments')}`;
}

/** "3 slots found" / "No slots this time" (spec 06 R4.1). */
export function slotsSummary(n: number): string {
  return n === 0 ? 'No slots this time' : `${plural(n, 'slot', 'slots')} found`;
}

/** "214 words · 18.0s" */
export function transcriptSummary(words: number, durationMs: number): string {
  return `${plural(words, 'word', 'words')} · ${(durationMs / 1000).toFixed(1)}s`;
}
