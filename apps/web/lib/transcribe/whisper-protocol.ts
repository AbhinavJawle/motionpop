import { z } from 'zod';

/** Messages between the page and `workers/whisper.worker.ts`. Both sides parse what they receive. */

export const WHISPER_MODEL = 'onnx-community/whisper-base_timestamped';

export const WhisperRequestSchema = z.object({
  type: z.literal('transcribe'),
  id: z.string().min(1),
  /** 16 kHz mono PCM. */
  audio: z.instanceof(Float32Array),
  language: z.string().min(2).default('en'),
});
export type WhisperRequest = z.input<typeof WhisperRequestSchema>;

const ChunkSchema = z.object({
  text: z.string(),
  timestamp: z.tuple([z.number().nullable(), z.number().nullable()]),
});

export const WhisperResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    id: z.string(),
    stage: z.enum(['loading', 'transcribing']),
    /** 0–100 while downloading model files, absent otherwise. */
    percent: z.number().min(0).max(100).optional(),
    file: z.string().optional(),
  }),
  z.object({
    type: z.literal('result'),
    id: z.string(),
    device: z.enum(['webgpu', 'wasm']),
    model: z.string(),
    text: z.string(),
    chunks: z.array(ChunkSchema),
    loadMs: z.number().nonnegative(),
    inferMs: z.number().nonnegative(),
  }),
  z.object({ type: z.literal('error'), id: z.string(), message: z.string() }),
]);
export type WhisperResponse = z.infer<typeof WhisperResponseSchema>;
