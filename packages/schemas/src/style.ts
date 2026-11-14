import { z } from 'zod';
import { contrastRatio } from './color';

// Must equal Object.keys(eases) in packages/motion/src/core/ease.ts (asserted by a test in motion).
export const EaseNameSchema = z.enum([
  'linear',
  'outCubic',
  'outQuart',
  'outExpo',
  'inOutCubic',
  'inOutSine',
]);
export type EaseNameLiteral = z.infer<typeof EaseNameSchema>;

const HexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected #RRGGBB');
const PositiveInt = z.number().int().positive();
const Unit = z.number().min(0).max(1);

export const StylePackSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    tagline: z.string().min(1),
    tags: z.array(z.string().min(1)),
    description: z.string().min(1),
    colors: z
      .object({
        bg: HexSchema,
        ink: HexSchema,
        muted: HexSchema,
        accent: HexSchema,
        accent2: HexSchema,
        highlight: HexSchema,
        positive: HexSchema,
        negative: HexSchema,
        chart: z.array(HexSchema).min(3).max(8),
      })
      .strict(),
    fonts: z
      .object({
        display: z.string().min(1),
        body: z.string().min(1),
        mono: z.string().min(1),
        displayWeight: z
          .number()
          .int()
          .min(400)
          .max(900)
          .refine((n) => n % 100 === 0, 'Must be a multiple of 100'),
      })
      .strict(),
    texture: z
      .object({
        grain: Unit,
        paper: z.boolean(),
        vignette: Unit,
      })
      .strict(),
    motion: z
      .object({
        enterEase: EaseNameSchema,
        moveEase: EaseNameSchema,
        enterMs: PositiveInt,
        staggerMs: PositiveInt,
        holdMs: PositiveInt,
        camera: z.object({ pushIn: z.number().min(1).max(1.1) }).strict(),
      })
      .strict(),
    shape: z
      .object({
        radius: z.number().min(0),
        stroke: z.number().min(0),
      })
      .strict(),
    allowPlayful: z.boolean(),
  })
  .strict()
  .superRefine((p, ctx) => {
    for (const key of ['ink', 'muted'] as const) {
      if (contrastRatio(p.colors[key], p.colors.bg) < 4.5) {
        ctx.addIssue({
          code: 'custom',
          path: ['colors', key],
          message: `${key} on bg needs contrast of at least 4.5:1`,
        });
      }
    }
  });

export type StylePack = z.infer<typeof StylePackSchema>;
