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

/**
 * A picture a scene wants (spec 26): what to fetch (`query`: a brand name, a domain, a subject)
 * and, once fetched, the `project.assets` id that holds it. Without `asset` the template draws
 * its designed fallback, so a reel never shows a broken image.
 */
export const ReelMediaSchema = z.object({
  kind: z.enum(['logo', 'photo', 'illustration', 'screenshot']),
  query: short(120),
  asset: z.string().min(1).max(80).optional(),
});
export type ReelMedia = z.infer<typeof ReelMediaSchema>;
const media = ReelMediaSchema.optional();

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
      .array(z.object({ ...Cued, icon, text: short(28), media }))
      .min(2)
      .max(5),
  }),
  z.object({
    template: z.literal('stack'),
    label: short(44),
    words: z
      .array(z.object({ ...Cued, text: short(18), media }))
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
    leftMedia: media,
    rightMedia: media,
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
      .array(z.object({ ...Cued, icon, text: short(16), media }))
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
  /** One brand, product or app, big (spec 26). */
  z.object({
    template: z.literal('logo'),
    media: ReelMediaSchema,
    name: short(28),
    sub: short(48).optional(),
  }),
  /** 2–6 brands or tools building on their words. */
  z.object({
    template: z.literal('logos'),
    title: short(40).optional(),
    items: z
      .array(z.object({ ...Cued, media: ReelMediaSchema, name: short(20) }))
      .min(2)
      .max(6),
  }),
  /** A photo or illustration: framed card or full bleed, with kinetic words over it. */
  z.object({
    template: z.literal('image'),
    media: ReelMediaSchema,
    fit: z.enum(['frame', 'bleed']).default('frame'),
    kicker: short(40).optional(),
    title: short(40).optional(),
    words: z
      .array(z.object({ ...Cued, text: short(24) }))
      .max(3)
      .default([]),
  }),
  /** A real web page (screenshot) in a browser frame. */
  z.object({
    template: z.literal('website'),
    media: ReelMediaSchema,
    url: short(40),
    headline: short(48).optional(),
    strikeAt: ms.optional(),
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

/**
 * A note drawn on a reel scene (spec 29): the same shape as a slot's `FrameNote` (spec 09), so
 * the note UI is shared. `tMs` is relative to the scene start. Defined here, not imported from
 * `project.ts`, because `project.ts` imports this file. Limits are checked by the commands.
 */
export const ReelNoteSchema = z.object({
  id: z.string().min(1),
  tMs: ms,
  shape: z.object({
    kind: z.enum(['circle', 'path']),
    points: z.array(z.number()),
  }),
  text: z.string(),
  status: z.enum(['open', 'fixed']),
  fixedVersionId: z.string().min(1).optional(),
});
export type ReelNote = z.infer<typeof ReelNoteSchema>;
/** Most notes a scene keeps (the oldest fixed ones go first). */
export const REEL_NOTES_PER_SCENE = 12;

export const ReelSceneSchema = z
  .object({
    id: z.string().min(1).max(40),
    startMs: ms,
    endMs: ms,
    layout: ReelLayoutSchema,
    bg: ReelBgSchema.optional(),
    /** Small black label at the top of the panel (mono look), e.g. "FRAME BY FRAME". */
    tag: short(28).optional(),
    /** Continues the previous graphic across a cut (spec 26 R1.5): no entrance replay. */
    carry: z.boolean().optional(),
    content: ReelTemplateSchema,
    /** Frame notes on this scene (spec 29). */
    notes: z.array(ReelNoteSchema).max(40).optional(),
  })
  .refine((s) => s.endMs > s.startMs, { message: 'endMs must be > startMs', path: ['endMs'] });
export type ReelScene = z.infer<typeof ReelSceneSchema>;

/** A scene's data without its frame notes (what the engine draws; spec 29). */
export function reelSceneData(s: ReelScene): Omit<ReelScene, 'notes'> {
  const { notes, ...rest } = s;
  void notes;
  return rest;
}

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
  /**
   * What the footage is (spec 27 R2): a talking head is cropped to the face over time; screen
   * recordings and scenes without a face are shown whole. Face keys are on the reel timeline.
   */
  footage: z
    .object({
      kind: z.enum(['talking-head', 'screen', 'scene']).default('talking-head'),
      focus: z
        .array(
          z.object({
            atMs: z.number().int().nonnegative(),
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
          }),
        )
        .max(24)
        .default([]),
    })
    .optional(),
  /** The reel's music (spec 27 R3): the director's brief and, once generated, the stored file. */
  music: z
    .object({
      brief: z.string().trim().min(3).max(300),
      /** Audio store ref of the generated, looped music (absent: the synthesised bed plays). */
      src: z.string().min(1).max(500).optional(),
    })
    .optional(),
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

/**
 * The same plan in the other look: graphic layouts swap (mono split screen ↔ cream speaker card),
 * cream backgrounds read as light in mono, and the mono-only seam tags and hook band are kept but
 * ignored by cream. Speaker and full scenes are unchanged.
 */
/** Every picture request in a plan, in scene order (spec 26). */
export function reelMediaOf(plan: Pick<ReelPlan, 'scenes'>): ReelMedia[] {
  const out: ReelMedia[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      const r = ReelMediaSchema.safeParse(v);
      if (r.success && 'kind' in v && 'query' in v) out.push(v as ReelMedia);
      else Object.values(v).forEach(visit);
    }
  };
  for (const s of plan.scenes) visit(s.content);
  return out;
}

/** Stable key for a picture request (same kind + query → one fetch). */
export const reelMediaKey = (m: Pick<ReelMedia, 'kind' | 'query'>): string =>
  `${m.kind}:${m.query.trim().toLowerCase()}`;

/** Returns the plan with each matching request's `asset` set (immutable). */
export function setReelMediaAssets(
  plan: ReelPlan,
  assets: Readonly<Record<string, string>>,
): ReelPlan {
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      if ('kind' in v && 'query' in v && ReelMediaSchema.safeParse(v).success) {
        const m = v as ReelMedia;
        const a = assets[reelMediaKey(m)];
        return a ? { ...m, asset: a } : m;
      }
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visit(x)]));
    }
    return v;
  };
  return {
    ...plan,
    scenes: plan.scenes.map((s) => ({ ...s, content: visit(s.content) as ReelTemplate })),
  };
}

