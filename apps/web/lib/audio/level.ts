/** Live level feedback for the recorder (spec 11 R8.2, design §6). Pure. */

export interface LevelFrame {
  /** Linear peak 0..1 of a 50 ms frame. */
  peak: number;
  /** Linear RMS 0..1 of the frame. */
  rms: number;
  /** Capture time at the end of the frame. */
  tMs: number;
}

export const FRAME_MS = 50;
const WINDOW_MS = 1500;
const VOICED_PEAK = 10 ** (-50 / 20);
const QUIET_RMS = 10 ** (-42 / 20);

/**
 * "quiet" when the RMS of the voiced frames (peak above −50 dBFS) of the last 1.5 s is below
 * −42 dBFS, or when nothing in that window was voiced; "good" otherwise, and during the first
 * 1.5 s of a take.
 */
export function feedback(frames: readonly LevelFrame[]): 'good' | 'quiet' {
  const last = frames[frames.length - 1];
  if (!last || last.tMs < WINDOW_MS) return 'good';
  let sum = 0;
  let n = 0;
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (!f || f.tMs <= last.tMs - WINDOW_MS) break;
    if (f.peak > VOICED_PEAK) {
      sum += f.rms * f.rms;
      n++;
    }
  }
  if (n === 0) return 'quiet';
  return Math.sqrt(sum / n) < QUIET_RMS ? 'quiet' : 'good';
}

/** "00:12.8" from milliseconds (tabular, tenths). */
export function recordClock(ms: number): string {
  const tenths = Math.max(0, Math.floor(ms / 100));
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths % 10}`;
}
