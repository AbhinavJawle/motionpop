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
 * Synthesized sound effects (spec 12 design §5 + expanded editorial SFX palette).
 * Pure and deterministic: the same kind, take and sample rate always give the exact same samples,
 * so browser preview and FFmpeg/Cloud Run export sound identical with zero external assets.
 */
export type SfxKind =
  | 'whoosh'
  | 'pop'
  | 'tick'
  | 'rise'
  | 'impact'
  | 'boom'
  | 'slam'
  | 'whip'
  | 'cash'
  | 'chime'
  | 'ding'
  | 'sparkle'
  | 'shutter'
  | 'type'
  | 'glitch'
  | 'rewind'
  | 'scratch'
  | 'tension';

export const SFX_KINDS: readonly SfxKind[] = [
  'whoosh',
  'pop',
  'tick',
  'rise',
  'impact',
  'boom',
  'slam',
  'whip',
  'cash',
  'chime',
  'ding',
  'sparkle',
  'shutter',
  'type',
  'glitch',
  'rewind',
  'scratch',
  'tension',
];

export type SfxCategory = 'transition' | 'impact' | 'reward' | 'foley';

export interface SfxCatalogEntry {
  id: SfxKind;
  name: string;
  category: SfxCategory;
  hint: string;
}

/** Curated metadata for UI palettes, timeline labels, and Pip tooltips. */
export const SFX_CATALOG: readonly SfxCatalogEntry[] = [
  { id: 'boom', name: 'Boom', category: 'impact', hint: 'Deep cinematic sub-drop for big numbers' },
  { id: 'slam', name: 'Slam', category: 'impact', hint: 'Heavy percussive thud for rejections & finality' },
  { id: 'impact', name: 'Impact', category: 'impact', hint: 'Punchy low-end accent hit' },
  { id: 'tension', name: 'Tension', category: 'impact', hint: 'Dark ominous swell for stakes & suspense' },
  { id: 'rise', name: 'Rise', category: 'transition', hint: 'Sweeping riser leading into a reveal' },
  { id: 'whip', name: 'Whip', category: 'transition', hint: 'Fast snappy whip-pan swish for pivots' },
  { id: 'whoosh', name: 'Whoosh', category: 'transition', hint: 'Airy swoosh for smooth scene shifts' },
  { id: 'rewind', name: 'Rewind', category: 'transition', hint: 'Tape-rewind zip for flashbacks & reframes' },
  { id: 'glitch', name: 'Glitch', category: 'transition', hint: 'Digital stutter zap for tech twists & errors' },
  { id: 'cash', name: 'Cash', category: 'reward', hint: 'Metallic cha-ching for money, revenue & prices' },
  { id: 'chime', name: 'Chime', category: 'reward', hint: 'Warm harmonic chime for wins, logos & insights' },
  { id: 'sparkle', name: 'Sparkle', category: 'reward', hint: 'Crystalline shimmer for breakthroughs & magic' },
  { id: 'ding', name: 'Ding', category: 'reward', hint: 'Crisp bright bell for key takeaways & tips' },
  { id: 'shutter', name: 'Shutter', category: 'foley', hint: 'Camera shutter click-clack for proof & photos' },
  { id: 'type', name: 'Type', category: 'foley', hint: 'Mechanical keyboard clacks for text & code' },
  { id: 'scratch', name: 'Scratch', category: 'foley', hint: 'Vinyl record scratch for plot twists & halts' },
  { id: 'pop', name: 'Pop', category: 'foley', hint: 'Light UI pop for callouts & badges' },
  { id: 'tick', name: 'Tick', category: 'foley', hint: 'Crisp mechanical tick for list items' },
];

export const SFX_LABEL: Readonly<Record<SfxKind, string>> = Object.fromEntries(
  SFX_CATALOG.map((e) => [e.id, e.name]),
) as Record<SfxKind, string>;

