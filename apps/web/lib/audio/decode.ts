import { mixToMono, WHISPER_SAMPLE_RATE } from './decode-16k';

/** Cleaned voiceovers are mono 24 kHz: lossless for speech, ~8.6 MB for 3 minutes (D-024). */
export const OUTPUT_SAMPLE_RATE = 24_000;

/** Below this RMS over the whole file, there is nothing to transcribe. */
export const SILENCE_RMS = 0.002;

export interface DecodedAudio {
  /** 16 kHz mono, for Whisper. */
  pcm16k: Float32Array;
  /** 24 kHz mono, the source for the cleaned voiceover. */
  pcm24k: Float32Array;
  durationMs: number;
}

async function decodeAt(bytes: ArrayBuffer, sampleRate: number): Promise<AudioBuffer> {
  // decodeAudioData resamples to the context's rate and detaches the buffer it is given.
  return new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(bytes);
}

/**
 * Decodes a voiceover once per rate the pipeline needs (spec 05 R1.3). The original Blob is
 * not touched. Throws if the browser can't decode the file.
 */
export async function decodeForPipeline(blob: Blob): Promise<DecodedAudio> {
  const bytes = await blob.arrayBuffer();
  const [b16, b24] = await Promise.all([
    decodeAt(bytes.slice(0), WHISPER_SAMPLE_RATE),
    decodeAt(bytes.slice(0), OUTPUT_SAMPLE_RATE),
  ]);
  const mono = (b: AudioBuffer) =>
    mixToMono(Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)));
  return {
    pcm16k: mono(b16),
    pcm24k: mono(b24),
    durationMs: Math.round(b24.duration * 1000),
  };
}

export function rms(pcm: Float32Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const s = pcm[i] ?? 0;
    sum += s * s;
  }
  return Math.sqrt(sum / pcm.length);
}

export function isSilent(pcm: Float32Array, threshold = SILENCE_RMS): boolean {
  return rms(pcm) < threshold;
}
