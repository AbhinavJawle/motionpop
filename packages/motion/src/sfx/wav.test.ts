import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeWav16, encodeWav16 } from './wav';

describe('decodeWav16', () => {
  it('property: decodes what encodeWav16 wrote, within one 16-bit step', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { maxLength: 200 }),
        fc.constantFrom(8000, 24000, 48000),
        (xs, rate) => {
          const out = decodeWav16(encodeWav16(Float32Array.from(xs), rate));
          expect(out?.sampleRate).toBe(rate);
          expect(out?.samples.length).toBe(xs.length);
          xs.forEach((x, i) =>
            expect(Math.abs((out?.samples[i] ?? 9) - x)).toBeLessThan(2 / 0x7fff),
          );
        },
      ),
    );
  });

  it('reads the first channel of a stereo file and skips unknown chunks', () => {
    const frames = [
      [0.5, -0.5],
      [-0.25, 0.25],
    ];
    const data = new Uint8Array(frames.length * 4);
    const dv = new DataView(data.buffer);
    frames.forEach(([l, r], i) => {
      dv.setInt16(i * 4, Math.round((l ?? 0) * 0x7fff), true);
      dv.setInt16(i * 4 + 2, Math.round((r ?? 0) * 0x7fff), true);
    });
    const chunks: number[] = [];
    const push = (s: string) => chunks.push(...[...s].map((c) => c.charCodeAt(0)));
    const u32 = (n: number) =>
      chunks.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255);
    const u16 = (n: number) => chunks.push(n & 255, (n >> 8) & 255);
    push('RIFF');
    u32(0);
    push('WAVE');
    push('LIST');
    u32(3);
    chunks.push(1, 2, 3, 0); // odd size, padded
    push('fmt ');
    u32(16);
    u16(1);
    u16(2);
    u32(48000);
    u32(48000 * 4);
    u16(4);
    u16(16);
    push('data');
    u32(data.length);
    chunks.push(...data);
    const out = decodeWav16(Uint8Array.from(chunks));
    expect(out?.sampleRate).toBe(48000);
    expect([...(out?.samples ?? [])].map((x) => Math.round(x * 100) / 100)).toEqual([0.5, -0.25]);
  });

  it('rejects files that are not 16-bit PCM WAV', () => {
    expect(decodeWav16(new Uint8Array([1, 2, 3]))).toBeNull();
    const f32 = encodeWav16(new Float32Array(4), 24000);
    new DataView(f32.buffer).setUint16(34, 32, true);
    expect(decodeWav16(f32)).toBeNull();
  });
});