/** Takes per kind ("Shuffle takes" and placement pick among them). */
export const SFX_TAKES: Readonly<Record<SfxKind, number>> = {
  whoosh: 3,
  pop: 3,
  tick: 3,
  rise: 2,
  impact: 3,
  boom: 3,
  slam: 3,
  whip: 3,
  cash: 3,
  chime: 3,
  ding: 3,
  sparkle: 2,
  shutter: 2,
  type: 3,
  glitch: 3,
  rewind: 2,
  scratch: 2,
  tension: 2,
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

/** Length and peak position of one take. */
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
    case 'boom':
      return { lengthMs: 1150, peakMs: 14 };
    case 'slam':
      return { lengthMs: 420, peakMs: 6 };
    case 'whip':
      return { lengthMs: 220, peakMs: 110 };
    case 'cash':
      return { lengthMs: 560, peakMs: 90 };
    case 'chime':
      return { lengthMs: 620, peakMs: 12 };
    case 'ding':
      return { lengthMs: 480, peakMs: 8 };
    case 'sparkle':
      return { lengthMs: 640, peakMs: 220 };
    case 'shutter':
      return { lengthMs: 150, peakMs: 18 };
    case 'type':
      return { lengthMs: 340, peakMs: 140 };
    case 'glitch':
      return { lengthMs: 260, peakMs: 45 };
    case 'rewind':
      return { lengthMs: 380, peakMs: 310 };
    case 'scratch':
      return { lengthMs: 340, peakMs: 130 };
    case 'tension':
      return { lengthMs: 1100, peakMs: 980 };
  }
}

/** A generator of white noise in [-1, 1) for one kind and take. */
const noiseFor = (kind: SfxKind, take: number) => {
  const r = mulberry32(hashString(`sfx:${kind}:${take}`));
  return () => r() * 2 - 1;
};

