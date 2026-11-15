import {
  DirectorPlanSchema,
  EnergySchema,
  type DirectorPlan,
  type Energy,
} from '@motionpop/schemas';
import { z } from 'zod';
import { DIRECT_PLAN_SYSTEM_V1, directPlanPromptV1 } from '../prompts/direct-plan.v1';
import type { TaskDef } from '../router';
import type { PlanContext } from '../direct/enforce';

const Id = z.string().min(1).max(40);

export const DirectPlanInputSchema = z.object({
  /**
   * `device` (free, unlimited) runs first. `cloud` only after the server granted one of the
   * day's free cloud plans (`POST /api/ai/plan-allowance`); processing never spends credits.
   */
  route: z.enum(['device', 'cloud']),
  energy: EnergySchema,
  slots: z
    .array(
      z.object({
        /** The slot's spoken words. */
        words: z.string().max(240),
        /** What the tagger found in it (number, place, …); empty for a plain statement. */
        kinds: z.array(z.string().max(20)).max(6),
        /** Scene ids the slot may use, the detected one first. */
        candidates: z.array(Id).min(1).max(4),
        /** The slot's most stressed word (prosody, 0–100; 50 when unknown). */
        stress: z.number().int().min(0).max(100),
        /** The detector's 0..1 score (not shown to the model; the code-only peak uses it). */
        score: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(60),
  scenes: z
    .array(
      z.object({
        id: Id,
        about: z.string().max(200),
        variants: z
          .array(z.object({ id: Id, about: z.string().max(160) }))
          .min(1)
          .max(8),
        strongest: Id,
        imageRole: z.boolean(),
      }),
    )
    .min(1)
    .max(12),
  motifs: z.array(Id).max(6),
  imagesMax: z.number().int().min(0).max(20),
});
export type DirectPlanInput = z.infer<typeof DirectPlanInputSchema>;

/** The enforcer's context for an input (one source of truth for both). */
export function planContextOf(input: Omit<DirectPlanInput, 'route'>, seed: number): PlanContext {
  return {
    slots: input.slots.map((s) => ({ candidates: s.candidates, score: s.score })),
    scenes: Object.fromEntries(
      input.scenes.map((s) => [
        s.id,
        { variants: s.variants.map((v) => v.id), strongest: s.strongest, imageRole: s.imageRole },
      ]),
    ),
    motifs: input.motifs,
    imagesMax: input.imagesMax,
    energy: input.energy as Energy,
    seed,
  };
}

const enumOf = (values: readonly string[]) =>
  values.length ? { type: 'string', enum: [...new Set(values)] } : { type: 'string' };

/**
 * `direct.plan` (spec 07 R6.1): one small call plans the whole video. The structured output is
 * built per call, so scene, variant and motif ids are enums of what exists (schema rules). The
 * check sends back only what the enforcer can't fix on its own (no peak, no scenes); everything
 * else is enforced in code (`enforcePlan`). Free on both routes: the automatic run is absorbed,
 * and the cloud route is capped per user per day by the server.
 */
export const directPlan: TaskDef<DirectPlanInput, DirectorPlan> = {
  id: 'direct.plan',
  input: DirectPlanInputSchema,
  output: DirectorPlanSchema,
  mode: (input) => (input.route === 'device' ? 'ONLY_ON_DEVICE' : 'ONLY_IN_CLOUD'),
  model: (cfg) => cfg.modelFast,
  system: DIRECT_PLAN_SYSTEM_V1,
  prompt: directPlanPromptV1,
  cloudCost: () => 0,
  cloudFallback: false,
  thinking: 'LOW',
  maxRepairs: 1,
  jsonSchema: (input) => {
    const n = input.slots.length;
    const slot = { type: 'integer' };
    return {
      type: 'object',
      properties: {
        arc: {
          type: 'array',
          maxItems: n,
          items: {
            type: 'object',
            properties: { slot, energy: enumOf(EnergySchema.options) },
            required: ['slot', 'energy'],
          },
        },
        peak: slot,
        scenes: {
          type: 'array',
          maxItems: n,
          items: {
            type: 'object',
            properties: {
              slot,
              sceneId: enumOf(input.scenes.map((s) => s.id)),
              variant: enumOf(input.scenes.flatMap((s) => s.variants.map((v) => v.id))),
            },
            required: ['slot', 'sceneId', 'variant'],
          },
        },
        motifs: input.motifs.length
          ? {
              type: 'array',
              maxItems: input.motifs.length,
              items: {
                type: 'object',
                properties: {
                  motif: enumOf(input.motifs),
                  slots: { type: 'array', items: slot, maxItems: n },
                },
                required: ['motif', 'slots'],
              },
            }
          : { type: 'array', maxItems: 0, items: { type: 'object' } },
        images: { type: 'array', items: slot, maxItems: input.imagesMax },
        reasons: { type: 'array', items: { type: 'string' }, maxItems: n },
      },
      required: ['arc', 'peak', 'scenes', 'motifs', 'images'],
    };
  },
  check: (out, input) => {
    const n = input.slots.length;
    if (out.peak >= n) return `peak ${out.peak} is not a slot; use an index from 0 to ${n - 1}`;
    if (!out.scenes.some((s) => s.slot < n))
      return `scenes is empty; give every slot from 0 to ${n - 1} a scene from its candidates`;
    return null;
  },
};
