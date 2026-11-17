import { z } from 'zod';
import { APP_CONFIG_DEFAULTS, FormatSchema, costOf } from '@motionpop/schemas';
import { CUSTOM_COMPOSE_SYSTEM_V1, customComposePromptV1 } from '../prompts/custom-compose.v1';
import type { TaskDef } from '../router';

export const CustomComposeInputSchema = z.object({
  brief: z.string().trim().min(3).max(500),
  words: z.string().max(2000),
  durationMs: z.number().int().min(1500).max(12_000),
  format: FormatSchema,
  look: z.object({ name: z.string().min(1) }),
  example: z.object({ html: z.string(), css: z.string(), script: z.string() }),
});
export type CustomComposeInput = z.infer<typeof CustomComposeInputSchema>;

/** The model's answer; the motion package's `customParams` adds the brief and checks it again. */
export const CustomComposeOutputSchema = z.object({
  title: z.string().trim().min(1).max(60),
  html: z.string().max(12_000),
  css: z.string().max(12_000),
  script: z.string().min(1).max(24_000),
  keyMomentMs: z.number().int().nonnegative(),
});
export type CustomComposeOutput = z.infer<typeof CustomComposeOutputSchema>;

export const customComposeJsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    html: { type: 'string' },
    css: { type: 'string' },
    script: { type: 'string' },
    keyMomentMs: { type: 'integer' },
  },
  required: ['title', 'html', 'css', 'script', 'keyMomentMs'],
};

/**
 * `custom.compose` (spec 15, ai-tasks.md §7): cloud only, the strong model, 3 credits, one
 * repair. `lint` is the motion package's `lintCustom`, injected because this package only
 * depends on motion for tests: any problem it finds goes back to the model once.
 */
export function customComposeTask(
  lint: (p: Pick<CustomComposeOutput, 'html' | 'css' | 'script'>) => string[],
): TaskDef<CustomComposeInput, CustomComposeOutput> {
  return {
    id: 'custom.compose',
    maxOutputTokens: 8192,
    input: CustomComposeInputSchema,
    output: CustomComposeOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelStrong,
    system: CUSTOM_COMPOSE_SYSTEM_V1,
    prompt: (i) => customComposePromptV1(i),
    cloudCost: () => costOf('custom', 1, APP_CONFIG_DEFAULTS),
    cloudFallback: false,
    maxRepairs: 1,
    thinking: 'MEDIUM',
    jsonSchema: () => customComposeJsonSchema,
    check: (out, input) => {
      const problems = lint(out);
      if (out.keyMomentMs > input.durationMs) problems.push('keyMomentMs is after the end');
      return problems.length ? `fix these problems: ${problems.join('; ')}` : null;
    },
  };
}
