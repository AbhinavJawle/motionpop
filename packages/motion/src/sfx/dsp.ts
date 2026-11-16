/**
 * Small pure DSP helpers for the synthesized sound (spec 12b). No Web Audio: plain arithmetic on
 * Float32Arrays, so the same code runs in a browser worker and in Node and gives the same samples.
 */

/** The sample rate of every synthesized sound and of the bed (D-024: 24 kHz mono). */
export const SFX_SAMPLE_RATE = 24_000;

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
/** -Infinity for silence. */
export const gainToDb = (g: number): number => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/** Samples for a duration in ms at a rate. */
export const msToSamples = (ms: number, sampleRate: number): number =>
  Math.round((ms * sampleRate) / 1000);

/** Largest absolute sample value. */
export function peakOf(x: Float32Array): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i] ?? 0);
    if (a > m) m = a;
  }
  return m;
}

/** Index of the largest absolute sample (the first one on ties). */
export function argPeak(x: Float32Array): number {
  let m = -1;
  let at = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i] ?? 0);
    if (a > m) {
      m = a;
      at = i;
    }
  }
  return at;
}

/** A second-order IIR filter (RBJ cookbook), direct form I, coefficients settable per sample. */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export const biquad = (): Biquad => ({
  b0: 1,
  b1: 0,
  b2: 0,
  a1: 0,
  a2: 0,
  x1: 0,
  x2: 0,
  y1: 0,
  y2: 0,
});

type Shape = 'lowpass' | 'highpass' | 'bandpass';

/** Sets the coefficients. `bandpass` has a 0 dB peak gain. The frequency is clamped to a safe range. */
export function tune(f: Biquad, shape: Shape, hz: number, q: number, sampleRate: number): void {
  const fc = Math.min(Math.max(hz, 10), sampleRate * 0.45);
  const w = (2 * Math.PI * fc) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.max(q, 0.05));
  const a0 = 1 + alpha;
  let b0: number;
  let b1: number;
  let b2: number;
  if (shape === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  } else if (shape === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  f.b0 = b0 / a0;
  f.b1 = b1 / a0;
  f.b2 = b2 / a0;
  f.a1 = (-2 * cos) / a0;
  f.a2 = (1 - alpha) / a0;
}

export function step(f: Biquad, x: number): number {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1;
  f.x1 = x;
  f.y2 = f.y1;
  f.y1 = y;
  return y;
}

/** Log-domain interpolation between two frequencies, `u` in [0, 1]. */
export const logLerp = (a: number, b: number, u: number): number =>
  a * Math.pow(b / a, Math.min(1, Math.max(0, u)));

export const smoothstep = (u: number): number => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

/** Scales in place so the peak equals `peak` (linear). Silence stays silent. */
export function normalizePeak(x: Float32Array, peak: number): Float32Array {
  const m = peakOf(x);
  if (m === 0) return x;
  const g = peak / m;
  for (let i = 0; i < x.length; i++) x[i] = (x[i] ?? 0) * g;
  return x;
}

/** Linear fade-in over the first `n` and fade-out over the last `m` samples, in place. */
export function fadeEdges(x: Float32Array, n: number, m: number): Float32Array {
  const len = x.length;
  for (let i = 0; i < Math.min(n, len); i++) x[i] = (x[i] ?? 0) * (i / n);
  for (let i = 0; i < Math.min(m, len); i++) {
    const j = len - 1 - i;
    x[j] = (x[j] ?? 0) * (i / m);
  }
  return x;
}
