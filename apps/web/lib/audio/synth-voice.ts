import { rngFor } from '@motionpop/motion';

/**
 * A procedural stand-in voice for the demo project (spec 04): one voiced, band-passed burst
 * per word, shaped by an attack/decay envelope with a syllable wobble. Deterministic for a
 * given seed, pure (no Web Audio), so it runs in tests, workers and the main thread alike.
 * It is not speech; it only makes the waveform, karaoke and playback line up with the words.
 */

export interface SynthWord {
  startMs: number;
  endMs: number;
  text: string;
}

export const SYNTH_SAMPLE_RATE = 22_050;

export function synthVoice(
  words: ReadonlyArray<SynthWord>,
  durationMs: number,
  seed = 1,
  sampleRate = SYNTH_SAMPLE_RATE,
): Float32Array {
  const out = new Float32Array(Math.ceil((durationMs * sampleRate) / 1000));
  const rand = rngFor(seed, 'synth-voice');
  for (const w of words) {
    const start = Math.floor((w.startMs * sampleRate) / 1000);
    const end = Math.min(out.length, Math.floor((w.endMs * sampleRate) / 1000));
    const len = end - start;
    if (len <= 0) continue;
    const syllables = Math.max(1, Math.round(w.text.replace(/[^a-z0-9]/gi, '').length / 3));
    const pitch = 110 + rand() * 60; // Hz, a speaking fundamental
    const loud = 0.45 + rand() * 0.35;
    const attack = Math.min(len, Math.floor(0.03 * sampleRate));
    // Two-pole resonator around a vowel-ish formant.
    const formant = 500 + rand() * 900;
    const r = 0.97;
    const theta = (2 * Math.PI * formant) / sampleRate;
    const a1 = 2 * r * Math.cos(theta);
    const a2 = -r * r;
    let y1 = 0;
    let y2 = 0;
    let phase = 0;
    // Per-syllable loudness, so bars vary like speech rather than forming solid blocks.
    const accents = Array.from({ length: syllables * 3 }, () => 0.35 + rand() * 0.65);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const accent = accents[Math.min(accents.length - 1, Math.floor(t * accents.length))] ?? 1;
      const env =
        (i < attack ? i / attack : 1) *
        Math.pow(1 - t, 0.5) *
        accent *
        Math.pow(Math.abs(Math.sin(Math.PI * syllables * t)), 1.4);
      phase += pitch / sampleRate;
      const buzz = phase % 1 < 0.08 ? 1 : 0; // glottal-ish pulse train
      const x = buzz * 0.6 + (rand() * 2 - 1) * 0.35;
      const y = (1 - r) * x + a1 * y1 + a2 * y2;
      y2 = y1;
      y1 = y;
      out[start + i] = Math.max(-1, Math.min(1, (out[start + i] ?? 0) + y * env * loud * 5));
    }
  }
  return out;
}

// Moved to ./wav (spec 05); re-exported for existing imports.
export { encodeWav } from './wav';
