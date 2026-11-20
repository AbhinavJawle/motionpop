import { z } from 'zod';
import {
  APP_CONFIG_DEFAULTS,
  PipModelOutputSchema,
  costOf,
  type PipModelOutput,
} from '@motionpop/schemas';
import { PIP_PLAN_SYSTEM_V1, pipPlanPromptV1 } from '../prompts/pip-plan.v1';
import type { TaskDef } from '../router';

export const PipPlanInputSchema = z.object({
  scope: z.string().min(1),
  project: z.object({
    format: z.string(),
    styleId: z.string(),
    hasVideo: z.boolean().optional(),
    mediaBin: z
      .array(z.object({ id: z.string(), name: z.string(), kind: z.string(), summary: z.string().optional() }))
      .max(24)
      .optional(),
    styles: z.array(z.object({ id: z.string(), name: z.string() })).max(12),
    captions: z.object({ enabled: z.boolean(), preset: z.string() }),
    slots: z
      .array(
        z.object({
          ref: z.string(),
          componentId: z.string(),
          name: z.string(),
          title: z.string().max(120),
          status: z.string(),
          startMs: z.number().int().nonnegative(),
          endMs: z.number().int().nonnegative(),
        }),
      )
      .max(40),
    words: z.array(z.tuple([z.number().int().nonnegative(), z.string()])).max(3000),
    components: z
      .array(z.object({ id: z.string(), name: z.string(), useWhen: z.string() }))
      .max(16),
  }),
  history: z.array(z.object({ role: z.string(), text: z.string().max(400) })).max(6),
  message: z.string().trim().min(1).max(1000),
});
export type PipPlanInput = z.infer<typeof PipPlanInputSchema>;

/** Enums of exactly this project's slot refs and choices (structured output, no schema text). */
export function pipPlanJsonSchema(input: PipPlanInput): Record<string, unknown> {
  const slots = [...input.project.slots.map((s) => s.ref), 'none'];
  const choices = [
    ...new Set([
      ...input.project.styles.map((s) => s.id),
      '16:9',
      '9:16',
      '1:1',
      'on',
      'off',
      'pop',
      'clean',
      'boxed',
      'overlay',
      'cutaway',
      'full',
      'split-left',
      'split-right',
      'pip',
      'backdrop',
      'split-top-broll',
      'screen-showcase',
      'broll-full',
      'media-card-pop',
      'enable',
      'disable',
      ...(input.project.mediaBin?.map((c) => c.id) ?? []),
      ...input.project.components.map((c) => c.id),
      'none',
    ]),
  ].slice(0, 64);
  return {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      steps: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'updateSlot',
                'addSlot',
                'removeSlot',
                'setStyle',
                'setCaptions',
                'generateSlot',
                'setFormat',
                'setPlacement',
                'setVideoStage',
                'setBeatClip',
                'toggleCuts',
                'addPunchIn',
                'cutRange',
              ],
            },
            slot: { type: 'string', enum: slots },
            choice: { type: 'string', enum: choices },
            atWord: { type: 'integer' },
            instruction: { type: 'string' },
            label: { type: 'string' },
          },
          required: ['action', 'slot', 'choice', 'atWord', 'instruction', 'label'],
        },
      },
    },
    required: ['reply', 'steps'],
  };
}

/**
 * `pip.plan` (spec 10, ai-tasks.md §6): cloud by default (multi-step reasoning over the whole
 * timeline), 2 credits, never an automatic fallback. The plan is enforced in code afterwards
 * (`apps/web/lib/pip/enforce.ts`): unknown refs and invalid choices are dropped, never applied.
 */
export function pipPlanTask(): TaskDef<PipPlanInput, PipModelOutput> {
  return {
    id: 'pip.plan',
    maxOutputTokens: 4096,
    input: PipPlanInputSchema,
    output: PipModelOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelStrong,
    system: PIP_PLAN_SYSTEM_V1,
    prompt: (i) => pipPlanPromptV1(i),
    cloudCost: () => costOf('pip-plan', 1, APP_CONFIG_DEFAULTS),
    cloudFallback: false,
    maxRepairs: 1,
    thinking: 'LOW',
    jsonSchema: pipPlanJsonSchema,
  };
}
