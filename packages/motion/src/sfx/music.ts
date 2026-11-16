import { rngFor } from '../core/rng';
import {
  SFX_SAMPLE_RATE,
  biquad,
  dbToGain,
  msToSamples,
  normalizePeak,
  step,
  tune,
  type Biquad,
} from './dsp';

/**
 * Synthesized music beds (spec 12 design §6, R7.2). Pure DSP: one 8-bar loop rendered from short
 * seeded patterns, then looped to the video with a 1 s fade-in and a 1.5 s fade-out. Shipped
 * behind `musicSynthEnabled` until the founder has listened (D-067 #3).
 *
 * Seams: the synthesized loops are rendered cyclic (every tail wraps to the start and the filters
 * run warm), so they tile back to back with a continuous seam and the beat grid intact. The
 * design's 500 ms overlap crossfade would move every repeat 500 ms off the beat (a 625 ms beat at
 * 96 BPM), so it is used only for loops that are not cyclic, such as the user's own track.
 */
export const MUSIC_BED_IDS = ['calm-pad', 'steady-pulse'] as const;
export type MusicBedId = (typeof MUSIC_BED_IDS)[number];

export const MUSIC_CROSSFADE_MS = 500;
export const MUSIC_FADE_IN_MS = 1000;
export const MUSIC_FADE_OUT_MS = 1500;
/** Loops are normalised to this peak; an equal-power crossfade stays under −3 dBFS. */
const LOOP_PEAK = dbToGain(-6);

const BPM: Record<MusicBedId, number> = { 'calm-pad': 72, 'steady-pulse': 96 };

type Quality = 'maj7' | 'm7' | 'add9' | 'sus2';
const CHORD: Record<Quality, readonly number[]> = {
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  add9: [0, 4, 7, 14],
  sus2: [0, 2, 7, 12],
};
/** Two chords per 8-bar loop (a change every 4 bars), as [semitones from the key, quality]. */
const PROGRESSIONS: readonly (readonly [readonly [number, Quality], readonly [number, Quality]])[] =
  [
    [
      [0, 'maj7'],
      [9, 'm7'],
    ],
    [
      [5, 'maj7'],
      [0, 'add9'],
    ],
    [
      [0, 'add9'],
      [7, 'sus2'],
    ],
    [
      [9, 'm7'],
      [5, 'maj7'],
    ],
  ];
/** Key roots as MIDI notes (D3 to A3). */
const KEYS = [50, 51, 53, 55, 57] as const;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** PolyBLEP correction for a band-limited sawtooth. */
function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/**
 * Adds a pad to `out`: detuned saw stacks per chord note through a slow low-pass, each chord
 * swelling in over 1.2 s and releasing over 1.2 s into the next. Tails wrap around the loop, so
 * the loop is cyclic before any crossfade.
 */
function addPad(
  out: Float32Array,
  sr: number,
  rand: () => number,
  chords: readonly (readonly number[])[],
  cutoff: readonly [number, number],
  gain: number,
): void {
  const n = out.length;
  const seg = Math.floor(n / chords.length);
  const fade = msToSamples(1200, sr);
  const pad = new Float32Array(n);
  chords.forEach((notes, c) => {
    const start = c * seg;
    const len = seg + fade; // the release runs into the next chord
    const voices = notes.flatMap((m) =>
      [-7, 0, 7].map((cents) => ({ dt: hz(m + cents / 100) / sr, ph: rand() })),
    );
    const amp = 1 / Math.sqrt(voices.length);
    for (let j = 0; j < len; j++) {
      const env =
        j < fade
          ? 0.5 - 0.5 * Math.cos((Math.PI * j) / fade)
          : j >= seg
            ? 0.5 + 0.5 * Math.cos((Math.PI * (j - seg)) / fade)
            : 1;
      let s = 0;
      for (const v of voices) {
        s += 2 * v.ph - 1 - blep(v.ph, v.dt);
        v.ph += v.dt;
        if (v.ph >= 1) v.ph -= 1;
      }
      const i = (start + j) % n;
      pad[i] = (pad[i] ?? 0) + s * amp * env;
    }
    // A soft sub an octave under the chord root.
    const sub = hz((notes[0] ?? 48) - 12) / sr;
    for (let j = 0; j < len; j++) {
      const env =
        j < fade
          ? 0.5 - 0.5 * Math.cos((Math.PI * j) / fade)
          : j >= seg
            ? 0.5 + 0.5 * Math.cos((Math.PI * (j - seg)) / fade)
            : 1;
      const i = (start + j) % n;
      pad[i] = (pad[i] ?? 0) + 0.18 * env * Math.sin(2 * Math.PI * sub * j);
    }
  });
  // A slow low-pass whose cutoff breathes once per loop (cyclic).
  const [lo, hi] = cutoff;
  const filtered = cyclicFilter(pad, (f, i) =>
    tune(f, 'lowpass', lo + (hi - lo) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)), 0.7, sr),
  );
  for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) + gain * (filtered[i] ?? 0);
}

