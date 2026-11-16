import { hashString } from '../core/rng';
import { SFX_SAMPLE_RATE, dbToGain, gainToDb, msToSamples, peakOf } from './dsp';
import { duckDbAt } from './duck';
import { shortTermLevelDb } from './level';
import { limit } from './limiter';
import { sfxSamples, sfxSpec, type SfxKind } from './synth';

/**
 * The bed mix (spec 12 design §7, D-067 #1–2): music with its ducking plus every placed effect,
 * in one 24 kHz mono buffer, limited to a −1 dBFS sample peak. Pure: equal inputs give equal
 * samples, so the preview and the export play the same bytes.
 */

/** Effect level offsets by kind, in dB (design §7). */
export const SFX_KIND_OFFSET_DB: Readonly<Record<SfxKind, number>> = {
  pop: 0,
  whoosh: -3,
  tick: -8,
  rise: -4,
  impact: 0,
};
/** Effects sit this far under the voice before the user's level and the kind offset (R8.2). */
export const SFX_UNDER_VOICE_DB = 6;
/** Used when the voice level is unknown or not finite. */
export const DEFAULT_VOICE_LEVEL_DB = -20;
/** The reported peak of a silent bed (JSON-safe, unlike -Infinity). */
export const BED_SILENT_PEAK_DB = -120;

export interface BedSfx {
  kind: SfxKind;
  take: number;
  /** Where the effect's peak lands. */
  atMs: number;
  /** Per-placement offset (ticks are −6 dB). */
  gainDb: number;
}

export interface BedInput {
  durationMs: number;
  sampleRate: 24000;
  /** Measured once per voiceover (`voiceLevelDb`, D-067 #11). */
  voiceLevelDb: number;
  /** Music already looped or trimmed to the video, with its fades; `levelDb` = its measured RMS. */
  music: { samples: Float32Array; levelDb: number } | null;
  musicGainDb: number;
  ducking: boolean;
  /** Informational: the depth is already in `envelope` (built by `duckEnvelope` with it). */
  duckDepthDb: number;
  /** `duckEnvelope(...)` at 100 Hz in dB; ignored when `ducking` is off. */
  envelope: Float32Array | null;
  sfx: readonly BedSfx[];
  sfxGainDb: number;
}

export interface BedMix {
  samples: Float32Array;
  /** Sample peak in dBFS after the limiter (≤ −1), `BED_SILENT_PEAK_DB` for silence. */
  peakDb: number;
}

const effectLevel = new Map<string, number>();
/** The measured short-term level of one take (cached; the takes are fixed). */
function effectLevelDb(kind: SfxKind, take: number): number {
  const key = `${kind}:${take}`;
  let v = effectLevel.get(key);
  if (v === undefined) {
    v = shortTermLevelDb(sfxSamples(kind, take, SFX_SAMPLE_RATE), SFX_SAMPLE_RATE);
    effectLevel.set(key, v);
  }
  return v;
}

const finite = (x: number, d: number) => (Number.isFinite(x) ? x : d);

export function mixBed(i: BedInput): BedMix {
  const sr = SFX_SAMPLE_RATE;
  const n = Math.max(0, msToSamples(i.durationMs, sr));
  const bus = new Float32Array(n);
  const voice = finite(i.voiceLevelDb, DEFAULT_VOICE_LEVEL_DB);

  if (i.music && i.music.samples.length > 0) {
    const m = i.music.samples;
    const base = voice + finite(i.musicGainDb, 0) - finite(i.music.levelDb, voice);
    const env = i.ducking ? i.envelope : null;
    const len = Math.min(n, m.length);
    if (env && env.length > 0) {
      // The envelope changes slowly (10 ms frames); one gain per 1 ms is smooth and cheap.
      const block = msToSamples(1, sr);
      for (let a = 0; a < len; a += block) {
        const g = dbToGain(base + duckDbAt(env, (a * 1000) / sr));
        const b = Math.min(len, a + block);
        for (let k = a; k < b; k++) bus[k] = (m[k] ?? 0) * g;
      }
    } else {
      const g = dbToGain(base);
      for (let k = 0; k < len; k++) bus[k] = (m[k] ?? 0) * g;
    }
  }

  for (const s of i.sfx) {
    const x = sfxSamples(s.kind, s.take, sr);
    const spec = sfxSpec(s.kind, s.take);
    const levelDb =
      voice -
      SFX_UNDER_VOICE_DB +
      finite(i.sfxGainDb, 0) +
      finite(s.gainDb, 0) +
      SFX_KIND_OFFSET_DB[s.kind];
    const g = dbToGain(levelDb - effectLevelDb(s.kind, s.take));
    const start = msToSamples(finite(s.atMs, 0) - spec.peakMs, sr);
    const a = Math.max(0, -start);
    const b = Math.min(x.length, n - start);
    for (let k = a; k < b; k++) bus[start + k] = (bus[start + k] ?? 0) + (x[k] ?? 0) * g;
  }

  const samples = limit(bus, sr);
  const peak = peakOf(samples);
  return { samples, peakDb: peak > 0 ? gainToDb(peak) : BED_SILENT_PEAK_DB };
}

/** What identifies a bed: everything `mixBed` reads, with music by reference instead of samples. */
export interface BedKeyInput {
  durationMs: number;
  /** The active voiceover ref (`voiceover.src`); the Voice panel's cleanup toggle changes it. */
  voiceSrc: string;
  voiceLevelDb: number;
  /** The music by id and, for `own`, its AudioStore ref; null = no music. */
  music: { id: string; src?: string | undefined } | null;
  musicGainDb: number;
  ducking: boolean;
  duckDepthDb: number;
  envelope: Float32Array | null;
  sfx: readonly BedSfx[];
  sfxGainDb: number;
}

/** Bumped when the DSP changes, so cached and uploaded beds are not reused across versions. */
export const BED_VERSION = 1;

const hex = (h: number) => (h >>> 0).toString(16).padStart(8, '0');

/** A digest of a Float32Array's exact values. */
function digest(x: Float32Array | null): string {
  if (!x) return 'none';
  const bytes = new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ x.length;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    h1 = Math.imul(h1 ^ b, 0x01000193);
    h2 = Math.imul(h2 ^ b, 0x5bd1e995) ^ (h2 >>> 15);
  }
  return `${x.length}:${hex(h1)}${hex(h2)}`;
}

/**
 * A stable 16-hex-character key of every bed input (the cache and Storage name of the bed,
 * `bed/{key}.wav`). The ducking settings only count while ducking is on with music.
 */
export function bedKey(i: BedKeyInput): string {
  const ducked = i.ducking && i.music !== null;
  const canon = JSON.stringify([
    `bed-v${BED_VERSION}`,
    SFX_SAMPLE_RATE,
    Math.round(i.durationMs),
    i.voiceSrc,
    finite(i.voiceLevelDb, DEFAULT_VOICE_LEVEL_DB),
    i.music ? [i.music.id, i.music.src ?? null] : null,
    i.music ? i.musicGainDb : null,
    ducked,
    ducked ? i.duckDepthDb : null,
    ducked ? digest(i.envelope) : null,
    i.sfx.map((s) => [s.kind, s.take, s.atMs, s.gainDb]),
    i.sfx.length > 0 ? i.sfxGainDb : null,
  ]);
  return hex(hashString(canon)) + hex(hashString(`motionpop:${canon}`));
}
