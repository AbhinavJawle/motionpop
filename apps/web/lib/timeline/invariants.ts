import type { Limits } from './constraints';

export { timelineIssues, wordsInRange, type WordRange } from '@motionpop/schemas';

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