/**
 * Filters a loop as if it repeated forever: one warm-up pass, then the kept pass, so the filter
 * state at the loop's start equals its state at the end (the seam is continuous). `retune` sets
 * the coefficients every 32 samples from the position in the loop.
 */
function cyclicFilter(x: Float32Array, retune: (f: Biquad, i: number) => void): Float32Array {
  const f = biquad();
  const out = new Float32Array(x.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < x.length; i++) {
      if (i % 32 === 0) retune(f, i);
      const y = step(f, x[i] ?? 0);
      if (pass === 1) out[i] = y;
    }
  }
  return out;
}

/** Soft kick on every beat: a low thump with a quick pitch drop, no click. */
function addKicks(out: Float32Array, sr: number, beatS: number, gain: number): void {
  const len = msToSamples(700, sr);
  const taper = msToSamples(50, sr);
  const beats = Math.round(out.length / (beatS * sr));
  for (let b = 0; b < beats; b++) {
    const start = Math.round(b * beatS * sr);
    let ph = 0;
    for (let j = 0; j < len; j++) {
      const t = j / sr;
      ph += (2 * Math.PI * 52 * (1 + 1.5 * Math.exp(-t / 0.03))) / sr;
      const tail = j > len - taper ? (len - j) / taper : 1;
      const env = Math.min(1, t / 0.003) * Math.exp(-t / 0.16) * tail;
      const i = (start + j) % out.length; // the last kick's tail wraps: the loop is cyclic
      out[i] = (out[i] ?? 0) + gain * env * Math.sin(ph);
    }
  }
}

/** Filtered hats on the off-beats with seeded accents, and a few quiet ghost notes. */
function addHats(
  out: Float32Array,
  sr: number,
  beatS: number,
  rand: () => number,
  gain: number,
): void {
  const n = out.length;
  const raw = new Float32Array(n);
  const len = msToSamples(60, sr);
  const steps = Math.round((n / (beatS * sr)) * 4); // sixteenths
  for (let k = 0; k < steps; k++) {
    const offbeat = k % 4 === 2;
    const ghost = !offbeat && k % 2 === 1 && rand() < 0.35;
    if (!offbeat && !ghost) continue;
    const level = gain * (offbeat ? 0.8 + 0.4 * rand() : 0.3);
    const start = Math.round((k * beatS * sr) / 4);
    for (let j = 0; j < len; j++) {
      const env = Math.exp(-j / sr / (offbeat ? 0.035 : 0.02));
      const i = (start + j) % n;
      raw[i] = (raw[i] ?? 0) + level * env * (rand() * 2 - 1);
    }
  }
  const hats = cyclicFilter(raw, (f, i) => {
    if (i === 0) tune(f, 'highpass', 7000, 0.7, sr);
  });
  for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) + (hats[i] ?? 0);
}

function voicing(root: number, intervals: readonly number[]): number[] {
  return intervals.map((iv) => {
    let m = root + iv;
    while (m > 72) m -= 12;
    while (m < 48) m += 12;
    return m;
  });
}

