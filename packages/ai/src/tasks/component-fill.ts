import { z } from 'zod';
import { APP_CONFIG_DEFAULTS, costOf } from '@motionpop/schemas';
import { COMPONENT_FILL_SYSTEM_V1, componentFillPromptV1 } from '../prompts/component-fill.v1';
import type { TaskDef } from '../router';

export const ComponentFillInputSchema = z.object({
  /** `autofill` runs on the device only (free, no surprise spend); `generate` is the 3-credit cloud call. */
  purpose: z.enum(['autofill', 'generate']),
  componentId: z.string().min(1),
  words: z.string().max(2000),
  /**
   * Scenes only: the scene's variants and cues (one catalogue entry) and the slot's words with
   * their indexes, so beats can name the word each cue lands on.
   */
  scene: z
    .object({
      brief: z.string().max(1500),
      indexedWords: z.string().max(3000),
      /** The 2 closest hand-approved examples, as input → output lines (R9.3). */
      examples: z.array(z.string().max(700)).max(2).optional(),
    })
    .optional(),
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
export const GENERATE_COST = costOf('generate', 1, APP_CONFIG_DEFAULTS);

/** Repair rounds for a fill (spec 07 R1.4): the gate's reports go back to the same model. */
export const FILL_MAX_REPAIRS = 2;

export interface ComponentFillOptions {
  /**
   * Quality gate after the schema parse (spec 07 R9.2): builds the slot and returns the
   * reports as repair text, or null when it passes. Built per slot by the caller, who knows
   * the format, look, duration and words.
   */
  gate?: (componentId: string, params: unknown) => string | null;
}

/**
 * `component.fill` (ai-tasks.md §3). Built per component schema: the structured output is the
 * component's own params schema (no schema text in the prompt), the router's check parses the
 * params with it and runs the gate, and an invalid answer is repaired up to twice with the
 * reports fed back. Auto-fill uses ONLY_ON_DEVICE rather than PREFER_ON_DEVICE: without Nano,
 * PREFER would quietly run in the cloud, and auto-fill must stay free (R5.1, "no surprise
 * spend"). Callers fall back to the component defaults with `needsInput` when it fails.
 */
export function componentFillTask(
  paramsSchema: (componentId: string) => z.ZodType | undefined,
  opts: ComponentFillOptions = {},
): TaskDef<ComponentFillInput, ComponentFillOutput> {
  return {
    id: 'component.fill',
    maxOutputTokens: 2048,
    input: ComponentFillInputSchema,
    output: ComponentFillOutputSchema,
    mode: (input) => (input.purpose === 'autofill' ? 'ONLY_ON_DEVICE' : 'ONLY_IN_CLOUD'),
    model: (cfg) => cfg.modelFast,
    system: COMPONENT_FILL_SYSTEM_V1,
    prompt: componentFillPromptV1,
    cloudCost: () => GENERATE_COST,
    cloudFallback: false,
    thinking: 'LOW',
    maxRepairs: FILL_MAX_REPAIRS,
    jsonSchema: (input) => {
      const schema = paramsSchema(input.componentId);
      return {
        type: 'object',
        properties: {
          params: schema
            ? (z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as Record<
                string,
                unknown
              >)
            : { type: 'object' },
          needsInput: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        },
        required: ['params'],
      };
    },
    check: (out, input) => {
      const schema = paramsSchema(input.componentId);
      if (!schema) return `unknown component "${input.componentId}"`;
      const parsed = schema.safeParse(out.params);
      if (!parsed.success)
        return `params don't match the schema: ${z.prettifyError(parsed.error).slice(0, 400)}`;
      return opts.gate?.(input.componentId, parsed.data) ?? null;
    },
  };
}
