import { describe, expect, it } from 'vitest';
import { encodeWav, readWavHeader } from './wav';

// Spec 12 B2: `encodeWav` now wraps packages/motion's `encodeWav16`; its behaviour is unchanged.
describe('encodeWav (wrapper over encodeWav16)', () => {
  it('keeps the 22 050 Hz default and returns an ArrayBuffer readWavHeader understands', () => {
    const buf = encodeWav(new Float32Array(22_050));
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBe(44 + 22_050 * 2);
    expect(readWavHeader(buf)).toEqual({
      sampleRate: 22_050,
      channels: 1,
      bitsPerSample: 16,
      durationMs: 1000,
    });
  });

  it('honours an explicit rate and clamps samples', () => {
    const buf = encodeWav(Float32Array.from([2, -2, 0.5]), 24_000);
    expect(readWavHeader(buf)?.sampleRate).toBe(24_000);
    const v = new DataView(buf);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([
      32767, -32767, 16384,
    ]);
  });
});
