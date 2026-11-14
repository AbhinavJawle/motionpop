/// <reference lib="webworker" />
import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from '@huggingface/transformers';
import {
  WHISPER_MODEL,
  WhisperRequestSchema,
  type WhisperResponse,
} from '../lib/transcribe/whisper-protocol';

/**
 * On-device word-level transcription (spec 00 task 8, spec 05 later).
 * WebGPU first, WASM fallback. Model files come from the Hugging Face hub and are kept in the browser cache.
 */
declare const self: DedicatedWorkerGlobalScope;

env.allowLocalModels = false;

type Device = 'webgpu' | 'wasm';
let loaded: Promise<{
  asr: AutomaticSpeechRecognitionPipeline;
  device: Device;
  loadMs: number;
}> | null = null;

const post = (msg: WhisperResponse) => self.postMessage(msg);

async function hasWebGpu(): Promise<boolean> {
  // `navigator.gpu` is typed only with @webgpu/types; feature-detect structurally instead.
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

async function create(device: Device, id: string) {
  const onProgress = (p: ProgressInfo) => {
    if (p.status === 'progress_total') {
      post({
        type: 'progress',
        id,
        stage: 'loading',
        percent: Math.min(100, Math.max(0, p.progress)),
      });
    } else if (p.status === 'initiate') {
      post({ type: 'progress', id, stage: 'loading', file: p.file });
    }
  };
  // Encoder quality matters for timing; the merged decoder tolerates 4-bit on GPU. WASM runs 8-bit throughout.
  const dtype =
    device === 'webgpu'
      ? ({ encoder_model: 'fp32', decoder_model_merged: 'q4' } as const)
      : ({ encoder_model: 'q8', decoder_model_merged: 'q8' } as const);
  return pipeline('automatic-speech-recognition', WHISPER_MODEL, {
    device,
    dtype,
    progress_callback: onProgress,
  });
}

function load(id: string) {
  loaded ??= (async () => {
    const t0 = performance.now();
    if (await hasWebGpu()) {
      try {
        const asr = await create('webgpu', id);
        return { asr, device: 'webgpu' as const, loadMs: performance.now() - t0 };
      } catch (err) {
        console.warn('[whisper] WebGPU failed, falling back to WASM', err);
      }
    }
    const asr = await create('wasm', id);
    return { asr, device: 'wasm' as const, loadMs: performance.now() - t0 };
  })();
  loaded.catch(() => {
    loaded = null; // allow a retry after a failed download
  });
  return loaded;
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const parsed = WhisperRequestSchema.safeParse(event.data);
  if (!parsed.success) {
    const id =
      typeof event.data === 'object' && event.data !== null && 'id' in event.data
        ? String((event.data as { id: unknown }).id)
        : 'unknown';
    post({ type: 'error', id, message: `bad request: ${parsed.error.message}` });
    return;
  }
  const req = parsed.data;
  void (async () => {
    try {
      const { asr, device, loadMs } = await load(req.id);
      post({ type: 'progress', id: req.id, stage: 'transcribing' });
      const t0 = performance.now();
      const long = req.audio.length > 30 * 16_000;
      const out = await asr(req.audio, {
        return_timestamps: 'word',
        language: req.language,
        task: 'transcribe',
        ...(long ? { chunk_length_s: 30, stride_length_s: 5 } : {}),
      });
      post({
        type: 'result',
        id: req.id,
        device,
        model: WHISPER_MODEL,
        text: out.text,
        chunks: (out.chunks ?? []).map((c) => ({ text: c.text, timestamp: c.timestamp })),
        loadMs,
        inferMs: performance.now() - t0,
      });
    } catch (err) {
      post({
        type: 'error',
        id: req.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
});
