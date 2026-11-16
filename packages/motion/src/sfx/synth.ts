import { hashString, mulberry32 } from '../core/rng';
import {
  SFX_SAMPLE_RATE,
  biquad,
  dbToGain,
  logLerp,
  msToSamples,
  normalizePeak,
  smoothstep,
  step,
  tune,
} from './dsp';

/**
 * Synthesized sound effects (spec 12 design §5, D-016). Every effect is seeded noise, transients
 * and filtered thumps: no samples, no pure tones, chimes or dings. Pure: the same kind, take and
 * sample rate always give the same samples.
 */
export type SfxKind = 'whoosh' | 'pop' | 'tick' | 'rise' | 'impact';
export const SFX_KINDS: readonly SfxKind[] = ['whoosh', 'pop', 'tick', 'rise', 'impact'];

/** Takes per kind ("Shuffle takes" and placement pick among them). */
export const SFX_TAKES: Readonly<Record<SfxKind, number>> = {
  whoosh: 3,
  pop: 3,
  tick: 3,
  rise: 2,
  impact: 3,
};

/** Every effect is normalised to this sample peak (-3 dBFS); the mixer sets the level. */
export const SFX_PEAK = dbToGain(-3);

export interface SfxSpec {
  lengthMs: number;
  /** Where the effect's sample peak sits; the mixer lands this point on `atMs`. */
  peakMs: number;
}

const WHOOSH_LENGTHS = [440, 480, 510] as const;
const POP_BODY_HZ = [140, 160, 180] as const;
const TICK_RING_HZ = [2200, 2600, 3100] as const;
const RISE_TOP_HZ = [3600, 4400] as const;
const IMPACT_BODY_HZ = [62, 70, 78] as const;

/** Clamps a take into the kind's range (so any non-negative integer is a valid take). */
export function takeIndex(kind: SfxKind, take: number): number {
  const n = SFX_TAKES[kind];
  return ((Math.trunc(take) % n) + n) % n;
}

const pick = <T>(xs: readonly T[], i: number): T => xs[i % xs.length] as T;

/** Length and peak position of one take (design §5 table). */
export function sfxSpec(kind: SfxKind, take: number): SfxSpec {
  const k = takeIndex(kind, take);
  switch (kind) {
    case 'whoosh': {
      const lengthMs = pick(WHOOSH_LENGTHS, k);
      return { lengthMs, peakMs: Math.round(lengthMs * 0.55) };
    }
    case 'pop':
      return { lengthMs: 90, peakMs: 6 };
    case 'tick':
      return { lengthMs: 25, peakMs: 1 };
    case 'rise':
      return { lengthMs: 900, peakMs: 899 };
    case 'impact':
      return { lengthMs: 450, peakMs: 8 };
  }
}

/** A generator of white noise in [-1, 1) for one kind and take. */
const noiseFor = (kind: SfxKind, take: number) => {
  const r = mulberry32(hashString(`sfx:${kind}:${take}`));
  return () => r() * 2 - 1;
};

/**
 * A decaying sine "thump" whose pitch drops from `startMul × hz` to `hz`, with its crest placed
 * exactly at `crestT` (seconds). Short and enveloped, so it reads as a body, not a tone.
 */
function thump(
  out: Float32Array,
  sr: number,
  hz: number,
  startMul: number,
  dropS: number,
  attackS: number,
  decayS: number,
  gain: number,
): void {
  // Phase at time t: 2π ∫ f, f(t) = hz (1 + (startMul - 1) e^{-t/drop}).
  const phase = (t: number) =>
    2 * Math.PI * hz * (t + (startMul - 1) * dropS * (1 - Math.exp(-t / dropS)));
  const offset = Math.PI / 2 - phase(attackS);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const env =
      t < attackS ? Math.sin((Math.PI / 2) * (t / attackS)) : Math.exp(-(t - attackS) / decayS);
    out[i] = (out[i] ?? 0) + gain * env * Math.sin(phase(t) + offset);
  }
}

/**
 * A loudness-normalised, soft-limited noise carrier: band-passed noise divided by its running RMS
 * (5 ms) and passed through tanh, so |c| < 1 everywhere and loud samples sit near 1. The envelope
 * then decides where the sound peaks, not a lucky noise sample.
 */
function softCarrier() {
  let ms = 1e-6;
  return (x: number, sr: number): number => {
    const a = 1 - Math.exp(-1 / (0.005 * sr));
    ms += a * (x * x - ms);
    return Math.tanh((1.6 * x) / Math.sqrt(ms + 1e-12));
  };
}

function whoosh(k: number, sr: number, n: number, peakAt: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('whoosh', k);
  const bp = biquad();
  const body = biquad();
  const carrier = softCarrier();
  const startHz = pick([350, 400, 460], k);
  const topHz = pick([2600, 3000, 3400], k);
  const endHz = pick([700, 800, 900], k);
  tune(body, 'lowpass', 320, 0.7, sr);
  const accent = 0.012 * sr; // 12 ms pass-by accent at the peak
  for (let i = 0; i < n; i++) {
    const w = noise();
    const hz =
      i <= peakAt
        ? logLerp(startHz, topHz, smoothstep(i / peakAt))
        : logLerp(topHz, endHz, smoothstep((i - peakAt) / (n - 1 - peakAt)));
    tune(bp, 'bandpass', hz, 1.1, sr);
    // Asymmetric Hann, raised to 1.6, with a short pass-by accent on the peak.
    const hann =
      i <= peakAt
        ? 0.5 - 0.5 * Math.cos((Math.PI * i) / peakAt)
        : 0.5 + 0.5 * Math.cos((Math.PI * (i - peakAt)) / (n - 1 - peakAt));
    const env = Math.pow(hann, 1.6) * (0.8 + 0.2 * Math.exp(-Math.abs(i - peakAt) / accent));
    out[i] = env * (0.85 * carrier(step(bp, w), sr) + 0.15 * Math.tanh(step(body, w) * 3));
  }
  return out;
}