/**
 * A decaying sine "thump" whose pitch drops from `startMul × hz` to `hz`, with its crest placed
 * at `attackS`. Short and enveloped, so it reads as a body, not a tone.
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
  startOffsetS = 0,
): void {
  const phase = (t: number) =>
    2 * Math.PI * hz * (t + (startMul - 1) * dropS * (1 - Math.exp(-t / dropS)));
  const offset = Math.PI / 2 - phase(attackS);
  const startIdx = Math.max(0, Math.round(startOffsetS * sr));
  for (let i = startIdx; i < out.length; i++) {
    const t = (i - startIdx) / sr;
    const env =
      t < attackS ? Math.sin((Math.PI / 2) * (t / attackS)) : Math.exp(-(t - attackS) / decayS);
    if (env < 1e-5) break;
    out[i] = (out[i] ?? 0) + gain * env * Math.sin(phase(t) + offset);
  }
}

/** Adds an exponentially decaying harmonic partial starting at `startS` seconds. */
function partial(
  out: Float32Array,
  sr: number,
  startS: number,
  hz: number,
  attackS: number,
  decayS: number,
  gain: number,
  phaseOffset = 0,
): void {
  const startIdx = Math.max(0, Math.round(startS * sr));
  const twoPiF = 2 * Math.PI * hz;
  for (let i = startIdx; i < out.length; i++) {
    const t = (i - startIdx) / sr;
    const env =
      t < attackS ? Math.sin((Math.PI / 2) * (t / Math.max(attackS, 1e-5))) : Math.exp(-(t - attackS) / decayS);
    if (t >= attackS && env < 1e-4) break;
    out[i] = (out[i] ?? 0) + gain * env * Math.sin(twoPiF * t + phaseOffset);
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
  const accent = 0.012 * sr;
  for (let i = 0; i < n; i++) {
    const w = noise();
    const hz =
      i <= peakAt
        ? logLerp(startHz, topHz, smoothstep(i / peakAt))
        : logLerp(topHz, endHz, smoothstep((i - peakAt) / (n - 1 - peakAt)));
    tune(bp, 'bandpass', hz, 1.1, sr);
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

/** Deep cinematic sub-drop boom: crisp impact transient + sweeping 115→38 Hz sub + dark cavern tail. */
function boom(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('boom', k);
  const tailLp = biquad();
  const crackBp = biquad();
  tune(crackBp, 'bandpass', pick([1400, 1750, 2100], k), 1.4, sr);

  const subHz = pick([36, 40, 44], k);
  // Deep sub glide: starts ~3x higher and drops smoothly into chesty sub bass.
  thump(out, sr, subHz, 3.1, 0.14, 0.014, 0.38, 1.0);
  // Warm second harmonic saturation body.
  thump(out, sr, subHz * 2.01, 2.2, 0.07, 0.014, 0.18, 0.36);

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = noise();
    // Tight punchy attack crack right around 14 ms.
    const crackEnv = t < 0.04 ? Math.exp(-Math.pow((t - 0.014) / 0.007, 2)) : 0;
    const crack = 0.38 * crackEnv * step(crackBp, w);
    // Dark cavernous reverb-like rumble tail sweeping down from 900 Hz to 140 Hz.
    tune(tailLp, 'lowpass', logLerp(950, 140, Math.min(1, t / 0.95)), 0.85, sr);
    const rumbleEnv = (1 - Math.exp(-t / 0.025)) * Math.exp(-t / 0.34);
    const rumble = 0.32 * rumbleEnv * step(tailLp, w);
    out[i] = Math.tanh((out[i] ?? 0) * 1.15 + crack + rumble);
  }
  return out;
}

/** Heavy percussive slam / gavel thud: woody crack transient + tight chest thud + metallic ring. */
function slam(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('slam', k);
  const slapBp = biquad();
  const roomLp = biquad();
  tune(slapBp, 'bandpass', pick([1850, 2250, 2600], k), 1.8, sr);
  tune(roomLp, 'lowpass', 620, 0.75, sr);

  thump(out, sr, pick([58, 64, 72], k), 2.8, 0.025, 0.006, 0.065, 0.95);
  // Woody/metallic modal resonances.
  partial(out, sr, 0.002, pick([245, 278, 312], k), 0.003, 0.045, 0.42);
  partial(out, sr, 0.002, pick([610, 690, 740], k), 0.002, 0.024, 0.25);

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = noise();
    const slapEnv = Math.exp(-Math.pow((t - 0.006) / 0.0045, 2));
    const roomEnv = (1 - Math.exp(-t / 0.008)) * Math.exp(-t / 0.085);
    out[i] = Math.tanh(
      ((out[i] ?? 0) + 0.55 * slapEnv * step(slapBp, w) + 0.34 * roomEnv * step(roomLp, w)) * 1.3,
    );
  }
  return out;
}

/** Fast high-velocity whip-pan swish: razor-tight sweep + air snap at the midpoint. */
function whip(k: number, sr: number, n: number, peakAt: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('whip', k);
  const bp = biquad();
  const snapHp = biquad();
  const carrier = softCarrier();
  const startHz = pick([520, 620, 720], k);
  const topHz = pick([4400, 5100, 5800], k);
  const endHz = pick([950, 1150, 1300], k);
  tune(snapHp, 'highpass', 2400, 0.8, sr);

  for (let i = 0; i < n; i++) {
    const w = noise();
    const u = i <= peakAt ? i / peakAt : (i - peakAt) / Math.max(1, n - 1 - peakAt);
    const hz =
      i <= peakAt
        ? logLerp(startHz, topHz, Math.pow(u, 1.5))
        : logLerp(topHz, endHz, Math.pow(u, 0.75));
    tune(bp, 'bandpass', hz, 2.4, sr);
    const env =
      i <= peakAt
        ? Math.pow(Math.max(0, Math.sin((Math.PI * 0.5 * i) / peakAt)), 2.1)
        : Math.pow(Math.max(0, Math.cos((Math.PI * 0.5 * (i - peakAt)) / Math.max(1, n - 1 - peakAt))), 2.2);
    const snap = Math.exp(-Math.pow((i - peakAt) / (0.006 * sr), 2));
    out[i] = env * (0.8 * carrier(step(bp, w), sr) + 0.35 * snap * step(snapHp, w));
  }
  return out;
}

/** Metallic cash register cha-ching: rapid coin-drawer clinks followed by shimmering brass bell. */
function cash(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('cash', k);
  const clinkBp = biquad();
  const pitchMul = pick([0.96, 1.0, 1.06], k);
  tune(clinkBp, 'bandpass', 5200 * pitchMul, 3.2, sr);

  // 1. Drawer latch + 3 staggered metallic coin pings before the bell (0..78 ms).
  const coinTimes = [0.005, 0.032, 0.058];
  const coinBase = [2850, 3420, 4180];
  coinTimes.forEach((t0, idx) => {
    const f = (coinBase[idx] ?? 3200) * pitchMul;
    partial(out, sr, t0, f, 0.0015, 0.028, 0.24);
    partial(out, sr, t0, f * 1.47, 0.0015, 0.018, 0.16);
  });

  // 2. Classic bright brass cash-register bell strike at 86 ms (peak at 90 ms).
  const bellStart = 0.086;
  const bellF = 2349.3 * pitchMul; // D7-ish crisp register bell
  partial(out, sr, bellStart, bellF, 0.004, 0.17, 0.72);
  partial(out, sr, bellStart, bellF * 1.503, 0.003, 0.12, 0.34);
  partial(out, sr, bellStart, bellF * 2.02, 0.002, 0.095, 0.28);
  partial(out, sr, bellStart, bellF * 2.756, 0.002, 0.065, 0.18);
  // Subtle lower warm brass body so it never sounds thin.
  partial(out, sr, bellStart, bellF * 0.5, 0.004, 0.14, 0.22);

  // Crisp mechanical drawer slide noise during the coin phase.
  for (let i = 0; i < Math.min(n, msToSamples(110, sr)); i++) {
    const t = i / sr;
    const env = Math.sin(Math.PI * Math.min(1, t / 0.085)) * 0.18;
    out[i] = (out[i] ?? 0) + env * step(clinkBp, noise());
  }
  return out;
}

/** Warm harmonic marimba/glass chime: two-note ascending fifth with velvety overtones. */
function chime(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const root = pick([523.25, 587.33, 659.25], k); // C5, D5, E5
  // First warm mallet note at 0 ms (peak at 12 ms).
  partial(out, sr, 0.004, root, 0.008, 0.16, 0.75);
  partial(out, sr, 0.004, root * 2, 0.006, 0.09, 0.28);
  partial(out, sr, 0.004, root * 3.98, 0.004, 0.045, 0.12);
  // Second bright ascending fifth at 95 ms.
  const fifth = root * 1.498;
  partial(out, sr, 0.095, fifth, 0.009, 0.21, 0.62);
  partial(out, sr, 0.095, fifth * 2, 0.007, 0.13, 0.24);
  partial(out, sr, 0.095, fifth * 3.01, 0.005, 0.07, 0.1);
  return out;
}

/** Crisp bright notification / lightbulb ding: clean bell modes + gentle mallet attack. */
function ding(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('ding', k);
  const bp = biquad();
  const base = pick([1046.5, 1174.66, 1318.51], k); // C6, D6, E6
  tune(bp, 'bandpass', base * 2.5, 3, sr);

  partial(out, sr, 0.002, base, 0.006, 0.15, 0.85);
  partial(out, sr, 0.002, base * 2.0, 0.004, 0.085, 0.28);
  partial(out, sr, 0.002, base * 2.756, 0.003, 0.05, 0.16);
  partial(out, sr, 0.002, base * 4.07, 0.002, 0.025, 0.08);

  const atk = msToSamples(12, sr);
  for (let i = 0; i < Math.min(n, atk); i++) {
    const t = i / sr;
    out[i] = (out[i] ?? 0) + 0.16 * Math.exp(-t / 0.003) * step(bp, noise());
  }
  return out;
}

/** Crystalline upward magic shimmer arpeggio + airy sheen. */
function sparkle(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('sparkle', k);
  const hp = biquad();
  tune(hp, 'bandpass', 6200, 1.8, sr);

  const notes =
    k === 0
      ? [1046.5, 1318.5, 1568.0, 2093.0, 2637.0] // C major pentatonic cascade
      : [1174.7, 1480.0, 1760.0, 2349.3, 2960.0]; // D major pentatonic cascade
  notes.forEach((f, idx) => {
    const t0 = 0.02 + idx * 0.05; // 20, 70, 120, 170, 220 ms (peaks on final shimmer note)
    const gain = 0.28 + idx * 0.11;
    partial(out, sr, t0, f, 0.005, 0.13 + idx * 0.025, gain);
    partial(out, sr, t0, f * 2.01, 0.004, 0.08, gain * 0.35);
    partial(out, sr, t0, f * 3.0, 0.003, 0.04, gain * 0.14);
  });

  // Gentle airy shimmer tail.
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.sin(Math.PI * Math.min(1, t / 0.52)) * Math.exp(-t / 0.28);
    out[i] = (out[i] ?? 0) + 0.09 * env * step(hp, noise());
  }
  return out;
}

