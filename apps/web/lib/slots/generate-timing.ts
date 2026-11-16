/**
 * How long a Generate takes in this session, for the preview's progress line (spec 09 R6.4: it
 * fills to 90 % over the last measured median, default 6 s). Module state, UI only.
 */
export const DEFAULT_GENERATE_MS = 6000;
const KEEP = 5;
let samples: number[] = [];

export function recordGenerateMs(ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  samples = [...samples, ms].slice(-KEEP);
}

export function generateMedianMs(): number {
  if (samples.length === 0) return DEFAULT_GENERATE_MS;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round(value ?? DEFAULT_GENERATE_MS);
}

export function resetGenerateTiming(): void {
  samples = [];
}
