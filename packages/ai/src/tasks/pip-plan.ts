import { z } from 'zod';
import {
  APP_CONFIG_DEFAULTS,
  PIP_ACTIONS,
  PIP_MAX_STEPS,
  PipModelOutputSchema,
  REEL_SFX_KINDS,
  costOf,
  type PipModelOutput,
} from '@motionpop/schemas';
import { PIP_PLAN_SYSTEM_V2, pipPlanPromptV2 } from '../prompts/pip-plan.v2';
import type { TaskDef } from '../router';

export const PipPlanInputSchema = z.object({
  scope: z.string().min(1),
  project: z.object({
    format: z.string(),
    styleId: z.string(),
    hasVideo: z.boolean().optional(),
    mediaBin: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          kind: z.string(),
          summary: z.string().optional(),
        }),
      )
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
    /** A video reel's scenes and state (spec 37). */
    reel: z
      .object({
        look: z.string().max(20),
        captions: z.boolean(),
        theme: z.string().max(80),
        sound: z.string().max(160),
        cuts: z.number().int().nonnegative(),
        scenes: z
          .array(
            z.object({
              ref: z.string().max(8),
              template: z.string().max(20),
              layout: z.string().max(12),
              startMs: z.number().int().nonnegative(),
              endMs: z.number().int().nonnegative(),
              text: z.string().max(140),
            }),
          )
          .max(80),
      })
      .optional(),
  }),
  history: z.array(z.object({ role: z.string(), text: z.string().max(400) })).max(6),
  message: z.string().trim().min(1).max(1000),
});
export type PipPlanInput = z.infer<typeof PipPlanInputSchema>;

/** Choices only video reels take (spec 37). */
const REEL_CHOICES = [
  'mono',
  'cream',
  'plain',
  'soft',
  'bold',
  'on',
  'off',
  'louder',
  'quieter',
  'clear',
  'calm-pad',
  'steady-pulse',
  'ai',
  ...REEL_SFX_KINDS,
  'stock',
  'enable',
  'disable',
  'none',
];

/** Enums of exactly this project's refs and choices (structured output, no schema text). */
export function pipPlanJsonSchema(input: PipPlanInput): Record<string, unknown> {
  const reel = input.project.reel;
  const slots = [
    ...input.project.slots.map((s) => s.ref),
    ...(reel?.scenes.map((s) => s.ref) ?? []),
    'none',
  ];
  // A reel with no slots takes reel choices + Media Bin clip IDs; slot projects keep the v1 list + SFX.
  const mediaBinIds = input.project.mediaBin?.map((c) => c.id) ?? [];
  const slotChoices = reel && !input.project.slots.length ? [] : slotProjectChoices(input);
  const maxChoices = reel && !input.project.slots.length ? 64 : 96;
  const choices = [
    ...new Set([...(reel ? [...REEL_CHOICES, ...mediaBinIds] : []), ...slotChoices]),
  ].slice(0, maxChoices);
  return {
    type: 'object',
    properties: {
      // Caps match the zod limits: an uncapped string can run away (spec 39 AI QA).
      reply: { type: 'string', maxLength: 240 },
      steps: {
        type: 'array',
        maxItems: PIP_MAX_STEPS,
        items: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: [...PIP_ACTIONS] },
            slot: { type: 'string', enum: slots },
            choice: { type: 'string', enum: choices },
            atWord: { type: 'integer' },
            instruction: { type: 'string', maxLength: 200 },
            label: { type: 'string', maxLength: 120 },
          },
          required: ['action', 'slot', 'choice', 'atWord', 'instruction', 'label'],
        },
      },
    },
    required: ['reply', 'steps'],
  };
}

function slotProjectChoices(input: PipPlanInput): string[] {
  return [
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
      ...REEL_SFX_KINDS,
      'stock',
      ...(input.project.mediaBin?.map((c) => c.id) ?? []),
      ...input.project.components.map((c) => c.id),
      'none',
    ]),
  ];
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
    system: PIP_PLAN_SYSTEM_V2,
    prompt: (i) => pipPlanPromptV2(i),
    cloudCost: () => costOf('pip-plan', 1, APP_CONFIG_DEFAULTS),
    cloudFallback: false,
    maxRepairs: 1,
    thinking: 'LOW',
    jsonSchema: pipPlanJsonSchema,
  };
}