/** Authentic mechanical SLR camera shutter: mirror slap + curtain close double-click. */
function shutter(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('shutter', k);
  const bp1 = biquad();
  const bp2 = biquad();
  const hp = biquad();
  tune(bp1, 'bandpass', pick([2900, 3400], k), 2.5, sr);
  tune(bp2, 'bandpass', pick([1450, 1700], k), 3.2, sr);
  tune(hp, 'highpass', 3800, 0.9, sr);

  const clickAt = [0.018, 0.072 + k * 0.008]; // first mirror slap (peak at 18 ms), second curtain return
  const clickGain = [1.0, 0.68];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = noise();
    let e = 0;
    for (let c = 0; c < clickAt.length; c++) {
      const dt = t - (clickAt[c] ?? 0);
      if (dt >= -0.002 && dt < 0.04) {
        const g = clickGain[c] ?? 0.5;
        const burst = dt < 0 ? Math.exp(-Math.pow(dt / 0.001, 2)) : Math.exp(-dt / 0.0055);
        e += g * burst;
      }
    }
    const sig = 0.55 * step(bp1, w) + 0.35 * step(bp2, w) + 0.35 * step(hp, w);
    out[i] = e * sig;
  }
  // Tiny mechanical body thock under both clicks.
  thump(out, sr, 210, 1.6, 0.005, 0.002, 0.009, 0.38, 0.016);
  thump(out, sr, 185, 1.5, 0.005, 0.002, 0.009, 0.25, 0.07 + k * 0.008);
  return out;
}

