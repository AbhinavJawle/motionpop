import { z } from 'zod';

export const RanOnSchema = z.enum(['device', 'cloud']);
export type RanOn = z.infer<typeof RanOnSchema>;

export const WordSchema = z
  .object({
    i: z.number().int().nonnegative(),
    text: z.string(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    conf: z.number().min(0).max(1),
    filler: z.boolean(),
  })
  .refine((w) => w.endMs >= w.startMs, {
    message: 'endMs must be >= startMs',
    path: ['endMs'],
  });
export type Word = z.infer<typeof WordSchema>;

export const TranscriptSchema = z
  .object({
    words: z.array(WordSchema),
    language: z.string().min(2),
    ranOn: RanOnSchema,
    timingQuality: z.enum(['word', 'approx']),
    cleaned: z.boolean(),
  })
  .superRefine((t, ctx) => {
    t.words.forEach((w, idx) => {
      if (w.i !== idx) {
        ctx.addIssue({
          code: 'custom',
          message: `word index ${w.i} must equal position ${idx}`,
          path: ['words', idx, 'i'],
        });
      }
    });
  });
export type Transcript = z.infer<typeof TranscriptSchema>;