export function restyleReelPlan(plan: ReelPlan, look: ReelLook): ReelPlan {
  if (plan.look === look) return plan;
  return {
    ...plan,
    look,
    scenes: plan.scenes.map((s) => {
      const layout =
        look === 'mono' && s.layout === 'card'
          ? 'split'
          : look === 'cream' && s.layout === 'split'
            ? 'card'
            : s.layout;
      const bg = look === 'mono' && s.bg === 'cream' ? 'light' : s.bg;
      return { ...s, layout, ...(bg ? { bg } : {}) };
    }),
  };
}

/** Icons the director may name (all exist in the motion kit's lucide set). */
export const REEL_ICONS = [
  'rocket',
  'sparkles',
  'wand-sparkles',
  'zap',
  'flame',
  'target',
  'goal',
  'flag',
  'trophy',
  'crown',
  'star',
  'heart',
  'thumbs-up',
  'brain',
  'brain-circuit',
  'lightbulb',
  'lightbulb-off',
  'eye',
  'search',
  'user',
  'users',
  'user-check',
  'hand',
  'handshake',
  'hand-heart',
  'footprints',
  'dumbbell',
  'clock',
  'alarm-clock',
  'timer',
  'timer-reset',
  'hourglass',
  'calendar',
  'calendar-check',
  'sunrise',
  'mountain',
  'mountain-snow',
  'trending-up',
  'trending-down',
  'chart-line',
  'chart-column',
  'chart-pie',
  'activity',
  'gauge',
  'percent',
  'coins',
  'banknote',
  'wallet',
  'piggy-bank',
  'credit-card',
  'dollar-sign',
  'euro',
  'receipt',
  'shopping-cart',
  'package',
  'box',
  'gift',
  'store',
  'building',
  'factory',
  'house',
  'globe',
  'map',
  'map-pin',
  'compass',
  'plane',
  'car',
  'truck',
  'ship',
  'monitor',
  'laptop',
  'smartphone',
  'cpu',
  'server',
  'database',
  'cloud',
  'wifi',
  'bot',
  'code',
  'terminal',
  'git-branch',
  'bug',
  'settings',
  'sliders-horizontal',
  'cog',
  'wrench',
  'hammer',
  'layers',
  'layout-dashboard',
  'palette',
  'pen-tool',
  'image',
  'video',
  'film',
  'camera',
  'mic',
  'play',
  'circle-play',
  'file',
  'file-text',
  'folder',
  'download',
  'upload',
  'link',
  'mouse-pointer-click',
  'message-circle',
  'message-square',
  'mail',
  'phone',
  'megaphone',
  'bell',
  'book-open',
  'notebook-pen',
  'graduation-cap',
  'newspaper',
  'list-checks',
  'list-todo',
  'check-check',
  'circle-check',
  'badge-check',
  'square-check-big',
  'circle-x',
  'octagon-x',
  'ban',
  'x',
  'check',
  'plus',
  'minus',
  'equal',
  'infinity',
  'repeat',
  'refresh-cw',
  'lock',
  'key',
  'key-round',
  'shield',
  'shield-check',
  'scale',
  'gavel',
  'door-open',
  'atom',
  'dna',
  'flask-conical',
  'microscope',
  'pill',
  'stethoscope',
  'leaf',
  'sprout',
  'sun',
  'moon',
  'droplet',
  'coffee',
  'utensils',
  'apple',
  'loader',
  'circle-dashed',
  'arrow-right',
  'arrow-up-right',
] as const;
