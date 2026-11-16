import { create } from 'zustand';

/**
 * What the AI is doing right now, for the places that show it: the quick-edit shimmer, the Pip
 * bubble in the rail ("Pip is thinking…", then "Done!") and the preview badge ("● Ready in 4.2s").
 * UI only; the project never stores it (spec 09 R7.6, R6.4).
 */
export type AIActivityKind = 'edit' | 'note' | 'generate';

interface AIActivityState {
  busy: { kind: AIActivityKind; slotId: string } | null;
  /** The last AI result of this session: which slot, how long it took, when it landed. */
  ready: { slotId: string; ms: number; at: number } | null;
  /** When the last action finished, for the "Done!" bubble. */
  doneAt: number | null;
}

export const useAIActivity = create<AIActivityState>(() => ({
  busy: null,
  ready: null,
  doneAt: null,
}));

export function beginActivity(kind: AIActivityKind, slotId: string): void {
  useAIActivity.setState({ busy: { kind, slotId } });
}

/** An action ended. `ms` is set when a result landed (the badge reads "Ready in X.Xs"). */
export function endActivity(result?: { slotId: string; ms: number }, now = Date.now()): void {
  useAIActivity.setState((s) => ({
    busy: null,
    doneAt: result ? now : s.doneAt,
    ready: result ? { slotId: result.slotId, ms: result.ms, at: now } : s.ready,
  }));
}

export function resetActivity(): void {
  useAIActivity.setState({ busy: null, ready: null, doneAt: null });
}

/** "4.2s" from milliseconds, one decimal. */
export function secondsText(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}
