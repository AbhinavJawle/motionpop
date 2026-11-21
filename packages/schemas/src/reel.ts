import { z } from 'zod';

/**
 * Reel engine (spec 25): a talking-head video becomes a vertical reel built only from
 * hand-crafted scene templates. The director picks a layout and a template per scene and fills
 * short text props; it never writes animation code. Every time is integer ms on the source
 * video's timeline.
 */

/** The two house looks. `mono`: white grid panel, black seam labels. `cream`: warm editorial. */
export const ReelLookSchema = z.enum(['mono', 'cream']);
export type ReelLook = z.infer<typeof ReelLookSchema>;

/**
 * Where the speaker and the graphic sit.
 * - `split`: graphic in the top half, speaker in the bottom half.
 * - `card`: graphic fills the frame, speaker is a rounded-top card along the bottom.
 * - `full`: graphic only (the voice keeps playing).
 * - `speaker`: speaker fills the frame, optional overlay template.
 */
export const ReelLayoutSchema = z.enum(['split', 'card', 'full', 'speaker']);
export type ReelLayout = z.infer<typeof ReelLayoutSchema>;

export const ReelBgSchema = z.enum(['light', 'cream', 'dark']);
export type ReelBg = z.infer<typeof ReelBgSchema>;

const ms = z.number().int().nonnegative();
const short = (max: number) => z.string().trim().min(1).max(max);
/** A lucide icon name from the curated set; unknown names fall back to a dot at render. */
const icon = z.string().trim().max(40);

const Cued = { at: ms };

export const ReelTemplateSchema = z.discriminatedUnion('template', [
  z.object({
    template: z.literal('headline'),
    kicker: short(40).optional(),
    title: short(60),
    sub: short(80).optional(),
    /** Words of the title drawn in the accent (serif italic on cream, gray on mono). */
    accent: short(40).optional(),
  }),
  z.object({
    template: z.literal('list'),
    kicker: short(40).optional(),
    title: short(40),
    items: z
      .array(z.object({ ...Cued, icon, text: short(28) }))
      .min(2)
      .max(5),
  }),
  z.object({
    template: z.literal('stack'),
    label: short(44),
    words: z
      .array(z.object({ ...Cued, text: short(18) }))
      .min(2)
      .max(5),
  }),
  z.object({
    template: z.literal('checklist'),
    kicker: short(40).optional(),
    rows: z
      .array(z.object({ ...Cued, label: short(18), value: short(14).optional() }))
      .min(2)
      .max(5),
  }),
  z.object({
    template: z.literal('compare'),
    left: short(14),
    right: short(14),
    /** Which side wins (gets the dark card); `none` keeps both equal. */
    winner: z.enum(['left', 'right', 'none']).default('right'),
    leftIcon: icon.optional(),
    rightIcon: icon.optional(),
    rows: z
      .array(z.object({ ...Cued, text: short(18) }))
      .max(3)
      .default([]),
  }),
  z.object({
    template: z.literal('statement'),
    icon: icon.optional(),
    /** Draw a strike line through the icon (for "no X", "without X"). */
    strike: z.boolean().default(false),
    lines: z
      .array(z.object({ ...Cued, text: short(22) }))
      .min(1)
      .max(4),
  }),
  z.object({
    template: z.literal('counter'),
    value: z.number().finite(),
    decimals: z.number().int().min(0).max(2).default(0),
    prefix: z.string().max(4).default(''),
    suffix: z.string().max(8).default(''),
    label: short(36),
    kicker: short(36).optional(),
    icon: icon.optional(),
  }),
  z.object({
    template: z.literal('progress'),
    icon: icon.optional(),
    title: short(32),
    sub: short(36).optional(),
    task: short(32).optional(),
    doneTitle: short(32).optional(),
  }),
  z.object({
    template: z.literal('terminal'),
    title: short(30).optional(),
    lines: z
      .array(
        z.object({ ...Cued, text: short(48), kind: z.enum(['cmd', 'out', 'ok']).default('cmd') }),
      )
      .min(1)
      .max(5),
  }),
  z.object({
    template: z.literal('chart'),
    kind: z.enum(['line', 'bars']),
    title: short(36),
    unit: z.string().max(6).default(''),
    points: z
      .array(z.object({ label: short(10), value: z.number().finite() }))
      .min(2)
      .max(8),
  }),
  z.object({
    template: z.literal('browser'),
    url: short(32),
    headline: short(48),
    sub: short(80).optional(),
    button: short(18).optional(),
    /** Slash a red line across the page at this time (a "don't do this" beat). */
    strikeAt: ms.optional(),
  }),
  z.object({
    template: z.literal('flow'),
    steps: z
      .array(z.object({ ...Cued, icon, text: short(16) }))
      .min(2)
      .max(4),
  }),
  z.object({
    template: z.literal('quote'),
    lines: z
      .array(z.object({ ...Cued, text: short(60) }))
      .min(1)
      .max(4),
    /** Words drawn as highlighted links. */
    highlight: z.array(short(24)).max(4).default([]),
  }),
  /** Speaker overlays (layout `speaker`). */
  z.object({
    template: z.literal('punch'),
    /** Small line above (serif italic on cream). */
    top: short(28).optional(),
    text: short(28),
  }),
  z.object({
    template: z.literal('cta'),
    verb: short(14).default('Comment'),
    keyword: short(16),
  }),
  z.object({ template: z.literal('none') }),
]);
export type ReelTemplate = z.infer<typeof ReelTemplateSchema>;
export type ReelTemplateId = ReelTemplate['template'];

