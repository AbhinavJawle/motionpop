import { z } from 'zod';
import { EnergySchema } from './score';
import { checkStyleContrast, stylePackObject } from './style';

/** Semantic surfaces a scene can ask for; the look decides how each is built (spec 07 R3.3). */
export const SurfaceKindSchema = z.enum(['card', 'photo', 'label', 'strip']);
export type SurfaceKind = z.infer<typeof SurfaceKindSchema>;

export const MaterialIdSchema = z.enum([
  'plain',
  'paper',
  'torn-edge',
  'tape',
  'white-border',
  'shadow-soft',
  'tilt',
  'halftone',
  'grain',
  'glow',
  'grid',
]);
export type MaterialId = z.infer<typeof MaterialIdSchema>;

/** Roles a scene can ask a mark for. */
export const MarkRoleSchema = z.enum(['emphasis', 'pointer', 'divider', 'badge']);
export type MarkRole = z.infer<typeof MarkRoleSchema>;

export const DecorIdSchema = z.enum([
  'underline',
  'highlighter',
  'marker-circle',
  'marker-arrow',
  'marker-underline',
  'stamp',
  'torn-rule',
  'scribble',
  'rule',
  'arrow',
  'chip',
]);
export type DecorId = z.infer<typeof DecorIdSchema>;

export const EnterBehaviourSchema = z.enum([
  'rise',
  'mask',
  'wipe',
  'pop',
  'draw',
  'slam',
  'type',
  'stamp',
  'count',
]);
export type EnterBehaviour = z.infer<typeof EnterBehaviourSchema>;

/** Engine-added motion that fills quiet gaps. The first three are the only ones legal in read time. */
export const JuiceIdSchema = z.enum([
  'camera-push',
  'parallax-shift',
  'texture-drift',
  'camera-snap',
  'decor-draw',
  'surface-flip',
  'accent-sweep',
]);
export type JuiceId = z.infer<typeof JuiceIdSchema>;
export const SLOW_JUICE: readonly JuiceId[] = ['camera-push', 'parallax-shift', 'texture-drift'];

export const ImageTreatmentSchema = z.enum([
  'key',
  'white-border',
  'shadow-soft',
  'tape',
  'torn-edge',
  'tilt',
  'duotone',
  'halftone',
]);

const Unit = z.number().min(0).max(1);

/**
 * A look: a style pack plus the craft blocks of spec 07 (R3.1). Every new block is optional, so
 * each existing style pack is a valid look and renders with plain defaults.
 */
export const LookSchema = stylePackObject
  .extend({
    fonts: stylePackObject.shape.fonts.extend({ hand: z.string().min(1).optional() }).strict(),
    energy: EnergySchema.optional(),
    personality: z
      .object({
        preset: z.enum(['calm', 'smooth', 'snappy', 'stepped']),
        /** Entrance per actor kind; missing kinds use the preset's choice. */
        enter: z
          .object({
            text: EnterBehaviourSchema,
            number: EnterBehaviourSchema,
            image: EnterBehaviourSchema,
            shape: EnterBehaviourSchema,
          })
          .partial()
          .strict(),
        /** How far a landing overshoots before it settles (0 = none). */
        overshoot: z.number().min(0).max(0.2),
        /** Largest scale pop a stressed word can add on landing (prosody intensity). */
        popMax: z.number().min(0).max(0.12),
        /** Exit length as a share of the entrance length (principle 12). */
        exitRatio: z.number().min(0.3).max(1),
        /** Stepped motion (stop-motion feel): hold each pose for 1/stepFps s. */
        stepFps: z.number().int().min(6).max(15).optional(),
        /** Stress points a neighbouring word must lead by before a cue snaps to it. */
        snapMargin: z.number().int().min(0).max(100),
      })
      .strict()
      .optional(),
    camera: z
      .object({
        /** Scale range of slow pushes, e.g. [1, 1.06]. */
        push: z.tuple([z.number().min(1).max(1.2), z.number().min(1).max(1.2)]),
        /** Extra scale of a snap-zoom (0 = none). */
        snap: z.number().min(0).max(0.15),
        whip: z.boolean(),
        /** Parallax travel of the front layer in px at 1080p. */
        parallax: z.number().min(0).max(60),
      })
      .strict()
      .optional(),
    surfaces: z.partialRecord(SurfaceKindSchema, z.array(MaterialIdSchema).max(5)).optional(),
    marks: z.partialRecord(MarkRoleSchema, DecorIdSchema).optional(),
    juice: z.array(JuiceIdSchema).min(1).max(7).optional(),
    image: z
      .object({
        /** Prompt recipe; `{subject}` is replaced by the score's subject. */
        recipe: z.string().includes('{subject}').max(400),
        treatment: z.array(ImageTreatmentSchema).max(6),
        tintStrength: Unit.optional(),
      })
      .strict()
      .optional(),
    /** Synthesized sound cue per event kind (names from the SFX synth, spec 12). */
    sound: z
      .partialRecord(z.enum(['enter', 'mark', 'focal', 'snap', 'exit']), z.string().min(1))
      .optional(),
    transitions: z.array(z.string().min(1)).max(4).optional(),
  })
  .strict()
  .superRefine(checkStyleContrast);
export type Look = z.infer<typeof LookSchema>;
