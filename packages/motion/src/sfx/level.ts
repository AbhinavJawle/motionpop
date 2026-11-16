import { gainToDb, msToSamples } from './dsp';

/**
 * Level measurements for the bed mix (spec 12 D-067 #11). Plain RMS in dBFS, a documented
 * approximation of loudness (not BS.1770): enough to keep music under any recording's voice.
 */

/** The level reported for silence or an empty signal. */
export const LEVEL_FLOOR_DB = -60;

const floorDb = (db: number) =>
  Number.isFinite(db) ? Math.max(db, LEVEL_FLOOR_DB) : LEVEL_FLOOR_DB;

/** RMS of `samples[from, to)` in dBFS, floored at `LEVEL_FLOOR_DB`. */
export function rmsDb(samples: Float32Array, from = 0, to = samples.length): number {
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(samples.length, Math.ceil(to));
  if (b <= a) return LEVEL_FLOOR_DB;
  let sq = 0;
  for (let i = a; i < b; i++) sq += (samples[i] ?? 0) ** 2;
  return floorDb(gainToDb(Math.sqrt(sq / (b - a))));
}

/** The loudest `windowMs` stretch of a sound, as RMS dBFS (the level of a short effect). */
export function shortTermLevelDb(samples: Float32Array, sampleRate: number, windowMs = 50): number {
  const w = Math.max(1, Math.min(samples.length, msToSamples(windowMs, sampleRate)));
  if (samples.length === 0) return LEVEL_FLOOR_DB;
  let sq = 0;
  for (let i = 0; i < w; i++) sq += (samples[i] ?? 0) ** 2;
  let best = sq;
  for (let i = w; i < samples.length; i++) {
    sq += (samples[i] ?? 0) ** 2 - (samples[i - w] ?? 0) ** 2;
    if (sq > best) best = sq;
  }
  return floorDb(gainToDb(Math.sqrt(Math.max(0, best) / w)));
}

/** Word spans merged where they touch or overlap, sorted, in ms. Fillers count as voice. */
export function speechSpans(
  words: ReadonlyArray<{ startMs: number; endMs: number }>,
  mergeGapMs = 0,
): { startMs: number; endMs: number }[] {
  const spans = words
    .filter((w) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs) && w.endMs > w.startMs)
    .map((w) => ({ startMs: w.startMs, endMs: w.endMs }))
    .sort((a, b) => a.startMs - b.startMs);
  const out: { startMs: number; endMs: number }[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    const gap = last ? s.startMs - last.endMs : Infinity;
    if (last && (gap <= 0 || gap < mergeGapMs)) last.endMs = Math.max(last.endMs, s.endMs);
    else out.push({ ...s });
  }
  return out;
}

/**
 * The voice level: RMS over the word regions of the voiceover (pauses excluded), in dBFS.
 * Without words it measures the whole file; silence gives `LEVEL_FLOOR_DB`.
 */
export function voiceLevelDb(
  samples: Float32Array,
  sampleRate: number,
  words: ReadonlyArray<{ startMs: number; endMs: number }>,
): number {
  let sq = 0;
  let n = 0;
  for (const s of speechSpans(words)) {
    const a = Math.max(0, msToSamples(s.startMs, sampleRate));
    const b = Math.min(samples.length, msToSamples(s.endMs, sampleRate));
    for (let i = a; i < b; i++) sq += (samples[i] ?? 0) ** 2;
    n += Math.max(0, b - a);
  }
  if (n === 0) return rmsDb(samples);
  return floorDb(gainToDb(Math.sqrt(sq / n)));
}
