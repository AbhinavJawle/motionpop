import { z } from 'zod';
import { COMPONENT_FILL_SYSTEM_V1, componentFillPromptV1 } from '../prompts/component-fill.v1';
import type { TaskDef } from '../router';

export const ComponentFillInputSchema = z.object({
  /** `autofill` runs on the device only (free, no surprise spend); `generate` is the 3-credit cloud call. */
  purpose: z.enum(['autofill', 'generate']),
  componentId: z.string().min(1),
  paramsSchemaSummary: z.string(),
  words: z.string().max(2000),
  prompt: z.string().max(500),
  currentParams: z.record(z.string(), z.unknown()).optional(),
  styleId: z.string().min(1),
  skill: z.object({ shotSequence: z.string().max(1200), emphasis: z.string().max(600) }),
});
export type ComponentFillInput = z.infer<typeof ComponentFillInputSchema>;

export const ComponentFillOutputSchema = z.object({
  params: z.record(z.string(), z.unknown()),
  needsInput: z.array(z.string()).max(20).optional(),
});
export type ComponentFillOutput = z.infer<typeof ComponentFillOutputSchema>;

/** Credits for Generate (the design's "☁ 3" chip). Auto-fill never reaches the cloud. */
export const GENERATE_COST = 3;

/**
 * `component.fill` (ai-tasks.md §3). Built per component schema: the router's check parses the
 * params with the component's zod schema, so an invalid answer is repaired once with the
 * errors fed back. Auto-fill uses ONLY_ON_DEVICE rather than PREFER_ON_DEVICE: without Nano,
 * PREFER would quietly run in the cloud, and auto-fill must stay free (R5.1, "no surprise
 * spend"). Callers fall back to the component defaults with `needsInput` when it fails.
 */
export function componentFillTask(
  paramsSchema: (componentId: string) => z.ZodType | undefined,
): TaskDef<ComponentFillInput, ComponentFillOutput> {
  return {
    id: 'component.fill',
    input: ComponentFillInputSchema,
    output: ComponentFillOutputSchema,
    mode: (input) => (input.purpose === 'autofill' ? 'ONLY_ON_DEVICE' : 'ONLY_IN_CLOUD'),
    model: (cfg) => cfg.modelFast,
    system: COMPONENT_FILL_SYSTEM_V1,
    prompt: componentFillPromptV1,
    cloudCost: () => GENERATE_COST,
    cloudFallback: false,
    thinking: 'LOW',
    check: (out, input) => {
      const schema = paramsSchema(input.componentId);
      if (!schema) return `unknown component "${input.componentId}"`;
      const parsed = schema.safeParse(out.params);
      return parsed.success
        ? null
        : `params don't match the schema: ${z.prettifyError(parsed.error).slice(0, 400)}`;
    },
  };
}