/** Mechanical keyboard clack burst: 5 staggered tactile keystrokes with switch click + keycap thock. */
function typeSfx(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('type', k);
  const clickBp = biquad();
  const thockBp = biquad();
  tune(clickBp, 'bandpass', 3900, 3.0, sr);
  tune(thockBp, 'bandpass', 880, 2.2, sr);

  const patterns = [
    [0.012, 0.078, 0.14, 0.205, 0.268],
    [0.01, 0.068, 0.14, 0.198, 0.275],
    [0.015, 0.082, 0.14, 0.215, 0.272],
  ] as const;
  const times = pick(patterns, k);
  const gains = [0.68, 0.82, 1.0, 0.78, 0.88]; // 3rd strike at 140 ms is the anchor peak

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = noise();
    let envClick = 0;
    let envThock = 0;
    for (let j = 0; j < times.length; j++) {
      const dt = t - (times[j] ?? 0);
      if (dt >= 0 && dt < 0.045) {
        const g = gains[j] ?? 0.75;
        envClick += g * Math.exp(-dt / 0.0032);
        envThock += g * Math.exp(-dt / 0.011);
      }
    }
    out[i] = 0.72 * envClick * step(clickBp, w) + 0.55 * envThock * step(thockBp, w);
  }
  times.forEach((t0, j) => {
    thump(out, sr, 240 + (j % 3) * 32, 1.5, 0.004, 0.002, 0.008, 0.28 * (gains[j] ?? 0.8), t0);
  });
  return out;
}

