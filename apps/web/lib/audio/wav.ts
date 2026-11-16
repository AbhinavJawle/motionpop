import { encodeWav16 } from '@motionpop/motion/sfx';

/**
 * 16-bit mono PCM WAV. Used for synthesized fixture voices and cleaned voiceovers (spec 05).
 * A thin wrapper over the one encoder in packages/motion (spec 12 D-067 #15), keeping this
 * module's 22 050 Hz default and `ArrayBuffer` return.
 */
export function encodeWav(samples: Float32Array, sampleRate = 22_050): ArrayBuffer {
  return encodeWav16(samples, sampleRate).buffer;
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
