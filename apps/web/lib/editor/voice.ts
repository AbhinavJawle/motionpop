import type { EditorProject } from '@motionpop/schemas';
import { encodeWav, synthVoice } from '../audio/synth-voice';
import { DEFAULT_BUCKET_MS } from '../audio/peaks';
import { PeaksResponseSchema } from '../audio/peaks-messages';
import { audioStore, isIdbAudioRef } from '../audio/audio-store';
import { synthRate } from '../projects/fixture';

export interface LoadedVoice {
  url: string;
  peaks: Float32Array;
  bucketMs: number;
  revoke(): void;
}

let worker: Worker | undefined;
let nextId = 0;

function peaksInWorker(channels: Float32Array[], sampleRate: number): Promise<Float32Array> {
  worker ??= new Worker(new URL('../../workers/peaks.worker.ts', import.meta.url), {
    type: 'module',
  });
  const w = worker;
  const id = `p${++nextId}`;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<unknown>) => {
      const r = PeaksResponseSchema.safeParse(e.data);
      if (!r.success || r.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      if (r.data.type === 'peaks') resolve(r.data.peaks);
      else reject(new Error(r.data.message));
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ type: 'peaks', id, sampleRate, channels, bucketMs: DEFAULT_BUCKET_MS });
  });
}

/**
 * Loads the project's voiceover for playback and the waveform (spec 04 R4.4, R5.1): fixture
 * voices are synthesized from their word timings; other projects decode their stored audio
 * (AudioStore `idb:` refs, or a URL).
 */
export async function loadVoice(project: EditorProject): Promise<LoadedVoice> {
  let url: string;
  let channels: Float32Array[];
  let sampleRate: number;
  let revoke = () => {};

  const rate = synthRate(project.voiceover.src);
  if (rate !== null) {
    const samples = synthVoice(project.transcript.words, project.voiceover.durationMs, 1, rate);
    url = URL.createObjectURL(new Blob([encodeWav(samples, rate)], { type: 'audio/wav' }));
    revoke = () => URL.revokeObjectURL(url);
    channels = [samples];
    sampleRate = rate;
  } else {
    let bytes: ArrayBuffer;
    if (isIdbAudioRef(project.voiceover.src)) {
      const blob = await audioStore().get(project.voiceover.src);
      if (!blob) throw new Error('The voiceover audio is missing from this browser.');
      url = URL.createObjectURL(blob);
      const objectUrl = url;
      revoke = () => URL.revokeObjectURL(objectUrl);
      bytes = await blob.arrayBuffer();
    } else {
      url = project.voiceover.src;
      bytes = await (await fetch(url)).arrayBuffer();
    }
    const ctx = new OfflineAudioContext(1, 1, 44_100);
    const buffer = await ctx.decodeAudioData(bytes);
    channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    sampleRate = buffer.sampleRate;
  }

  const peaks = await peaksInWorker(channels, sampleRate);
  return { url, peaks, bucketMs: DEFAULT_BUCKET_MS, revoke };
}