/** Digital glitch / stutter zap: sample-and-hold stepped FM + rapid data gate chops. */
function glitch(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('glitch', k);
  const bp = biquad();
  tune(bp, 'bandpass', pick([2400, 3100, 3800], k), 2.0, sr);

  const stepSamples = Math.max(4, Math.round(sr / pick([1100, 1450, 1800], k)));
  let held = 0;
  let phase = 0;
  const baseHz = pick([180, 230, 310], k);

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const u = i / Math.max(1, n - 1);
    // Rapid stutter gating (3–4 crisp slices, loudest around 45 ms).
    const gate = Math.sin(2 * Math.PI * (18 + k * 5) * t) > -0.25 ? 1 : 0.12;
    const env = Math.sin(Math.PI * Math.pow(u, 0.65)) * gate;
    // Stepped frequency jumps for authentic digital artifact character.
    const jump = Math.floor(t * 28) % 3 === 0 ? 3.4 : Math.floor(t * 28) % 2 === 0 ? 1.8 : 0.9;
    phase += (2 * Math.PI * baseHz * jump) / sr;
    const raw = Math.sign(Math.sin(phase + 2.2 * Math.sin(phase * 2.7))) * 0.65 + 0.45 * step(bp, noise());
    if (i % stepSamples === 0) held = raw;
    out[i] = env * (0.65 * held + 0.35 * raw);
  }
  return out;
}

/** Tape-rewind / reverse-zip: rising spool pitch whirr + reverse-enveloped air rush snapping shut. */
function rewind(k: number, sr: number, n: number, peakAt: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('rewind', k);
  const bp = biquad();
  const carrier = softCarrier();
  const startHz = pick([260, 320], k);
  const endHz = pick([2400, 2900], k);
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const w = noise();
    const u = Math.min(1, i / Math.max(1, peakAt));
    const freq = logLerp(startHz, endHz, Math.pow(u, 1.45));
    phase += (2 * Math.PI * freq) / sr;
    tune(bp, 'bandpass', freq * 1.4, 2.2, sr);

    const env =
      i <= peakAt
        ? Math.pow(u, 1.7)
        : Math.max(0, 1 - (i - peakAt) / Math.max(1, n - 1 - peakAt)) * 0.45;
    // Tape flutter harmonic + reverse air sweep.
    const spool = 0.42 * Math.sin(phase) + 0.18 * Math.sin(phase * 2.02);
    const air = 0.68 * carrier(step(bp, w), sr);
    out[i] = env * (spool + air);
  }
  return out;
}

/** Vinyl record scratch / comedic halt: rapid forward-back pitch chirp + vinyl grit. */
function scratch(k: number, sr: number, n: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('scratch', k);
  const bp = biquad();
  const gritHp = biquad();
  tune(gritHp, 'highpass', 3200, 0.8, sr);

  const base = pick([240, 290], k);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const u = i / Math.max(1, n - 1);
    // Classic "wikka-stop" velocity profile: fast forward zip, sharp reverse zip, then halt.
    const vel =
      u < 0.32
        ? 0.6 + 3.4 * Math.sin((Math.PI * u) / 0.32)
        : u < 0.68
          ? -0.5 - 4.2 * Math.sin((Math.PI * (u - 0.32)) / 0.36)
          : (1 - (u - 0.68) / 0.32) * 1.4;
    const instHz = Math.max(70, Math.abs(vel) * base);
    phase += (2 * Math.PI * Math.sign(vel || 1) * instHz) / sr;
    tune(bp, 'bandpass', Math.min(4800, instHz * 1.9), 2.8, sr);
    const env = Math.sin(Math.PI * Math.pow(u, 0.75)) * (0.55 + 0.45 * Math.min(1, Math.abs(vel) / 2.2));
    // Rich saw-ish turntable sample tone + filtered needle grit.
    const tone = Math.tanh(2.1 * (Math.sin(phase) + 0.55 * Math.sin(phase * 2) + 0.32 * Math.sin(phase * 3)));
    const grit = 0.28 * step(bp, noise()) + 0.14 * step(gritHp, noise());
    out[i] = env * (0.68 * tone + grit) * (1 - 0.12 * Math.sin(2 * Math.PI * 35 * t));
  }
  return out;
}

