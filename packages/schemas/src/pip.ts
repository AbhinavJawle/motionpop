import { z } from 'zod';
import { BrandSchema } from './brand';
import { FormatSchema } from './format';
import { OverlayAnchorSchema, SlotPlacementSchema, VideoStageModeSchema } from './video';

/**
 * Pip, the whole-video assistant (spec 10 design §2, extended for video in spec 18 R6 & spec 19):
 * a message becomes a plan of closed actions that Apply all runs as commands.
 */
export const PIP_ACTIONS = [
  'updateSlot',
  'addSlot',
  'removeSlot',
  'setStyle',
  'setCaptions',
  'generateSlot',
  'setFormat',
  'setPlacement',
  'setVideoStage',
  'toggleCuts',
  'addPunchIn',
  'cutRange',
] as const;
export const PipActionSchema = z.enum(PIP_ACTIONS);
export type PipAction = z.infer<typeof PipActionSchema>;

/** What the model returns. Sentinels: slot "none", choice "none", atWord -1, instruction "". */
export const PipModelStepSchema = z.object({
  action: PipActionSchema,
  slot: z.string(),
  choice: z.string(),
  atWord: z.number().int(),
  instruction: z.string().max(200),
  label: z.string().max(120),
});
export const PipModelOutputSchema = z.object({
  reply: z.string().min(1).max(240),
  steps: z.array(PipModelStepSchema).max(8),
});
export type PipModelOutput = z.infer<typeof PipModelOutputSchema>;

export const PipCaptionChoiceSchema = z.enum(['on', 'off', 'pop', 'clean', 'boxed']);

/** After enforcement: what the plan card shows and Apply all runs. */
/**
 * Plan steps take the model's actions plus `setBrand`, which only code builds: its colours come
 * from the creator's saved brand kit, never from the model (the model schema above lacks it).
 */
export const PIP_STEP_ACTIONS = [...PIP_ACTIONS, 'setBrand', 'addImage'] as const;
export const PipStepActionSchema = z.enum(PIP_STEP_ACTIONS);
export type PipStepAction = z.infer<typeof PipStepActionSchema>;

export const PipStepSchema = z.object({
  id: z.string().min(1),
  action: PipStepActionSchema,
  slotId: z.string().optional(),
  styleId: z.string().optional(),
  brand: BrandSchema.optional(),
  format: FormatSchema.optional(),
  captions: PipCaptionChoiceSchema.optional(),
  placement: SlotPlacementSchema.optional(),
  overlayAnchor: OverlayAnchorSchema.optional(),
  videoStage: VideoStageModeSchema.optional(),
  cutEnabled: z.boolean().optional(),
  componentId: z.string().optional(),
  atWord: z.number().int().nonnegative().optional(),
  wordEnd: z.number().int().nonnegative().optional(),
  instruction: z.string().max(200).optional(),
  label: z.string().min(1).max(60),
  /** Credits this step spends when applied (code-computed, never from the model). */
  credits: z.number().int().nonnegative(),
  include: z.boolean(),
});
export type PipStep = z.infer<typeof PipStepSchema>;

export const PipPlanSchema = z.object({
  reply: z.string().max(240),
  steps: z.array(PipStepSchema).max(8),
  dropped: z.array(z.object({ label: z.string(), reason: z.string() })).max(8),
  source: z.enum(['device', 'cloud', 'code']),
});
export type PipPlan = z.infer<typeof PipPlanSchema>;

export const PlanStateSchema = z.enum(['proposed', 'applying', 'applied', 'stopped', 'undone']);
export type PlanState = z.infer<typeof PlanStateSchema>;
export const StepStateSchema = z.enum(['pending', 'running', 'done', 'skipped']);
export type StepState = z.infer<typeof StepStateSchema>;

export const PipScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('video') }),
  z.object({ kind: z.literal('slot'), slotId: z.string().min(1) }),
]);
export type PipScope = z.infer<typeof PipScopeSchema>;

export const ChatMessageSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  threadId: z.string().min(1),
  role: z.enum(['user', 'pip']),
  text: z.string().max(2000),
  scope: PipScopeSchema,
  plan: PipPlanSchema.optional(),
  planState: PlanStateSchema.optional(),
  stepStates: z
    .record(
      z.string(),
      z.object({ state: StepStateSchema, reason: z.string().max(120).optional() }),
    )
    .optional(),
  result: z
    .object({ slotIds: z.array(z.string()).max(60), changes: z.number().int().nonnegative() })
    .optional(),
  ranOn: z.enum(['device', 'cloud', 'code']).optional(),
  model: z.string().optional(),
  credits: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
