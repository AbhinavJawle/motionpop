import { z } from 'zod';
import { RanOnSchema } from './transcript';

/** RFC 6902 operations the edit tasks may emit: replace / add / remove only. */
const PointerSchema = z.string().regex(/^(\/[^/]*)*$/, 'must be a JSON pointer');

export const JsonPatchOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('replace'), path: PointerSchema, value: z.unknown() }),
  z.object({ op: z.literal('add'), path: PointerSchema, value: z.unknown() }),
  z.object({ op: z.literal('remove'), path: PointerSchema }),
]);
export type JsonPatchOp = z.infer<typeof JsonPatchOpSchema>;

/** Result of `run(task, input, opts)` in packages/ai (hybrid-ai.md). */
export function runResultSchema<T extends z.ZodType>(output: T) {
  return z.object({
    output,
    ranOn: RanOnSchema,
    model: z.string(),
    costCredits: z.number().int().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
  });
}

export interface RunResult<T> {
  output: T;
  ranOn: z.infer<typeof RanOnSchema>;
  model: string;
  costCredits: number;
  latencyMs: number;
}
