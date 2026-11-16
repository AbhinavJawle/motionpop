import { z } from 'zod';

/** Size limits of a generated graphic (spec 15 R2.1). */
export const CUSTOM_LIMITS = { html: 12_000, css: 12_000, script: 24_000 } as const;

export const customParams = z.object({
  title: z
    .string()
    .min(1)
    .max(60)
    .describe('Short name of the graphic, e.g. "Rocket launch timeline"'),
  brief: z.string().max(500).optional(),
  html: z.string().max(CUSTOM_LIMITS.html).describe('Markup inside the graphic root; no <script>'),
  css: z
    .string()
    .max(CUSTOM_LIMITS.css)
    .describe('Plain CSS rules, scoped automatically; no @-rules'),
  script: z
    .string()
    .min(1)
    .max(CUSTOM_LIMITS.script)
    .describe('Function body: reads root, ctx, mp; returns { seek(tMs) }'),
  keyMomentMs: z.number().int().nonnegative().optional(),
});
export type CustomParams = z.infer<typeof customParams>;
