import { z } from 'zod';

/** Output of `slots.detect` (ai-tasks.md §1). Validated again after the post-pass. */
export const SlotSuggestionSchema = z
  .object({
    wordStart: z.number().int().nonnegative(),
    wordEnd: z.number().int().nonnegative(),
    componentId: z.string().min(1),
    skillId: z.string().min(1),
    /** Must quote the exact words, e.g. "revenue grew forty percent since 2020". */
    reason: z.string().min(1),
    score: z.number().min(0).max(1),
    /** Validated later against the component's own schema. */
    params: z.record(z.string(), z.unknown()),
    needsInput: z.array(z.string()).optional(),
  })
  .refine((s) => s.wordEnd >= s.wordStart, {
    message: 'wordEnd must be >= wordStart',
    path: ['wordEnd'],
  });
export type SlotSuggestion = z.infer<typeof SlotSuggestionSchema>;

export const SlotSuggestionsSchema = z.array(SlotSuggestionSchema);
