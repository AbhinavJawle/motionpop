/**
 * The one WAV encoder (spec 12 D-067 #15): 16-bit mono PCM, little endian, 44-byte header.
 * Used for the bed, synthesized fixtures and cleaned voiceovers; apps/web's `encodeWav` wraps it.
 * Samples are clamped to [-1, 1] and rounded to the nearest step of 1/32767.
 */
export function encodeWav16(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    v.setInt16(44 + i * 2, Math.round(s * 0x7fff), true);
  }
  return bytes;
}

/**
 * Reads a 16-bit PCM WAV (any channel count, any extra chunks) into its first channel as floats.
 * The render job measures the voice level with it. Returns null for anything else.
 */
export function decodeWav16(
  bytes: Uint8Array,
): { samples: Float32Array; sampleRate: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let format = 0;
  for (let o = 12; o + 8 <= bytes.length;) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ' && size >= 16) {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === 'data') {
      // WAVE_FORMAT_EXTENSIBLE (0xfffe) carries PCM too; ffmpeg writes it for some layouts.
      if ((format !== 1 && format !== 0xfffe) || bits !== 16 || channels < 1 || sampleRate <= 0)
        return null;
      const end = Math.min(bytes.length, body + size);
      const frames = Math.floor((end - body) / (2 * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++)
        samples[i] = v.getInt16(body + i * 2 * channels, true) / 0x8000;
      return { samples, sampleRate };
    }
    o = body + size + (size % 2);
  }
  return null;
}
