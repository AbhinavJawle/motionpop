import { z } from 'zod';

/** Size limits of a generated graphic (spec 15 R2.1). */
export const CUSTOM_LIMITS = { html: 12_000, css: 12_000, script: 24_000, prop: 8_000 } as const;
/** Longest a film beat may stay on screen past its slot, handing over to the next beat. */
export const FILM_MAX_TAIL_MS = 1200;

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
  /**
   * Film beats (spec 07b). A beat owns its entrance, its exit and its camera: the runtime adds no
   * seam and no push-in. `tailMs` keeps it on screen after its slot ends, over (`out`) or under
   * (`in`) the next beat, so one can hand over to the other through something on screen.
   */
  film: z
    .object({
      tailMs: z.number().int().min(0).max(FILM_MAX_TAIL_MS).default(0),
      over: z.enum(['out', 'in']).default('out'),
      /** How long the previous beat is still on screen when this one starts. */
      headMs: z.number().int().min(0).max(FILM_MAX_TAIL_MS).default(0),
    })
    .optional(),
  /** Film-level shared drawings by id (inline SVG), the same in every beat of a film. */
  props: z.record(z.string().max(40), z.string().max(CUSTOM_LIMITS.prop)).optional(),
  /** Sound effects the script asked for, lifted from a checked run. */
  cues: z
    .array(
      z.object({
        kind: z.enum(['whoosh', 'pop', 'tick', 'rise', 'impact']),
        atMs: z.number().int().nonnegative(),
      }),
    )
    .max(16)
    .optional(),
});
export type CustomParams = z.infer<typeof customParams>;
