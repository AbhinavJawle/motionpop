import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { rmsDb } from '../sfx/level';
import {
  decodeWavStereo16,
  encodeWavStereo16,
  loopReelMusic,
  mixReelMusic,
  REEL_MUSIC_RMS_DB,
} from './music';

const tone = (seconds: number, sr = 8000) => {
  const n = Math.round(seconds * sr);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    left[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sr);
    right[i] = 0.4 * Math.sin((2 * Math.PI * 330 * i) / sr);
  }
  return { left, right, sampleRate: sr };
};

describe('reel music (spec 27 R3)', () => {
  it('round-trips a stereo WAV', () => {
    const pcm = tone(0.5);
    const back = decodeWavStereo16(encodeWavStereo16(pcm))!;
    expect(back.sampleRate).toBe(8000);
    expect(back.left.length).toBe(pcm.left.length);
    expect(Math.abs(back.right[100]! - pcm.right[100]!)).toBeLessThan(1e-3);
  });

  it('loops to the exact length at the stored loudness, never clipping', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 30_000 }), (ms) => {
        const out = loopReelMusic(tone(6), ms);
        expect(out.left.length).toBe(Math.round((ms * 8000) / 1000));
        let peak = 0;
        for (let i = 0; i < out.left.length; i++)
          peak = Math.max(peak, Math.abs(out.left[i]!), Math.abs(out.right[i]!));
        expect(peak).toBeLessThanOrEqual(0.8901);
      }),
      { numRuns: 25 },
    );
    const long = loopReelMusic(tone(6), 20_000);
    // The fades pull the average down a little; the body sits at the target.
    expect(Math.abs(rmsDb(long.left, 8000, 150_000) - REEL_MUSIC_RMS_DB)).toBeLessThan(2);
  });

  it('ducks under speech and rises in pauses', () => {
    const music = loopReelMusic(tone(6), 10_000);
    const mixed = mixReelMusic(music, {
      voiceLevelDb: -20,
      words: [{ startMs: 1000, endMs: 5000 }],
    });
    const at = (ms: number) => rmsDb(mixed.left, (ms * 8000) / 1000, ((ms + 400) * 8000) / 1000);
    expect(at(3000)).toBeLessThan(at(7500) - 6);
  });
});