/** One 8-bar loop of a bed, normalised to −6 dBFS. */
export function renderBedLoop(
  id: MusicBedId,
  seed: number,
  sampleRate = SFX_SAMPLE_RATE,
): Float32Array {
  const rand = rngFor(seed >>> 0, `music:${id}`);
  const beatS = 60 / BPM[id];
  const n = Math.round(8 * 4 * beatS * sampleRate);
  const key = KEYS[Math.floor(rand() * KEYS.length)] ?? 50;
  const prog = PROGRESSIONS[Math.floor(rand() * PROGRESSIONS.length)] ?? PROGRESSIONS[0]!;
  const chords = prog.map(([off, q]) => voicing(key + off, CHORD[q]));
  const out = new Float32Array(n);
  if (id === 'calm-pad') {
    addPad(out, sampleRate, rand, chords, [600, 1800], 1);
  } else {
    addPad(out, sampleRate, rand, chords, [500, 1100], 0.55);
    addKicks(out, sampleRate, beatS, 0.6);
    addHats(out, sampleRate, beatS, rand, 0.12);
  }
  return normalizePeak(out, LOOP_PEAK);
}

export interface FitMusicOptions {
  /**
   * The loop is cyclic (its end runs straight into its start, like the synthesized beds): tile it
   * back to back, so the beat grid is kept. Otherwise repeats overlap by `crossfadeMs`.
   */
  cyclic?: boolean;
  crossfadeMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}

/**
 * Loops or trims music to a duration (R7.2): repeats overlap by the crossfade with equal-power
 * curves, then a fade-in and a fade-out (both shortened proportionally for very short videos).
 * Used for the synthesized beds and for the user's own track. Returns exactly
 * `round(durationMs × sampleRate / 1000)` samples.
 */
export function fitMusic(
  loop: Float32Array,
  durationMs: number,
  sampleRate = SFX_SAMPLE_RATE,
  opts: FitMusicOptions = {},
): Float32Array {
  const n = Math.max(0, msToSamples(durationMs, sampleRate));
  const out = new Float32Array(n);
  const L = loop.length;
  if (n === 0 || L === 0) return out;
  const x = opts.cyclic
    ? 0
    : Math.min(msToSamples(opts.crossfadeMs ?? MUSIC_CROSSFADE_MS, sampleRate), Math.floor(L / 2));
  const hop = L - x;
  for (let pos = 0, k = 0; pos < n; pos += hop, k++) {
    for (let j = 0; j < L && pos + j < n; j++) {
      let w = 1;
      if (k > 0 && j < x) w = Math.sin((Math.PI / 2) * (j / x));
      if (pos + hop < n && j >= hop) w *= Math.cos((Math.PI / 2) * ((j - hop) / x));
      out[pos + j] = (out[pos + j] ?? 0) + (loop[j] ?? 0) * w;
    }
    if (hop <= 0) break;
  }
  let fin = msToSamples(opts.fadeInMs ?? MUSIC_FADE_IN_MS, sampleRate);
  let fout = msToSamples(opts.fadeOutMs ?? MUSIC_FADE_OUT_MS, sampleRate);
  if (fin + fout > n) {
    const s = n / (fin + fout);
    fin = Math.floor(fin * s);
    fout = Math.floor(fout * s);
  }
  for (let i = 0; i < fin; i++) out[i] = (out[i] ?? 0) * Math.sin((Math.PI / 2) * (i / fin));
  for (let i = 0; i < fout; i++) {
    const j = n - 1 - i;
    out[j] = (out[j] ?? 0) * Math.sin((Math.PI / 2) * (i / fout));
  }
  return out;
}

const loops = new Map<string, Float32Array>();
const LOOP_CACHE = 4;

/** A synthesized bed for a whole video: pure, seeded, exact length, peak ≤ −3 dBFS. */
export function synthBed(id: MusicBedId, durationMs: number, seed: number): Float32Array {
  const key = `${id}:${seed >>> 0}`;
  let loop = loops.get(key);
  if (!loop) {
    loop = renderBedLoop(id, seed);
    loops.set(key, loop);
    if (loops.size > LOOP_CACHE) loops.delete(loops.keys().next().value as string);
  }
  return fitMusic(loop, durationMs, SFX_SAMPLE_RATE, { cyclic: true });
}
