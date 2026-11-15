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
    /** On-device delivery analysis (spec 07 R9.1). Optional: old projects have none. */
    prosody: z
      .object({
        v: z.literal(1),
        /** One value per word, 0 (flat) to 100 (most stressed), from loudness, pitch and length. */
        stress: z.array(z.number().int().min(0).max(100)),
        /** Silences of 300 ms or longer. */
        pauses: z.array(
          z.object({
            startMs: z.number().int().nonnegative(),
            endMs: z.number().int().nonnegative(),
          }),
        ),
      })
      .optional(),
  })
  .superRefine((t, ctx) => {
    if (t.prosody && t.prosody.stress.length !== t.words.length) {
      ctx.addIssue({
        code: 'custom',
        message: `prosody.stress has ${t.prosody.stress.length} values for ${t.words.length} words`,
        path: ['prosody', 'stress'],
      });
    }
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

const FILLERS: ReadonlySet<string> = new Set([
  'um',
  'umm',
  'uh',
  'uhh',
  'erm',
  'er',
  'ah',
  'hmm',
  'mm',
  'mhm',
  'uhm',
  'ehm',
  'err',
  'hm',
  'hmmm',
  'mmm',
  'ahh',
]);

/**
 * True for a lone hesitation sound ("um", "uh", "hmm"), ignoring case and punctuation. Shared by
 * on-device and cloud transcription. Context-dependent fillers ("like", "you know") are not
 * flagged here.
 */
export function isFiller(text: string): boolean {
  return FILLERS.has(text.toLowerCase().replace(/[^a-z]/g, ''));
}
