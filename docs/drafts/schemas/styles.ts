import { z } from 'zod';

export const StylePackIdSchema = z.enum([
  'editorial-explainer',
  'math-elegance',
  'money-documentary',
]);

export type StylePackId = z.infer<typeof StylePackIdSchema>;

export const PaletteSchema = z.object({
  background: z.string(), // hex color
  surface: z.string(),
  primary: z.string(),
  accent: z.string(),
  positive: z.string().optional(),
  negative: z.string().optional(),
  muted: z.string(),
  text: z.string(),
});

export type Palette = z.infer<typeof PaletteSchema>;

export const TypographySchema = z.object({
  display: z.string(), // font family
  body: z.string(),
  numerals: z.string(),
});

export type Typography = z.infer<typeof TypographySchema>;

export const EasingCurveSchema = z.tuple([
  z.number().min(0).max(1),
  z.number(),
  z.number().min(0).max(1),
  z.number(),
]);

export type EasingCurve = z.infer<typeof EasingCurveSchema>;

export const EasingSchema = z.object({
  enter: EasingCurveSchema,
  exit: EasingCurveSchema,
  emphasis: EasingCurveSchema,
});

export type Easing = z.infer<typeof EasingSchema>;

export const DurationsSchema = z.object({
  enter: z.number().positive(),
  exit: z.number().positive(),
  hold: z.number().positive(),
});

export type Durations = z.infer<typeof DurationsSchema>;

export const BackgroundStyleSchema = z.object({
  type: z.enum(['solid', 'gradient', 'gradient-grain', 'grid', 'texture']),
  grain: z.number().min(0).max(1).optional(),
  gradient: z.object({
    from: z.string(),
    to: z.string(),
    angle: z.number().default(135),
  }).optional(),
});

export type BackgroundStyle = z.infer<typeof BackgroundStyleSchema>;

export const CameraDefaultSchema = z.enum(['static', 'drift', 'slow-push', 'dynamic']);

export type CameraDefault = z.infer<typeof CameraDefaultSchema>;

export const StylePackSchema = z.object({
  id: StylePackIdSchema,
  name: z.string(),
  description: z.string(),
  palette: PaletteSchema,
  typography: TypographySchema,
  easing: EasingSchema,
  durations: DurationsSchema,
  background: BackgroundStyleSchema,
  camera: CameraDefaultSchema,
});

export type StylePack = z.infer<typeof StylePackSchema>;
