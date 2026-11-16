import { z } from 'zod';
import { FormatSchema } from './format';
import { WordSchema } from './transcript';

/** What the Start screen collects before a voice exists (spec 11, design §2.5). */
export const StartDraftSchema = z.object({
  title: z.string().trim().min(1).max(80).default('Untitled Project'),
  format: FormatSchema.default('16:9'),
  styleId: z.string().min(1).optional(),
});
export type StartDraft = z.infer<typeof StartDraftSchema>;

/**
 * A voice waiting for Processing. `ref` points at a blob already in the local audio store
 * (`idb:…`), never at an in-memory blob, so a reload keeps the take (D-065 #18).
 */
/**
 * Longest script Pip will voice: about 1,000 words, six and a half minutes at a natural pace.
 * Kept under the export cap (`exportMaxMs`) so every voiced script can also be exported.
 */
export const SCRIPT_MAX_CHARS = 6000;

export const PendingIntakeSchema = z.object({
  ref: z.string().min(1),
  source: z.enum(['upload', 'record', 'sample', 'tts']),
  name: z.string().min(1),
  /** False for generated voices (spec 05 R6.1). */
  cleanup: z.boolean(),
  tts: z
    .object({
      voiceId: z.string().min(1),
      speed: z.number().positive(),
      script: z.string().max(SCRIPT_MAX_CHARS),
    })
    .optional(),
  /**
   * A single graphic (no voice): the typed line's words with their timings on a silent track.
   * The project gets one slot over the whole line and no captions.
   */
  single: z.boolean().optional(),
  words: z.array(WordSchema).max(60).optional(),
});
export type PendingIntake = z.infer<typeof PendingIntakeSchema>;
