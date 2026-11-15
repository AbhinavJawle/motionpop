/**
 * Delivery analysis (spec 07 R9.1): how hard each word was spoken, and where the pauses are.
 * Pure signal processing: no AI, no network, deterministic. It only refines choices the AI (or
 * the tagger) already made; on its own it is too noisy to decide what matters.
 */
export interface ProsodyWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface Prosody {
  v: 1;
  /** One value per word: 0 (flat) to 100 (most stressed). 50 means average delivery. */
  stress: number[];
  /** Silences of `PAUSE_MIN_MS` or longer. */
  pauses: { startMs: number; endMs: number }[];
}

export const PAUSE_MIN_MS = 300;
/** A word counts as stressed (for the Processing card) from this value up. */
export const STRESSED_FROM = 70;

const PITCH_RATE = 8000; // pitch is estimated on a decimated copy: cheap and enough for 70–400 Hz
const PITCH_WINDOW = 256;
const PITCH_FRAMES_PER_WORD = 8;
const MIN_LAG = Math.floor(PITCH_RATE / 400);
const MAX_LAG = Math.ceil(PITCH_RATE / 70);
const FRAME_MS = 20;

const syllables = (text: string): number =>
  Math.max(1, (text.toLowerCase().match(/[aeiouy]+/g) ?? []).length);

function rms(x: Float32Array, from: number, to: number): number {
  const a = Math.max(0, from);
  const b = Math.min(x.length, to);
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += (x[i] as number) * (x[i] as number);
  return Math.sqrt(sum / (b - a));
}

/** Box-filter decimation to about `PITCH_RATE`. */
function decimate(pcm: Float32Array, sampleRate: number): { x: Float32Array; rate: number } {
  const k = Math.max(1, Math.round(sampleRate / PITCH_RATE));
  const out = new Float32Array(Math.floor(pcm.length / k));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += pcm[i * k + j] as number;
    out[i] = s / k;
  }
  return { x: out, rate: sampleRate / k };
}

/** Autocorrelation pitch of one window, or null when it is quiet or has no clear period. */
function framePitch(x: Float32Array, start: number, rate: number, floor: number): number | null {
  if (start < 0 || start + PITCH_WINDOW + MAX_LAG > x.length) return null;
  if (rms(x, start, start + PITCH_WINDOW) < floor) return null;
  let energy = 0;
  for (let i = 0; i < PITCH_WINDOW; i++) energy += (x[start + i] as number) ** 2;
  let best = 0;
  let bestLag = 0;
  for (let lag = MIN_LAG; lag <= MAX_LAG; lag++) {
    let c = 0;
    for (let i = 0; i < PITCH_WINDOW; i++)
      c += (x[start + i] as number) * (x[start + i + lag] as number);
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  // Require a clear period (unvoiced sounds like "s" correlate weakly).
  return bestLag > 0 && best > 0.45 * energy ? rate / bestLag : null;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** z-scores; missing values (NaN) and flat features score 0. */
function zscores(values: number[]): number[] {
  const present = values.filter((v) => Number.isFinite(v));
  if (present.length < 2) return values.map(() => 0);
  const mean = present.reduce((a, b) => a + b, 0) / present.length;
  const sd = Math.sqrt(present.reduce((a, b) => a + (b - mean) ** 2, 0) / present.length);
  if (sd < 1e-6) return values.map(() => 0);
  return values.map((v) => (Number.isFinite(v) ? (v - mean) / sd : 0));
}

export function prosody(
  pcm: Float32Array,
  sampleRate: number,
  words: readonly ProsodyWord[],
): Prosody {
  const at = (ms: number) => Math.round((ms / 1000) * sampleRate);

  // Pauses: runs of quiet 20 ms frames. The threshold follows the recording's own level.
  const frame = Math.max(1, Math.round((FRAME_MS / 1000) * sampleRate));
  const levels: number[] = [];
  for (let i = 0; i + frame <= pcm.length; i += frame) levels.push(rms(pcm, i, i + frame));
  const loud =
    levels.length > 0
      ? ([...levels].sort((a, b) => a - b)[Math.floor(levels.length * 0.9)] as number)
      : 0;
  const quiet = Math.max(1e-4, loud * 0.1);
  const pauses: Prosody['pauses'] = [];
  let run = 0;
  for (let i = 0; i <= levels.length; i++) {
    if (i < levels.length && (levels[i] as number) < quiet) {
      run++;
      continue;
    }
    // A silence rarely lines up with the 20 ms grid: the partly quiet frames at both edges are
    // not counted, so a run one frame short of the minimum may still hold a real pause.
    if (run * FRAME_MS >= PAUSE_MIN_MS - FRAME_MS) {
      let startMs = (i - run) * FRAME_MS;
      let endMs = i * FRAME_MS;
      // Grow each edge in 1 ms steps into the neighbouring frame while it stays quiet.
      while (
        startMs > 0 &&
        startMs > (i - run - 1) * FRAME_MS &&
        rms(pcm, at(startMs - 1), at(startMs)) < quiet
      )
        startMs--;
      while (
        endMs < i * FRAME_MS + FRAME_MS &&
        at(endMs + 1) <= pcm.length &&
        rms(pcm, at(endMs), at(endMs + 1)) < quiet
      )
        endMs++;
      if (endMs - startMs >= PAUSE_MIN_MS && startMs >= (pauses.at(-1)?.endMs ?? 0))
        pauses.push({ startMs, endMs });
    }
    run = 0;
  }

  if (words.length === 0) return { v: 1, stress: [], pauses };

  const low = decimate(pcm, sampleRate);
  const loudness: number[] = [];
  const pitch: number[] = [];
  const pace: number[] = [];
  for (const w of words) {
    const level = rms(pcm, at(w.startMs), at(w.endMs));
    loudness.push(level > 0 ? 20 * Math.log10(level) : NaN);
    const a = Math.round((w.startMs / 1000) * low.rate);
    const b = Math.round((w.endMs / 1000) * low.rate) - PITCH_WINDOW;
    const hz: number[] = [];
    for (let k = 0; k < PITCH_FRAMES_PER_WORD && b > a; k++) {
      const p = framePitch(
        low.x,
        Math.round(a + ((b - a) * k) / PITCH_FRAMES_PER_WORD),
        low.rate,
        quiet,
      );
      if (p !== null) hz.push(p);
    }
    pitch.push(hz.length > 0 ? median(hz) : NaN);
    pace.push((w.endMs - w.startMs) / syllables(w.text));
  }
  const zl = zscores(loudness);
  const zp = zscores(pitch);
  const zd = zscores(pace);
  // Sum of the three cues, squashed so an average word sits at 50.
  // A word with no audio under it (silence, or timings past the end) stays neutral.
  const stress = words.map((_, i) =>
    Number.isFinite(loudness[i])
      ? Math.round(
          50 + 50 * Math.tanh(((zl[i] as number) + (zp[i] as number) + (zd[i] as number)) / 3),
        )
      : 50,
  );
  return { v: 1, stress, pauses };
}

export const stressedCount = (p: Prosody): number =>
  p.stress.filter((s) => s >= STRESSED_FROM).length;
