/** 16-bit mono PCM WAV. Used for synthesized fixture voices and cleaned voiceovers (spec 05). */
export function encodeWav(samples: Float32Array, sampleRate = 22_050): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
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
  return buf;
}

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationMs: number;
}

/** Reads a PCM WAV header (the shape `encodeWav` writes). Returns null for anything else. */
export function readWavHeader(buf: ArrayBuffer): WavInfo | null {
  if (buf.byteLength < 44) return null;
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(...new Uint8Array(buf, o, 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(12) !== 'fmt ' || tag(36) !== 'data') {
    return null;
  }
  const channels = v.getUint16(22, true);
  const sampleRate = v.getUint32(24, true);
  const bitsPerSample = v.getUint16(34, true);
  const dataBytes = v.getUint32(40, true);
  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
  if (bytesPerSecond === 0) return null;
  return {
    sampleRate,
    channels,
    bitsPerSample,
    durationMs: Math.round((dataBytes / bytesPerSecond) * 1000),
  };
}
