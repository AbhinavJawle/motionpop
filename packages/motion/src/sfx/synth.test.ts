import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SFX_SAMPLE_RATE, argPeak, gainToDb, msToSamples, peakOf } from './dsp';
import { SFX_KINDS, SFX_TAKES, sfxSpec, synthSfx, type SfxKind } from './synth';
import { encodeWav16 } from './wav';

// Design §5 table: peak positions in ms (whoosh ~55 % of its length, rise at its end).
const TABLE_PEAK_MS: Record<SfxKind, (lengthMs: number) => number> = {
  whoosh: (l) => 0.55 * l,
  pop: () => 6,
  tick: () => 1,
  rise: (l) => l,
  impact: () => 8,
};
const TABLE_LENGTH_MS: Record<SfxKind, [number, number]> = {
  whoosh: [420, 520],
  pop: [90, 90],
  tick: [25, 25],
  rise: [900, 900],
  impact: [450, 450],
};

const all = SFX_KINDS.flatMap((kind) =>
  Array.from({ length: SFX_TAKES[kind] }, (_, take) => [kind, take] as const),
);

describe('synthSfx', () => {
  it('has at least 2 takes per kind', () => {
    for (const k of SFX_KINDS) expect(SFX_TAKES[k]).toBeGreaterThanOrEqual(2);
  });

  it.each(all)(
    '%s take %i: finite, exact length, peak <= -1 dBFS, peak where the table says',
    (kind, take) => {
      const x = synthSfx(kind, take);
      const spec = sfxSpec(kind, take);
      expect(x.length).toBe(msToSamples(spec.lengthMs, SFX_SAMPLE_RATE));
      const [lo, hi] = TABLE_LENGTH_MS[kind];
      expect(spec.lengthMs).toBeGreaterThanOrEqual(lo);
      expect(spec.lengthMs).toBeLessThanOrEqual(hi);
      expect(x.every(Number.isFinite)).toBe(true);
      expect(gainToDb(peakOf(x))).toBeLessThanOrEqual(-1);
      expect(peakOf(x)).toBeGreaterThan(0.1);
      const peakMs = (argPeak(x) * 1000) / SFX_SAMPLE_RATE;
      expect(Math.abs(peakMs - TABLE_PEAK_MS[kind](spec.lengthMs))).toBeLessThanOrEqual(2);
      // Ends at silence (no click when the effect stops).
      expect(Math.abs(x[x.length - 1] ?? 1)).toBeLessThan(0.02);
    },
  );

  it('takes of the same kind differ', () => {
    for (const kind of SFX_KINDS) {
      const a = synthSfx(kind, 0);
      const b = synthSfx(kind, 1);
      expect(a.length === b.length && a.every((v, i) => v === b[i])).toBe(false);
    }
  });

  it('property: deterministic for any kind and take, and returns a fresh copy', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SFX_KINDS), fc.nat({ max: 1000 }), (kind, take) => {
        const a = synthSfx(kind, take);
        const b = synthSfx(kind, take);
        expect(Array.from(a)).toEqual(Array.from(b));
        a[0] = 0.9;
        expect(synthSfx(kind, take)[0]).toBe(b[0]);
      }),
      { numRuns: 40 },
    );
  });

  it('works at another sample rate with the same peak position', () => {
    const x = synthSfx('pop', 0, 48_000);
    expect(x.length).toBe(msToSamples(90, 48_000));
    expect(Math.abs((argPeak(x) * 1000) / 48_000 - 6)).toBeLessThanOrEqual(2);
  });
});

/** A tiny WAV reader written here (packages/motion cannot import apps/web's `readWavHeader`). */
function parseWav(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  return {
    riff: tag(0),
    riffSize: v.getUint32(4, true),
    wave: tag(8),
    fmt: tag(12),
    fmtSize: v.getUint32(16, true),
    format: v.getUint16(20, true),
    channels: v.getUint16(22, true),
    sampleRate: v.getUint32(24, true),
    byteRate: v.getUint32(28, true),
    blockAlign: v.getUint16(32, true),
    bits: v.getUint16(34, true),
    data: tag(36),
    dataSize: v.getUint32(40, true),
    samples: Array.from({ length: v.getUint32(40, true) / 2 }, (_, i) =>
      v.getInt16(44 + i * 2, true),
    ),
  };
}

describe('encodeWav16', () => {
  it('writes a 16-bit mono PCM header and clamped samples', () => {
    const w = parseWav(encodeWav16(Float32Array.from([0, 1, -1, 3, -3, 0.5]), 24_000));
    expect(w).toMatchObject({
      riff: 'RIFF',
      riffSize: 36 + 12,
      wave: 'WAVE',
      fmt: 'fmt ',
      fmtSize: 16,
      format: 1,
      channels: 1,
      sampleRate: 24_000,
      byteRate: 48_000,
      blockAlign: 2,
      bits: 16,
      data: 'data',
      dataSize: 12,
    });
    expect(w.samples).toEqual([0, 32767, -32767, 32767, -32767, 16384]);
  });

  it('encodes an empty signal as a bare header', () => {
    expect(encodeWav16(new Float32Array(0), 24_000).byteLength).toBe(44);
  });
});