function pop(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('pop', k);
  const hp = biquad();
  tune(hp, 'highpass', 2000, 0.7, sr);
  const burst = msToSamples(3, sr);
  for (let i = 0; i < burst; i++) {
    const env = Math.min(1, i / msToSamples(0.4, sr)) * (1 - i / burst);
    out[i] = 0.35 * env * step(hp, noise());
  }
  thump(out, sr, pick(POP_BODY_HZ, k), 1.7, 0.008, 0.006, 0.015, 1);
  return out;
}

function tick(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('tick', k);
  const ring = biquad();
  tune(ring, 'bandpass', pick(TICK_RING_HZ, k), 9, sr);
  // A 1.5 ms high-passed click: a Ricker pulse (zero-mean, so no low end) centred on 1 ms
  // (sigma 0.12 ms), a little seeded noise for texture, ringing a resonant band-pass that decays
  // in about 20 ms.
  const c0 = 0.001;
  const sigma = 0.00012;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const u = (t - c0) / sigma;
    const pulse = t < 0.0015 ? (1 - u * u) * Math.exp(-0.5 * u * u) : 0;
    const grit = t < 0.0015 ? 0.15 * noise() * Math.exp(-0.5 * u * u) : 0;
    const exc = pulse + grit;
    const r = step(ring, exc * 3);
    out[i] = exc + 0.5 * r * Math.exp(-t / 0.006);
  }
  return out;
}

function rise(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('rise', k);
  const bp = biquad();
  const lp = biquad();
  const carrier = softCarrier();
  tune(lp, 'lowpass', 500, 0.7, sr);
  const top = pick(RISE_TOP_HZ, k);
  const curve = pick([1.8, 2.4], k);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    tune(bp, 'bandpass', logLerp(300, top, Math.pow(u, curve)), 0.8 + 2.2 * u, sr);
    const w = noise();
    const env = Math.pow(u, 2.2);
    out[i] = env * (0.85 * carrier(step(bp, w), sr) + 0.15 * Math.tanh(step(lp, w) * 3));
  }
  return out;
}

function impact(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('impact', k);
  const lp = biquad();
  const start = msToSamples(8, sr);
  const tail = msToSamples(300, sr);
  for (let i = start; i < Math.min(n, start + tail); i++) {
    const t = (i - start) / sr;
    tune(lp, 'lowpass', logLerp(3000, 400, t / 0.3), 0.7, sr);
    out[i] = 0.3 * (1 - Math.exp(-t / 0.015)) * Math.exp(-t / 0.09) * step(lp, noise());
  }
  thump(out, sr, pick(IMPACT_BODY_HZ, k), 2.2, 0.02, 0.008, 0.045, 1);
  return out;
}

/**
 * Makes `at` the sample peak: if another sample is louder, the sample at `at` is raised just above
 * it. Every recipe already peaks its envelope there (measured 2026-11-16: before this step the
 * sample at `at` is at least 0.9 of the loudest one for every take), so the change is a one-sample
 * nudge of under 1 dB at the loudest moment; it makes `sfxSpec().peakMs` exact.
 */
function lockPeak(x: Float32Array, at: number): void {
  let m = 0;
  for (let i = 0; i < x.length; i++) {
    if (i === at) continue;
    const a = Math.abs(x[i] ?? 0);
    if (a > m) m = a;
  }
  const v = x[at] ?? 0;
  if (Math.abs(v) <= m) x[at] = (v < 0 ? -1 : 1) * m * 1.0001;
}

/** Fades the last `ms` to zero (no click at the end), never touching the peak sample. */
function tailFade(x: Float32Array, sr: number, ms: number, peakAt: number): void {
  const m = Math.min(msToSamples(ms, sr), x.length - 1 - peakAt);
  for (let i = 0; i < m; i++) {
    const j = x.length - 1 - i;
    x[j] = (x[j] ?? 0) * (i / m);
  }
}

const cache = new Map<string, Float32Array>();

/** The samples of one take, shared and read-only (the mixer uses this to avoid a copy). */
export function sfxSamples(
  kind: SfxKind,
  take: number,
  sampleRate = SFX_SAMPLE_RATE,
): Float32Array {
  const k = takeIndex(kind, take);
  const key = `${kind}:${k}:${sampleRate}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const spec = sfxSpec(kind, k);
  const n = msToSamples(spec.lengthMs, sampleRate);
  const peakAt = Math.min(n - 1, msToSamples(spec.peakMs, sampleRate));
  let x: Float32Array;
  switch (kind) {
    case 'whoosh':
      x = whoosh(k, sampleRate, n, peakAt);
      break;
    case 'pop':
      x = pop(k, sampleRate, n);
      break;
    case 'tick':
      x = tick(k, sampleRate, n);
      break;
    case 'rise':
      x = rise(k, sampleRate, n);
      break;
    case 'impact':
      x = impact(k, sampleRate, n);
      break;
  }
  tailFade(x, sampleRate, kind === 'rise' ? 1 : kind === 'tick' ? 4 : 12, peakAt);
  lockPeak(x, peakAt);
  normalizePeak(x, SFX_PEAK);
  cache.set(key, x);
  return x;
}

/** One synthesized effect: pure, seeded by (kind, take). Returns a fresh copy. */
export function synthSfx(kind: SfxKind, take: number, sampleRate = SFX_SAMPLE_RATE): Float32Array {
  return sfxSamples(kind, take, sampleRate).slice();
}
