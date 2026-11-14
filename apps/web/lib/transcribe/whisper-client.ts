import { TranscriptSchema, type Transcript } from '@motionpop/schemas';
import { chunksToWords } from './whisper-chunks';
import { WhisperResponseSchema, type WhisperResponse } from './whisper-protocol';

export type WhisperProgress = Extract<WhisperResponse, { type: 'progress' }>;

export interface TranscribeResult {
  transcript: Transcript;
  device: 'webgpu' | 'wasm';
  model: string;
  loadMs: number;
  inferMs: number;
}

let worker: Worker | null = null;
let seq = 0;

function getWorker(): Worker {
  worker ??= new Worker(new URL('../../workers/whisper.worker.ts', import.meta.url), {
    type: 'module',
  });
  return worker;
}

/** Transcribe 16 kHz mono PCM on-device. The buffer is transferred (unusable afterwards). */
export function transcribeOnDevice(
  pcm: Float32Array,
  durationMs: number,
  opts: { language?: string; onProgress?: (p: WhisperProgress) => void } = {},
): Promise<TranscribeResult> {
  const w = getWorker();
  const id = `t${++seq}`;
  const language = opts.language ?? 'en';
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const parsed = WhisperResponseSchema.safeParse(event.data);
      if (!parsed.success || parsed.data.id !== id) return;
      const msg = parsed.data;
      if (msg.type === 'progress') {
        opts.onProgress?.(msg);
        return;
      }
      w.removeEventListener('message', onMessage);
      if (msg.type === 'error') {
        reject(new Error(msg.message));
        return;
      }
      try {
        const transcript = TranscriptSchema.parse({
          words: chunksToWords(msg.chunks, durationMs),
          language,
          ranOn: 'device',
          timingQuality: 'word',
          cleaned: false,
        });
        resolve({
          transcript,
          device: msg.device,
          model: msg.model,
          loadMs: Math.round(msg.loadMs),
          inferMs: Math.round(msg.inferMs),
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ type: 'transcribe', id, audio: pcm, language }, [pcm.buffer]);
  });
}