export const REEL_SPEAKER_TEMPLATES = ['punch', 'cta', 'none'] as const;

export const ReelSceneSchema = z
  .object({
    id: z.string().min(1).max(40),
    startMs: ms,
    endMs: ms,
    layout: ReelLayoutSchema,
    bg: ReelBgSchema.optional(),
    /** Small black label at the top of the panel (mono look), e.g. "FRAME BY FRAME". */
    tag: short(28).optional(),
    content: ReelTemplateSchema,
  })
  .refine((s) => s.endMs > s.startMs, { message: 'endMs must be > startMs', path: ['endMs'] });
export type ReelScene = z.infer<typeof ReelSceneSchema>;

export const ReelWordSchema = z.object({
  text: z.string(),
  startMs: ms,
  endMs: ms,
});
export type ReelWord = z.infer<typeof ReelWordSchema>;

export const ReelPlanSchema = z.object({
  v: z.literal(1),
  look: ReelLookSchema,
  /** Face position in the source video, 0..1 of its width / height (framing for crops). */
  focus: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .default({ x: 0.5, y: 0.32 }),
  captions: z.boolean().default(true),
  /** The hook title shown over the first scene (mono: dark band at the seam). */
  hook: short(48).optional(),
  scenes: z.array(ReelSceneSchema).min(1).max(80),
  /** Who made it: the director model, or `auto` for the deterministic fallback. */
  by: z.string().max(60).optional(),
});
export type ReelPlan = z.infer<typeof ReelPlanSchema>;

/**
 * Sorts scenes, clamps them to [0, durationMs] and closes gaps and overlaps so they tile the
 * timeline exactly. Scenes shorter than 400 ms are merged into their neighbour.
 */
export function tileReelScenes(scenes: readonly ReelScene[], durationMs: number): ReelScene[] {
  const sorted = [...scenes]
    .map((s) => ({
      ...s,
      startMs: Math.max(0, Math.min(durationMs, s.startMs)),
      endMs: Math.max(0, Math.min(durationMs, s.endMs)),
    }))
    .filter((s) => s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const out: ReelScene[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...s, startMs: 0 });
      continue;
    }
    if (s.endMs - Math.max(s.startMs, prev.endMs) < 400) {
      prev.endMs = Math.max(prev.endMs, s.endMs);
      continue;
    }
    // Close gaps by extending the previous scene; resolve overlaps by starting later.
    const start = s.startMs > prev.endMs ? s.startMs : prev.endMs;
    if (s.startMs > prev.endMs) prev.endMs = start;
    out.push({ ...s, startMs: start });
  }
  const last = out[out.length - 1];
  if (last) last.endMs = durationMs;
  return out;
}
