import type { Slot, Word } from '@motionpop/schemas';
import { PIPELINE_STEPS, type PipelineEvent, type PipelineStep, type StepState } from './events';

/** What the Processing screen shows, folded from pipeline events (spec 05 R5). Pure. */
export interface ProcessingState {
  steps: Record<PipelineStep, { state: StepState; detail?: string }>;
  words: Word[];
  /** Stable key per word: its index in the first (original) word list, so re-timed words glide. */
  wordKeys: number[];
  durationMs: number;
  /** Suggested slots from the post-pass (spec 06), drawn above the word pills. */
  slots: Slot[];
  error: { step: PipelineStep | 'intake'; message: string } | null;
  projectId: string | null;
  /** The latest human sentence, for the polite live region. */
  announcement: string;
}

export const STEP_TITLES: Record<PipelineStep, string> = {
  transcribe: 'Transcribing',
  clean: 'Cleaning audio',
  moments: 'Finding moments',
  suggest: 'Suggesting graphics',
};

export function initialProcessing(): ProcessingState {
  return {
    steps: Object.fromEntries(PIPELINE_STEPS.map((s) => [s, { state: 'pending' }])) as Record<
      PipelineStep,
      { state: StepState }
    >,
    words: [],
    wordKeys: [],
    durationMs: 0,
    slots: [],
    error: null,
    projectId: null,
    announcement: '',
  };
}

export function reduceProcessing(s: ProcessingState, e: PipelineEvent): ProcessingState {
  switch (e.type) {
    case 'step': {
      const title = STEP_TITLES[e.step];
      const announcement =
        e.state === 'active'
          ? `${title}…`
          : e.state === 'done'
            ? `${title}: ${e.detail ?? 'done'}`
            : e.state === 'failed'
              ? `${title} failed: ${e.detail ?? ''}`
              : s.announcement;
      return {
        ...s,
        steps: { ...s.steps, [e.step]: { state: e.state, detail: e.detail } },
        announcement,
      };
    }
    case 'progress': {
      const detail =
        e.stage === 'loading'
          ? `Downloading the voice model${e.percent === undefined ? '' : ` · ${Math.round(e.percent)} %`}`
          : 'Listening to your voice…';
      return { ...s, steps: { ...s.steps, transcribe: { state: 'active', detail } } };
    }
    case 'words':
      return {
        ...s,
        words: e.words,
        wordKeys: matchKeys(s.words, s.wordKeys, e.words),
        durationMs: e.durationMs,
      };
    case 'peaks':
      return s;
    case 'slots':
      return { ...s, slots: e.slots };
    case 'done':
      return { ...s, projectId: e.projectId, announcement: 'Ready. Opening the editor.' };
    case 'error':
      return { ...s, error: { step: e.step, message: e.message }, announcement: e.message };
  }
}

/**
 * Keys for `next` given the previous list: kept words keep their order (re-timing only drops
 * words), so walk both lists and match by text. Unmatched words get fresh keys after the rest.
 */
export function matchKeys(prev: Word[], prevKeys: number[], next: Word[]): number[] {
  if (prev.length === 0) return next.map((_, k) => k);
  let fresh = Math.max(-1, ...prevKeys) + 1;
  let j = 0;
  return next.map((w) => {
    while (j < prev.length && prev[j]?.text !== w.text) j++;
    if (j < prev.length) return prevKeys[j++] ?? fresh++;
    return fresh++;
  });
}
