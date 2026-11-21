/**
 * Where the speaker is actually talking, measured from the audio itself (spec 28 R1). Whisper's
 * word timings are not good enough to cut on: the word before a pause routinely "lasts" through
 * the whole pause (`five.` 5.76–7.52 s over a silence starting at 5.83 s), so cuts made from word
 * gaps leave seconds of dead air. Pure functions, integer milliseconds out.
 */
import type { Word } from '@motionpop/schemas';

export interface Range {
  startMs: number;
  endMs: number;
}

export interface SpeechMap {
  /** Speech runs, sorted, non-overlapping. */
  runs: Range[];
  /** Silence runs between (and around) the speech runs, sorted. */
  silences: Range[];
  durationMs: number;
  floorDb: number;
  peakDb: number;
  thresholdDb: number;
  /**
   * False when the recording has too little contrast between speech and background (music bed,
   * loud room, heavy compression) to trust: callers then fall back to the word timings.
   */
  reliable: boolean;
}

export interface SpeechOptions {
  /** Analysis frame (ms). */
  frameMs: number;
  /** Speech shorter than this, with silence around it, is a click or a bump: dropped. */
  minSpeechMs: number;
  /** Silence shorter than this inside speech (stops, word joins) is part of the speech. */
  minSilenceMs: number;
  /** Frames above threshold keep the speech open this long after they end (soft word tails). */
  hangMs: number;
}

export const DEFAULT_SPEECH_OPTIONS: SpeechOptions = {
  frameMs: 10,
  minSpeechMs: 90,
  minSilenceMs: 160,
  hangMs: 60,
};

/** Frame energy in dBFS, one value per `frameMs`. */
export function frameDb(pcm: Float32Array, sampleRate: number, frameMs = 10): Float32Array {
  const hop = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const n = Math.floor(pcm.length / hop);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    const o = f * hop;
    for (let i = 0; i < hop; i++) {
      const x = pcm[o + i]!;
      s += x * x;
    }
    out[f] = 10 * Math.log10(s / hop + 1e-12);
  }
  return out;
}

function percentile(sorted: Float32Array, q: number): number {
  if (sorted.length === 0) return -120;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]!;
}

/**
 * The speech map of a mono recording. The threshold adapts to the recording: at least 12 dB over
 * the noise floor (10th percentile) and no more than 32 dB under the speech level (95th).
 */
export function speechMap(
  pcm: Float32Array,
  sampleRate: number,
  opts: Partial<SpeechOptions> = {},
): SpeechMap {
  const o = { ...DEFAULT_SPEECH_OPTIONS, ...opts };
  const db = frameDb(pcm, sampleRate, o.frameMs);
  const durationMs = Math.round((pcm.length / sampleRate) * 1000);
  const sorted = Float32Array.from(db).sort();
  const floorDb = percentile(sorted, 0.1);
  const peakDb = percentile(sorted, 0.95);
  const thresholdDb = Math.max(floorDb + 12, peakDb - 32);
  const reliable = db.length > 0 && peakDb - floorDb >= 18 && peakDb > -50;

  // Frames above threshold, held open for `hangMs` so soft word endings stay speech.
  const hang = Math.round(o.hangMs / o.frameMs);
  const on = new Uint8Array(db.length);
  let hold = 0;
  for (let f = 0; f < db.length; f++) {
    if (db[f]! >= thresholdDb) hold = hang + 1;
    if (hold > 0) {
      on[f] = 1;
      hold--;
    }
  }
  let runs: Range[] = [];
  for (let f = 0; f < on.length;) {
    if (!on[f]) {
      f++;
      continue;
    }
    let g = f;
    while (g < on.length && on[g]) g++;
    runs.push({ startMs: f * o.frameMs, endMs: Math.min(durationMs, g * o.frameMs) });
    f = g;
  }
  // Close short gaps (stops, joins between words), then drop isolated blips.
  const closed: Range[] = [];
  for (const r of runs) {
    const last = closed[closed.length - 1];
    if (last && r.startMs - last.endMs < o.minSilenceMs) last.endMs = r.endMs;
    else closed.push({ ...r });
  }
  runs = closed.filter((r) => r.endMs - r.startMs >= o.minSpeechMs);
  return {
    runs,
    silences: complement(runs, durationMs),
    durationMs,
    floorDb,
    peakDb,
    thresholdDb,
    reliable,
  };
}

/** The gaps between sorted ranges inside [0, durationMs]. */
export function complement(runs: readonly Range[], durationMs: number): Range[] {
  const out: Range[] = [];
  let at = 0;
  for (const r of runs) {
    if (r.startMs > at) out.push({ startMs: at, endMs: r.startMs });
    at = Math.max(at, r.endMs);
  }
  if (durationMs > at) out.push({ startMs: at, endMs: durationMs });
  return out;
}

/** How much of [a, b] is covered by the runs (ms). */
export function speechWithin(runs: readonly Range[], a: number, b: number): number {
  let s = 0;
  for (const r of runs) {
    if (r.endMs <= a) continue;
    if (r.startMs >= b) break;
    s += Math.min(b, r.endMs) - Math.max(a, r.startMs);
  }
  return s;
}

/** The longest silence that can sit inside one word. */
const WORD_GAP_MS = 250;

/**
 * Word timings pulled onto the speech (spec 28 R1.2): a word that runs on into silence ends where
 * the speech ends; one that starts in silence starts where the speech starts. A word with no
 * speech under it at all (a quiet word the meter missed) keeps its start and at most 500 ms.
 * Order and indices are kept; times stay monotonic.
 */
export function tightenWords(
  words: readonly Word[],
  map: SpeechMap,
  tailMs = 40,
  snapMs = 300,
): Word[] {
  const runs = map.runs;
  let prevStart = 0;
  let prevEnd = 0;
  const out = words.map((w, i) => {
    let startMs = w.startMs;
    let endMs = w.endMs;
    const overlapping = runs.filter((r) => r.endMs > startMs && r.startMs < endMs);
    if (overlapping.length > 0) {
      const first = overlapping[0]!;
      // A word never holds a quarter second of silence: it ends with the first burst that is
      // followed by one (later clicks and breaths inside Whisper's span are not the word).
      let lastIdx = 0;
      while (
        lastIdx + 1 < overlapping.length &&
        overlapping[lastIdx + 1]!.startMs - overlapping[lastIdx]!.endMs < WORD_GAP_MS
      ) {
        lastIdx++;
      }
      const last = overlapping[lastIdx]!;
      if (startMs < first.startMs) startMs = first.startMs;
      if (endMs > last.endMs + tailMs) endMs = last.endMs + tailMs;
      // Whisper often starts the first word of a burst late and ends the last one early: snap
      // them to the burst's edges so the cut never clips an onset or a trailing consonant.
      if (startMs - first.startMs <= snapMs && first.startMs >= prevEnd) startMs = first.startMs;
      const next = words[i + 1];
      if (
        (!next || next.startMs >= last.endMs) &&
        last.endMs - endMs <= snapMs &&
        last.endMs > endMs
      ) {
        endMs = last.endMs;
      }
    } else if (endMs - startMs > 500) {
      endMs = startMs + 500;
    }
    startMs = Math.max(startMs, prevStart);
    endMs = Math.max(endMs, startMs);
    prevStart = startMs;
    prevEnd = endMs;
    return { ...w, startMs: Math.round(startMs), endMs: Math.round(endMs) };
  });
  return out;
}
