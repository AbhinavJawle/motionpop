import type { Limits } from './constraints';

export { timelineIssues } from '@motionpop/schemas';

export type WordRange = { wordStart: number; wordEnd: number };

/** Indices of the first and last words overlapping [startMs, endMs), or null if none. */
export function wordsInRange(
  words: ReadonlyArray<{ startMs: number; endMs: number }>,
  startMs: number,
  endMs: number,
): WordRange | null {
  let first = -1;
  let last = -1;
  words.forEach((w, i) => {
    if (w.endMs > startMs && w.startMs < endMs) {
      if (first < 0) first = i;
      last = i;
    }
  });
  return first < 0 ? null : { wordStart: first, wordEnd: last };
}

/** Duration-limit invariant (commands enforce it; loading never fails because of it). */
export function checkDurations(
  slots: ReadonlyArray<{ id: string; startMs: number; endMs: number; componentId: string }>,
  limitsFor: (componentId: string) => Limits,
): string[] {
  const issues: string[] = [];
  for (const s of slots) {
    const { minMs, maxMs } = limitsFor(s.componentId);
    const d = s.endMs - s.startMs;
    if (d < minMs || d > maxMs) {
      issues.push(`slot "${s.id}" duration ${d} ms is outside ${minMs}..${maxMs} ms`);
    }
  }
  return issues;
}