/** Ominous dark cinematic swell: detuned low-brass fifth drone building with metallic shimmer. */
function tension(k: number, sr: number, n: number, peakAt: number): Float32Array {
  const out = new Float32Array(n);
  const noise = noiseFor('tension', k);
  const shimmerBp = biquad();
  const root = pick([55, 61.74], k); // A1 or B1
  const fifth = root * 1.498;
  const minor = root * 2.378; // eerie minor 3rd octave

  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const u = Math.min(1, i / Math.max(1, peakAt));
    const env =
      i <= peakAt
        ? Math.pow(u, 2.0)
        : Math.pow(Math.max(0, 1 - (i - peakAt) / Math.max(1, n - 1 - peakAt)), 1.5);
    const w = noise();
    tune(shimmerBp, 'bandpass', logLerp(320, 2600, u), 3.0, sr);

    const drone =
      0.52 * Math.sin(2 * Math.PI * root * t) +
      0.32 * Math.sin(2 * Math.PI * (root * 1.006) * t) +
      0.26 * Math.sin(2 * Math.PI * fifth * t) +
      0.16 * u * Math.sin(2 * Math.PI * minor * t);
    const breath = 0.38 * step(shimmerBp, w);
    out[i] = env * Math.tanh((drone + breath) * 1.15);
  }
  return out;
}

/**
 * Makes `at` the sample peak: if another sample is louder, the sample at `at` is raised just above
 * it. Keeps `sfxSpec().peakMs` exact for alignment in the mixer.
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
    case 'boom':
      x = boom(k, sampleRate, n);
      break;
    case 'slam':
      x = slam(k, sampleRate, n);
      break;
    case 'whip':
      x = whip(k, sampleRate, n, peakAt);
      break;
    case 'cash':
      x = cash(k, sampleRate, n);
      break;
    case 'chime':
      x = chime(k, sampleRate, n);
      break;
    case 'ding':
      x = ding(k, sampleRate, n);
      break;
    case 'sparkle':
      x = sparkle(k, sampleRate, n);
      break;
    case 'shutter':
      x = shutter(k, sampleRate, n);
      break;
    case 'type':
      x = typeSfx(k, sampleRate, n);
      break;
    case 'glitch':
      x = glitch(k, sampleRate, n);
      break;
    case 'rewind':
      x = rewind(k, sampleRate, n, peakAt);
      break;
    case 'scratch':
      x = scratch(k, sampleRate, n);
      break;
    case 'tension':
      x = tension(k, sampleRate, n, peakAt);
      break;
  }
  const fadeMs = kind === 'rise' ? 1 : kind === 'tick' ? 4 : kind === 'boom' || kind === 'tension' ? 30 : 12;
  tailFade(x, sampleRate, fadeMs, peakAt);
  lockPeak(x, peakAt);
  normalizePeak(x, SFX_PEAK);
  cache.set(key, x);
  return x;
}

/** One synthesized effect: pure, seeded by (kind, take). Returns a fresh copy. */
export function synthSfx(kind: SfxKind, take: number, sampleRate = SFX_SAMPLE_RATE): Float32Array {
  return sfxSamples(kind, take, sampleRate).slice();
}
