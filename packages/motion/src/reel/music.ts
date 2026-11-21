// Reel music (spec 27 R3): the generated soundtrack, kept at full quality (stereo, its own sample
// rate) on its own audio track. Pure PCM helpers shared by the music route (loop to length), the
// editor preview and the export (level + ducking under the voice), so both play the same bytes.
import { dbToGain } from '../sfx/dsp';
import { duckDbAt, duckEnvelope } from '../sfx/duck';
import { rmsDb } from '../sfx/level';
import { fitMusic } from '../sfx/music';

export interface StereoPcm {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

/** Reads a 16-bit PCM WAV (mono or stereo, extra chunks allowed). Null for anything else. */
export function decodeWavStereo16(bytes: Uint8Array): StereoPcm | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let format = 0;
  for (let o = 12; o + 8 <= bytes.length; ) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ' && size >= 16) {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === 'data') {
      if ((format !== 1 && format !== 0xfffe) || bits !== 16 || channels < 1 || sampleRate <= 0)
        return null;
      // Some writers put a placeholder size on the data chunk: read to the end of the bytes.
      const end = size > 0 && body + size <= bytes.length ? body + size : bytes.length;
      const frames = Math.floor((end - body) / (2 * channels));
      const left = new Float32Array(frames);
      const right = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        const at = body + i * 2 * channels;
        const l = v.getInt16(at, true) / 32768;
        left[i] = l;
        right[i] = channels > 1 ? v.getInt16(at + 2, true) / 32768 : l;
      }
      return { left, right, sampleRate };
    }
    o = body + size + (size % 2);
  }
  return null;
}

/** A 16-bit stereo PCM WAV. */
export function encodeWavStereo16(pcm: StereoPcm): Uint8Array<ArrayBuffer> {
  const n = Math.min(pcm.left.length, pcm.right.length);
  const bytes = new Uint8Array(44 + n * 4);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i);
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, pcm.sampleRate, true);
  v.setUint32(28, pcm.sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  const q = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, q(pcm.left[i]!), true);
    v.setInt16(46 + i * 4, q(pcm.right[i]!), true);
  }
  return bytes;
}

/** Loudness every stored reel music file is brought to (RMS, dBFS). */
export const REEL_MUSIC_RMS_DB = -20;

/**
 * Turns a generated clip into the reel's music: drops the clip's soft head and fading tail,
 * loops it to `durationMs` with a long equal-power crossfade, fades in and out, and brings it to
 * `REEL_MUSIC_RMS_DB`. Exact length: `round(durationMs × sampleRate / 1000)` frames.
 */
export function loopReelMusic(clip: StereoPcm, durationMs: number): StereoPcm {
  const sr = clip.sampleRate;
  const n = clip.left.length;
  const head = Math.min(Math.round(0.4 * sr), Math.floor(n / 8));
  const tail = Math.min(Math.round(1.6 * sr), Math.floor(n / 6));
  const body = (ch: Float32Array) => ch.subarray(head, Math.max(head + 1, n - tail));
  const opts = { crossfadeMs: 2000, fadeInMs: 600, fadeOutMs: 1800 };
  const left = fitMusic(body(clip.left), durationMs, sr, opts);
  const right = fitMusic(body(clip.right), durationMs, sr, opts);
  const level = (rmsDb(left) + rmsDb(right)) / 2;
  const g = Number.isFinite(level) ? dbToGain(REEL_MUSIC_RMS_DB - level) : 1;
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    left[i]! *= g;
    right[i]! *= g;
    peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!));
  }
  // Never clip: pull the whole track down if a hit would exceed −1 dBFS.
  if (peak > 0.89) {
    const k = 0.89 / peak;
    for (let i = 0; i < left.length; i++) {
      left[i]! *= k;
      right[i]! *= k;
    }
  }
  return { left, right, sampleRate: sr };
}

export interface ReelMusicMix {
  /** The voice's measured level (dBFS): the music sits `gainDb` under it. */
  voiceLevelDb: number;
  words: ReadonlyArray<{ startMs: number; endMs: number }>;
  /** Music level relative to the voice before ducking (default −14 dB). */
  gainDb?: number;
  /** How far it dips while the speaker talks (default 9 dB). */
  duckDepthDb?: number;
}

/**
 * The music as it plays in the reel: at a fixed distance under the voice and ducked further
 * while the speaker talks (rising in pauses). Same length as the input.
 */
export function mixReelMusic(music: StereoPcm, o: ReelMusicMix): StereoPcm {
  const sr = music.sampleRate;
  const n = music.left.length;
  const durationMs = Math.round((n * 1000) / sr);
  const depth = o.duckDepthDb ?? 9;
  const env = duckEnvelope(o.words, durationMs, { depthDb: depth });
  const base = o.voiceLevelDb + (o.gainDb ?? -14) - REEL_MUSIC_RMS_DB;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  // The envelope changes slowly: one gain per millisecond is plenty.
  const step = Math.max(1, Math.round(sr / 1000));
  for (let i = 0; i < n; i += step) {
    const g = dbToGain(base + duckDbAt(env, (i * 1000) / sr));
    const end = Math.min(n, i + step);
    for (let j = i; j < end; j++) {
      left[j] = music.left[j]! * g;
      right[j] = music.right[j]! * g;
    }
  }
  return { left, right, sampleRate: sr };
}
