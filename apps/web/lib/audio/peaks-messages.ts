import { z } from 'zod';

/** Messages between the page and `workers/peaks.worker.ts`. Both sides parse what they receive. */

export const PeaksRequestSchema = z.object({
  type: z.literal('peaks'),
  id: z.string().min(1),
  sampleRate: z.number().positive(),
  channels: z.array(z.instanceof(Float32Array)),
  bucketMs: z.number().positive().optional(),
});
export type PeaksRequest = z.input<typeof PeaksRequestSchema>;

export const PeaksResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('peaks'),
    id: z.string(),
    bucketMs: z.number().positive(),
    /** Interleaved [min, max] per bucket. */
    peaks: z.instanceof(Float32Array),
  }),
  z.object({ type: z.literal('error'), id: z.string(), message: z.string() }),
]);
export type PeaksResponse = z.infer<typeof PeaksResponseSchema>;
