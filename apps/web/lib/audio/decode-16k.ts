export const WHISPER_SAMPLE_RATE = 16_000;

/** Average channels into one mono track. Pure, so it is unit-tested without Web Audio. */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const out = new Float32Array(first.length);
  for (const ch of channels) {
    for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (ch[i] ?? 0);
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) / channels.length;
  return out;
}

/**
 * Decode any browser-supported audio file to 16 kHz mono PCM for Whisper.
 * `decodeAudioData` on a 16 kHz OfflineAudioContext resamples for us. Main thread only (no Web Audio in workers).
 */
export async function decodeTo16kMono(
  file: Blob,
): Promise<{ pcm: Float32Array; durationMs: number }> {
  const ctx = new OfflineAudioContext(1, 1, WHISPER_SAMPLE_RATE);
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  return { pcm: mixToMono(channels), durationMs: Math.round(buf.duration * 1000) };
}
