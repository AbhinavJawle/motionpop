import type { PipelineStep } from './events';

/**
 * Progress and time left for a job (spec 39 R6.4, design §6.3). Pure. Progress is the weighted sum
 * of finished steps plus the active step's share; time left blends a prior from the media length
 * with the observed rate, moving to the observed rate as progress grows.
 */
export type JobKind = 'video' | 'voiceover';

export const STEP_WEIGHTS: Readonly<Record<JobKind, Readonly<Record<PipelineStep, number>>>> = {
  video: { transcribe: 0.25, clean: 0.1, moments: 0.15, suggest: 0.3, plan: 0.2 },
  voiceover: { transcribe: 0.4, clean: 0.15, moments: 0.05, suggest: 0.15, plan: 0.25 },
};

const PRIOR = { video: { a: 20, b: 0.6 }, voiceover: { a: 8, b: 0.35 } } as const;

export type StepProgress = Record<
  PipelineStep,
  'pending' | 'active' | 'done' | 'skipped' | 'failed'
>;

/** 0..1. `within` is the active step's own fraction (Whisper %), 0.5 when unknown. */
export function jobProgress(
  kind: JobKind,
  steps: StepProgress,
  within: number | null = null,
): number {
  const w = STEP_WEIGHTS[kind];
  let p = 0;
  for (const step of Object.keys(w) as PipelineStep[]) {
    const s = steps[step];
    if (s === 'done' || s === 'skipped') p += w[step];
    else if (s === 'active') p += w[step] * clamp01(within ?? 0.5);
  }
  return clamp01(p);
}

/** Expected seconds for the whole job before it starts. */
export function priorSeconds(kind: JobKind, mediaMs: number): number {
  const { a, b } = PRIOR[kind];
  const ms = Number.isFinite(mediaMs) ? Math.max(0, mediaMs) : 0;
  return a + (b * ms) / 1000;
}

/**
 * Milliseconds left. `startProgress` is what preparation already covered when the job started
 * (review fix #16): the observed rate is measured from there.
 */
export function etaMs(opts: {
  kind: JobKind;
  mediaMs: number;
  progress: number;
  elapsedMs: number;
  startProgress?: number;
}): number {
  const p = clamp01(opts.progress);
  if (p >= 1) return 0;
  const p0 = clamp01(opts.startProgress ?? 0);
  const priorLeft = priorSeconds(opts.kind, opts.mediaMs) * 1000 * (1 - p);
  const done = p - p0;
  if (done <= 0.02 || !(opts.elapsedMs > 0)) return Math.round(priorLeft);
  const observedLeft = (opts.elapsedMs / done) * (1 - p);
  // Trust the observed rate more as more of the job has been seen.
  const t = clamp01(done / 0.5);
  const v = priorLeft * (1 - t) + observedLeft * t;
  return Number.isFinite(v) ? Math.max(0, Math.round(v)) : Math.round(priorLeft);
}

/** "~15s left", "~2 min left", "Almost done". */
export function formatEta(ms: number | null): string {
  if (ms === null) return '';
  if (ms < 5000) return 'Almost done';
  const s = Math.round(ms / 1000);
  // Round to 5 s; 58 s and up reads as a minute, never "~60s".
  const rounded = Math.max(5, Math.round(s / 5) * 5);
  if (s < 60 && rounded < 60) return `~${rounded}s left`;
  return `~${Math.max(1, Math.round(s / 60))} min left`;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
