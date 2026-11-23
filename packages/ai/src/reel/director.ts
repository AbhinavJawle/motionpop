// `reel.direct` (spec 25 R3.1, spec 26 R1): one cloud call writes the reel's story and scene
// plan. The model answers in word indices with one strict object per template (every field the
// template needs is required, so a valid answer can't be an empty scene); `toReelPlan` maps it
// onto the strict `ReelPlan`, repairing or dropping what does not fit, so one odd scene never
// sinks the plan.
import {
  APP_CONFIG_DEFAULTS,
  REEL_ICONS,
  ReelPlanSchema,
  ReelSceneSchema,
  ReelTemplateSchema,
  tileReelScenes,
  type ReelLook,
  type ReelMedia,
  type ReelPlan,
  type ReelScene,
  type ReelTemplate,
  type ReelWord,
} from '@motionpop/schemas';
import { z } from 'zod';
import type { Router, TaskDef } from '../router';
import { autoReelPlan } from './auto';
import { cut } from './text';
import { ReelDirectBriefSchema, type ReelDirectBrief } from './brief';
import { applyEditChoices, type EditChoices } from './edit-choices';

// `cut` lives in ./text (so edit-choices does not import this file); re-exported for callers.
export { cut };
import { REEL_DIRECT_PROMPT_VERSION, REEL_DIRECT_SYSTEM_V3, reelDirectPromptV3 } from './prompt';

export const ReelDirectInputSchema = z.object({
  look: z.enum(['mono', 'cream']),
  durationMs: z.number().int().positive(),
  /** [wordIndex, startMs, text] */
  words: z
    .array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.string()]))
    .min(1)
    .max(2500),
  /** Up to 6 JPEG keyframes of the footage, `atMs` on the reel clock (spec 27 R2.1). */
  frames: z
    .array(z.object({ atMs: z.number().int().nonnegative(), base64: z.string().min(16) }))
    .max(6)
    .default([]),
  /** The creator's recipe and choices (spec 39 R3.5); absent = the director's own taste. */
  brief: ReelDirectBriefSchema.optional(),
});
export type ReelDirectInput = z.infer<typeof ReelDirectInputSchema>;

// ----- model-facing output (lenient zod; strict JSON schema below) -------------------------------

const str = z.string().optional();
const word = z.number().int().optional();
const Item = z.object({
  word,
  text: z.string().default(''),
  icon: str,
  brand: str,
  value: z.union([z.string(), z.number()]).optional(),
  kind: str,
});
const LogoItem = z.object({ word, brand: z.string() });

const G = {
  headline: z.object({
    template: z.literal('headline'),
    title: z.string(),
    kicker: str,
    sub: str,
    accent: str,
  }),
  list: z.object({
    template: z.literal('list'),
    title: z.string(),
    kicker: str,
    items: z.array(Item),
  }),
  stack: z.object({ template: z.literal('stack'), label: z.string(), items: z.array(Item) }),
  checklist: z.object({ template: z.literal('checklist'), kicker: str, items: z.array(Item) }),
  compare: z.object({
    template: z.literal('compare'),
    left: z.string(),
    right: z.string(),
    winner: z.enum(['left', 'right', 'none']).default('right'),
    leftIcon: str,
    rightIcon: str,
    leftBrand: str,
    rightBrand: str,
    items: z.array(Item).default([]),
  }),
  statement: z.object({
    template: z.literal('statement'),
    icon: str,
    strike: z.boolean().optional(),
    items: z.array(Item),
  }),
  counter: z.object({
    template: z.literal('counter'),
    value: z.number(),
    label: z.string(),
    prefix: str,
    suffix: str,
    decimals: z.number().optional(),
    kicker: str,
    icon: str,
  }),
  progress: z.object({
    template: z.literal('progress'),
    title: z.string(),
    icon: str,
    sub: str,
    task: str,
    doneTitle: str,
  }),
  terminal: z.object({ template: z.literal('terminal'), title: str, items: z.array(Item) }),
  chart: z.object({
    template: z.literal('chart'),
    kind: z.enum(['line', 'bars']).default('line'),
    title: z.string(),
    unit: str,
    items: z.array(Item),
  }),
  browser: z.object({
    template: z.literal('browser'),
    url: z.string(),
    headline: z.string(),
    sub: str,
    button: str,
    strikeWord: word,
  }),
  flow: z.object({ template: z.literal('flow'), items: z.array(Item) }),
  quote: z.object({
    template: z.literal('quote'),
    items: z.array(Item),
    highlight: z.array(z.string()).optional(),
  }),
  logo: z.object({ template: z.literal('logo'), brand: z.string(), sub: str }),
  logos: z.object({ template: z.literal('logos'), title: str, items: z.array(LogoItem) }),
  image: z.object({
    template: z.literal('image'),
    kind: z.enum(['photo', 'illustration']).default('illustration'),
    subject: z.string(),
    fit: z.enum(['frame', 'bleed']).default('frame'),
    kicker: str,
    title: str,
    items: z.array(Item).default([]),
  }),
  website: z.object({
    template: z.literal('website'),
    domain: z.string(),
    headline: str,
    strikeWord: word,
  }),
  punch: z.object({ template: z.literal('punch'), text: z.string(), top: str }),
  cta: z.object({ template: z.literal('cta'), verb: z.string(), keyword: z.string() }),
  none: z.object({ template: z.literal('none') }),
} as const;

export const REEL_TEMPLATE_IDS = Object.keys(G) as (keyof typeof G)[];

export const GraphicSchema = z.discriminatedUnion('template', [
  G.headline,
  G.list,
  G.stack,
  G.checklist,
  G.compare,
  G.statement,
  G.counter,
  G.progress,
  G.terminal,
  G.chart,
  G.browser,
  G.flow,
  G.quote,
  G.logo,
  G.logos,
  G.image,
  G.website,
  G.punch,
  G.cta,
  G.none,
]);
/** One scene's graphic in the director's language (word indices, brand names, subjects). */
export type Graphic = z.infer<typeof GraphicSchema>;

const BEATS = ['hook', 'setup', 'tension', 'turn', 'proof', 'payoff', 'cta'] as const;
const DirectedSceneSchema = z.object({
  fromWord: z.number().int(),
  toWord: z.number().int(),
  layout: z.enum(['split', 'card', 'full', 'speaker']),
  beat: z.enum(BEATS).optional(),
  carry: z.boolean().optional(),
  tag: str,
  bg: z.enum(['light', 'cream', 'dark']).optional(),
  graphic: GraphicSchema,
});
const FootageSchema = z.object({
  kind: z.enum(['talking-head', 'screen', 'scene']).catch('talking-head'),
  /** Face centre per keyframe, 0–1000 of the frame's width / height. */
  faces: z
    .array(
      z.object({
        frame: z.number().int().nonnegative(),
        x: z.number().min(0).max(1000),
        y: z.number().min(0).max(1000),
      }),
    )
    .catch([])
    .default([]),
});
export const ReelDirectOutputSchema = z.object({
  story: z.object({ topic: z.string(), arc: z.array(z.string()), motif: z.string() }).optional(),
  footage: FootageSchema.optional(),
  /** Music brief for the reel's soundtrack: mood, genre, instruments, tempo. */
  music: z.string().optional(),
  hook: z.string().optional(),
  brands: z.array(z.object({ name: z.string(), domain: str })).default([]),
  scenes: z.array(DirectedSceneSchema).min(1).max(80),
});
export type ReelDirectOutput = z.input<typeof ReelDirectOutputSchema>;
type DirectedScene = z.infer<typeof DirectedSceneSchema>;

/**
 * Gemini structured-output schema: one `anyOf` branch per template, its fields required.
 * Every string has a `maxLength` (found in the spec 39 AI soak): without one the model sometimes
 * escaped a closing quote (`"suffix": "%\\", \\"kicker\\": …`) and wrote the rest of the reel
 * inside that one string, leaving a single scene. A length cap makes the decoder close it.
 */
const sl = (maxLength: number) => ({ type: 'string', maxLength });
const s = sl(120);
const n = { type: 'number' };
const i = { type: 'integer' };
const obj = (props: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties: props,
  required,
});
const arr = (items: unknown, minItems?: number, maxItems?: number) => ({
  type: 'array',
  items,
  ...(minItems !== undefined ? { minItems } : {}),
  ...(maxItems !== undefined ? { maxItems } : {}),
});

/** The structured-output branches of a graphic, one per template (shared with `reel.note`). */
export function reelGraphicBranches(): Record<string, unknown>[] {
  const t = (id: string) => ({ type: 'string', enum: [id] });
  const item = (extra: Record<string, unknown> = {}, req: string[] = []) =>
    obj({ word: i, text: s, ...extra }, ['word', 'text', ...req]);
  return [
    obj({ template: t('headline'), title: s, kicker: s, sub: s, accent: s }, ['template', 'title']),
    obj(
      { template: t('list'), title: s, kicker: s, items: arr(item({ icon: s, brand: s }), 2, 5) },
      ['template', 'title', 'items'],
    ),
    obj({ template: t('stack'), label: s, items: arr(item({ brand: s }), 2, 5) }, [
      'template',
      'label',
      'items',
    ]),
    obj({ template: t('checklist'), kicker: s, items: arr(item({ value: s }), 2, 5) }, [
      'template',
      'items',
    ]),
    obj(
      {
        template: t('compare'),
        left: { type: 'string', maxLength: 14 },
        right: { type: 'string', maxLength: 14 },
        winner: { type: 'string', enum: ['left', 'right', 'none'] },
        leftIcon: s,
        rightIcon: s,
        leftBrand: s,
        rightBrand: s,
        items: arr(item(), 0, 3),
      },
      ['template', 'left', 'right', 'winner'],
    ),
    obj(
      { template: t('statement'), icon: s, strike: { type: 'boolean' }, items: arr(item(), 1, 4) },
      ['template', 'items'],
    ),
    obj(
      {
        template: t('counter'),
        value: n,
        label: s,
        prefix: sl(3),
        suffix: sl(4),
        decimals: i,
        kicker: sl(28),
        icon: s,
      },
      ['template', 'value', 'label'],
    ),
    obj({ template: t('progress'), title: s, icon: s, sub: s, task: s, doneTitle: s }, [
      'template',
      'title',
    ]),
    obj(
      {
        template: t('terminal'),
        title: s,
        items: arr(item({ kind: { type: 'string', enum: ['cmd', 'out', 'ok'] } }), 1, 5),
      },
      ['template', 'items'],
    ),
    obj(
      {
        template: t('chart'),
        kind: { type: 'string', enum: ['line', 'bars'] },
        title: s,
        unit: sl(8),
        items: arr(obj({ text: s, value: n }, ['text', 'value']), 2, 8),
      },
      ['template', 'kind', 'title', 'items'],
    ),
    obj(
      { template: t('browser'), url: sl(80), headline: s, sub: s, button: sl(24), strikeWord: i },
      ['template', 'url', 'headline'],
    ),
    obj({ template: t('flow'), items: arr(item({ icon: s, brand: s }), 2, 4) }, [
      'template',
      'items',
    ]),
    obj({ template: t('quote'), items: arr(item(), 1, 4), highlight: arr(s) }, [
      'template',
      'items',
    ]),
    obj({ template: t('logo'), brand: s, sub: s }, ['template', 'brand']),
    obj(
      {
        template: t('logos'),
        title: s,
        items: arr(obj({ word: i, brand: s }, ['word', 'brand']), 2, 6),
      },
      ['template', 'items'],
    ),
    obj(
      {
        template: t('image'),
        kind: { type: 'string', enum: ['photo', 'illustration'] },
        subject: sl(200),
        fit: { type: 'string', enum: ['frame', 'bleed'] },
        kicker: s,
        title: s,
        items: arr(item(), 0, 3),
      },
      ['template', 'kind', 'subject', 'fit'],
    ),
    obj({ template: t('website'), domain: s, headline: s, strikeWord: i }, ['template', 'domain']),
    obj({ template: t('punch'), text: s, top: s }, ['template', 'text']),
    obj({ template: t('cta'), verb: sl(14), keyword: sl(16) }, ['template', 'verb', 'keyword']),
    obj({ template: t('none') }, ['template']),
  ];
}

/**
 * The director's structured-output schema. Vertex rejects it outright (400 INVALID_ARGUMENT, every
 * Gemini model, checked live 2026-11-23) once the `scenes` or `brands` arrays carry minItems or
 * maxItems on top of the string caps: the grammar gets too big. So the scene count is enforced by
 * `checkReelDirect` (one repair round), not by the schema. Keep new constraints off this schema
 * unless `scripts/schema-live-check.ts` passes against the real endpoint.
 */
export function reelDirectJsonSchema(): Record<string, unknown> {
  const branches = reelGraphicBranches();
  return obj(
    {
      story: obj({ topic: sl(300), arc: arr(sl(200), undefined, 12), motif: sl(300) }, [
        'topic',
        'arc',
        'motif',
      ]),
      footage: obj(
        {
          kind: { type: 'string', enum: ['talking-head', 'screen', 'scene'] },
          faces: arr(obj({ frame: i, x: i, y: i }, ['frame', 'x', 'y'])),
        },
        ['kind', 'faces'],
      ),
      music: sl(300),
      hook: sl(60),
      brands: arr(obj({ name: sl(60), domain: sl(80) }, ['name'])),
      scenes: arr(
        obj(
          {
            fromWord: i,
            toWord: i,
            layout: { type: 'string', enum: ['split', 'card', 'full', 'speaker'] },
            beat: { type: 'string', enum: [...BEATS] },
            carry: { type: 'boolean' },
            tag: sl(28),
            bg: { type: 'string', enum: ['light', 'cream', 'dark'] },
            graphic: { anyOf: branches },
          },
          ['fromWord', 'toWord', 'layout', 'beat', 'graphic'],
        ),
      ),
    },
    ['story', 'footage', 'music', 'hook', 'brands', 'scenes'],
  );
}

/** The longest stretch one directed scene may cover on a reel under 20 s (above, 45 % of it). */
export const REEL_SCENE_MAX_MS = 9000;

/** The fewest scenes a reel of this length should get (none required for a very short one). */
export function minReelScenes(
  input: Pick<ReelDirectInput, 'words' | 'durationMs'>,
): number | undefined {
  if (input.words.length < 12 || input.durationMs < 8000) return undefined;
  return Math.max(2, Math.ceil(input.durationMs / 7000));
}

/**
 * Coverage check on a director answer (found in the AI soak: answers with 1–3 scenes for a 34 s
 * reel, one graphic stretched over 28 s). The answer needs at least `minReelScenes` distinct scene
 * starts, and no scene (measured from its first word to the next scene's first word, the last one
 * to the end of the reel) may run longer than `REEL_SCENE_MAX_MS` or 45 % of the reel, whichever is
 * larger. A failure triggers the router's repair with this message.
 */
export function checkReelDirect(out: ReelDirectOutput, input: ReelDirectInput): string | null {
  const n = input.words.length;
  if (n < 12 || input.durationMs < 8000) return null;
  const starts = [...new Set(out.scenes.map((s) => Math.max(0, Math.min(n - 1, s.fromWord))))].sort(
    (a, b) => a - b,
  );
  if (starts.length === 0) return 'No scenes. Direct the whole transcript.';
  const at = (i: number) => input.words[i]![1];
  const limit = Math.max(REEL_SCENE_MAX_MS, Math.round(input.durationMs * 0.45));
  const minScenes = minReelScenes(input) ?? 1;
  if (starts.length < minScenes)
    return `Only ${starts.length} scenes for a ${Math.round(input.durationMs / 1000)} s reel: direct the whole transcript, word 0 to word ${n - 1}, in at least ${minScenes} scenes of about 1.5–5 s each.`;
  for (let k = 0; k < starts.length; k++) {
    const from = at(starts[k]!);
    const to = k + 1 < starts.length ? at(starts[k + 1]!) : input.durationMs;
    if (to - from > limit)
      return `The scene starting at word ${starts[k]} runs ${Math.round((to - from) / 1000)} s. Split it: no scene may run longer than ${Math.round(limit / 1000)} s, and the scenes must continue to word ${n - 1}.`;
  }
  return null;
}

export function reelTemplateDirectTask(): TaskDef<ReelDirectInput, ReelDirectOutput> {
  return {
    id: 'reel.direct',
    input: ReelDirectInputSchema,
    output: ReelDirectOutputSchema as unknown as z.ZodType<ReelDirectOutput>,
    mode: () => 'ONLY_IN_CLOUD',
    // The strongest model (spec 27 R4.1): it writes the story and reads the keyframes.
    model: (cfg) => cfg.modelStrong || APP_CONFIG_DEFAULTS.modelStrong,
    system: REEL_DIRECT_SYSTEM_V3,
    prompt: (i) =>
      reelDirectPromptV3({ ...i, frameTimesMs: i.frames.map((f) => f.atMs), brief: i.brief }),
    mediaList: (i) =>
      i.frames.length > 0
        ? i.frames.map((f) => ({ mimeType: 'image/jpeg' as const, base64: f.base64 }))
        : undefined,
    jsonSchema: reelDirectJsonSchema,
    cloudCost: () => 3,
    cloudFallback: false,
    maxRepairs: 1,
    promptVersion: REEL_DIRECT_PROMPT_VERSION,
    thinking: 'MEDIUM',
    maxOutputTokens: 16384,
    check: checkReelDirect,
  };
}

// ----- mapping ----------------------------------------------------------------------------------

const ICONS = new Set<string>(REEL_ICONS);
const iconOr = (name: string | undefined, dflt: string): string =>
  name && ICONS.has(name.trim()) ? name.trim() : dflt;
export const SPEAKER_TEMPLATES: ReadonlySet<string> = new Set(['punch', 'cta', 'none']);

/** Models sometimes URL-encode symbols ("%2B" for "+"). */
function unescape(s: string | undefined): string {
  const t = s ?? '';
  try {
    return /%[0-9A-F]{2}/i.test(t) ? decodeURIComponent(t) : t;
  } catch {
    return t;
  }
}

/** Brand name (lowercase) → domain, for logo requests. */
export type Brands = ReadonlyMap<string, string | undefined>;
/** A logo request for a spoken brand (its domain helps the fallback icon). */
function logoMedia(brand: string | undefined, brands: Brands): ReelMedia | undefined {
  const name = cut(brand, 60);
  if (!name) return undefined;
  const domain = brands.get(name.toLowerCase());
  return { kind: 'logo', query: domain ? `${name}|${domain}` : name };
}

/** Builds the template content for one directed scene; null when it can't be made valid. */
export function contentFor(
  g: Graphic,
  at: (word: number | undefined, i: number) => number,
  brands: Brands,
): ReelTemplate | null {
  const items =
    'items' in g
      ? // `logos` items carry a brand and no text: never read a missing text.
        (g.items as z.infer<typeof Item>[]).filter((x) => (x.text ?? '').trim().length > 0)
      : [];
  const cued = <T>(max: number, f: (x: z.infer<typeof Item>, i: number) => T) =>
    items.slice(0, max).map(f);
  let c: unknown;
  switch (g.template) {
    case 'headline':
      c = {
        template: 'headline',
        kicker: cut(g.kicker, 40),
        title: cut(g.title, 60),
        sub: cut(g.sub, 80),
        accent: cut(g.accent, 40),
      };
      break;
    case 'list':
      c = {
        template: 'list',
        kicker: cut(g.kicker, 40),
        title: cut(g.title, 40),
        items: cued(5, (x, i) => ({
          at: at(x.word, i),
          icon: iconOr(x.icon, 'check'),
          text: cut(x.text, 28),
          media: logoMedia(x.brand, brands),
        })),
      };
      break;
    case 'stack':
      c = {
        template: 'stack',
        label: cut(g.label, 44),
        words: cued(5, (x, i) => ({
          at: at(x.word, i),
          text: cut(x.text, 18),
          media: logoMedia(x.brand, brands),
        })),
      };
      break;
    case 'checklist':
      c = {
        template: 'checklist',
        kicker: cut(g.kicker, 40),
        rows: cued(5, (x, i) => ({
          at: at(x.word, i),
          label: cut(x.text, 18),
          value: x.value === undefined ? undefined : cut(String(x.value), 14),
        })),
      };
      break;
    case 'compare':
      c = {
        template: 'compare',
        left: cut(g.left, 14),
        right: cut(g.right, 14),
        winner: g.winner,
        leftIcon: g.leftIcon ? iconOr(g.leftIcon, 'x') : undefined,
        rightIcon: g.rightIcon ? iconOr(g.rightIcon, 'check') : undefined,
        leftMedia: logoMedia(g.leftBrand, brands),
        rightMedia: logoMedia(g.rightBrand, brands),
        rows: cued(3, (x, i) => ({ at: at(x.word, i), text: cut(x.text, 18) })),
      };
      break;
    case 'statement': {
      c = {
        template: 'statement',
        icon: g.icon ? iconOr(g.icon, 'sparkles') : undefined,
        strike: g.strike ?? false,
        lines: cued(4, (x, i) => ({ at: at(x.word, i), text: cut(x.text, 22) })),
      };
      break;
    }
    case 'counter':
      c = {
        template: 'counter',
        value: g.value,
        decimals: Math.max(0, Math.min(2, Math.round(g.decimals ?? 0))),
        // Inner spaces matter ("$", " tools"); outer ones are noise (" tools? ").
        prefix: unescape(g.prefix).trimStart().slice(0, 4),
        suffix: unescape(g.suffix).trimEnd().slice(0, 8),
        label: cut(g.label, 36),
        kicker: cut(g.kicker, 36),
        icon: g.icon ? iconOr(g.icon, 'trending-up') : undefined,
      };
      break;
    case 'progress':
      c = {
        template: 'progress',
        icon: iconOr(g.icon, 'download'),
        title: cut(g.title, 32),
        sub: cut(g.sub, 36),
        task: cut(g.task, 32),
        doneTitle: cut(g.doneTitle, 32),
      };
      break;
    case 'terminal':
      c = {
        template: 'terminal',
        title: cut(g.title, 30),
        lines: cued(5, (x, i) => ({
          at: at(x.word, i),
          text: cut(x.text, 48),
          kind: x.kind === 'out' || x.kind === 'ok' ? x.kind : 'cmd',
        })),
      };
      break;
    case 'chart': {
      const points = items
        .slice(0, 8)
        .map((x) => ({
          label: cut(x.text, 10),
          value:
            typeof x.value === 'number'
              ? x.value
              : Number(String(x.value ?? '').replace(/[^0-9.-]/g, '')),
        }))
        .filter((p) => p.label && Number.isFinite(p.value));
      c = {
        template: 'chart',
        kind: g.kind,
        title: cut(g.title, 36),
        unit: (g.unit ?? '').slice(0, 6),
        points,
      };
      break;
    }
    case 'browser':
      c = {
        template: 'browser',
        url: cut(g.url, 32) ?? 'example.com',
        headline: cut(g.headline, 48),
        sub: cut(g.sub, 80),
        button: cut(g.button, 18),
        strikeAt: g.strikeWord === undefined ? undefined : at(g.strikeWord, 0),
      };
      break;
    case 'flow':
      c = {
        template: 'flow',
        steps: cued(4, (x, i) => ({
          at: at(x.word, i),
          icon: iconOr(x.icon, 'arrow-right'),
          text: cut(x.text, 16),
          media: logoMedia(x.brand, brands),
        })),
      };
      break;
    case 'quote':
      c = {
        template: 'quote',
        lines: cued(4, (x, i) => ({ at: at(x.word, i), text: cut(x.text, 60) })),
        highlight: (g.highlight ?? [])
          .slice(0, 4)
          .map((h) => h.slice(0, 24))
          .filter(Boolean),
      };
      break;
    case 'logo':
      c = {
        template: 'logo',
        media: logoMedia(g.brand, brands),
        name: cut(g.brand, 28),
        sub: cut(g.sub, 48),
      };
      break;
    case 'logos':
      c = {
        template: 'logos',
        title: cut(g.title, 40),
        items: g.items
          .filter((x) => x.brand.trim())
          .slice(0, 6)
          .map((x, i) => ({
            at: at(x.word, i),
            media: logoMedia(x.brand, brands),
            name: cut(x.brand, 20),
          })),
      };
      break;
    case 'image': {
      const subject = cut(g.subject, 120);
      c = {
        template: 'image',
        media: subject ? { kind: g.kind, query: subject } : undefined,
        fit: g.fit,
        kicker: cut(g.kicker, 40),
        title: cut(g.title, 40),
        words: cued(3, (x, i) => ({ at: at(x.word, i), text: cut(x.text, 24) })),
      };
      break;
    }
    case 'website': {
      const domain = cut(
        g.domain
          .trim()
          .replace(/^https?:\/\//, '')
          .replace(/\/$/, ''),
        60,
      );
      c = {
        template: 'website',
        media: domain ? { kind: 'screenshot', query: domain } : undefined,
        url: cut(domain?.replace(/^www\./, ''), 40),
        headline: cut(g.headline, 48),
        strikeAt: g.strikeWord === undefined ? undefined : at(g.strikeWord, 0),
      };
      break;
    }
    case 'punch':
      c = { template: 'punch', top: cut(g.top, 28), text: cut(g.text, 28) };
      break;
    case 'cta':
      c = { template: 'cta', verb: cut(g.verb, 14) ?? 'Comment', keyword: cut(g.keyword, 16) };
      break;
    case 'none':
      c = { template: 'none' };
      break;
  }
  const parsed = ReelTemplateSchema.safeParse(stripUndefined(c));
  return parsed.success ? parsed.data : null;
}

export function stripUndefined(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripUndefined);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = stripUndefined(x);
    return out;
  }
  return v;
}

/** The item array of a content, whatever the template calls it. */
const ITEM_KEYS = ['items', 'words', 'rows', 'lines', 'steps'] as const;
function itemsOf(c: ReelTemplate): { key: string; arr: { at: number; text?: string }[] } | null {
  for (const key of ITEM_KEYS) {
    const arr = (c as Record<string, unknown>)[key];
    if (Array.isArray(arr)) return { key, arr: arr as { at: number; text?: string }[] };
  }
  return null;
}
const itemText = (x: Record<string, unknown>): string =>
  String(x['text'] ?? x['label'] ?? x['name'] ?? '').toLowerCase();

/**
 * A carried scene keeps every item the carried graphic already showed (spec 26 R1.5): items the
 * model left out are added back with their original cues, so the list returns exactly as it was.
 */
function mergeCarry(prev: ReelTemplate, next: ReelTemplate): ReelTemplate {
  const a = itemsOf(prev);
  const b = itemsOf(next);
  if (!a || !b || a.key !== b.key) return next;
  // Items already shown keep their original cue (they render revealed); new ones keep theirs.
  const prevAt = new Map(a.arr.map((x) => [itemText(x as Record<string, unknown>), x.at]));
  const have = new Set(b.arr.map((x) => itemText(x as Record<string, unknown>)));
  const kept = a.arr.filter((x) => !have.has(itemText(x as Record<string, unknown>)));
  const recued = b.arr.map((x) => {
    const at = prevAt.get(itemText(x as Record<string, unknown>));
    return at === undefined ? x : { ...x, at };
  });
  const merged = [...kept, ...recued].sort((x, y) => x.at - y.at);
  const max = next.template === 'logos' ? 6 : next.template === 'flow' ? 4 : 5;
  const candidate = { ...next, [b.key]: merged.slice(-max) };
  const parsed = ReelTemplateSchema.safeParse(candidate);
  return parsed.success ? parsed.data : next;
}

/**
 * Maps the model's answer onto a valid, tiled `ReelPlan`. Scenes that cannot be made valid fall
 * back to the speaker (graphic layouts) so the timeline stays covered.
 */
export function toReelPlan(
  raw: ReelDirectOutput,
  words: readonly ReelWord[],
  durationMs: number,
  look: ReelLook,
  by: string,
  /** Reel-clock times of the keyframes the director saw (face keys are placed on them). */
  frameTimesMs: readonly number[] = [],
): ReelPlan {
  const out = ReelDirectOutputSchema.parse(raw);
  const n = words.length;
  const wStart = (i: number) => words[Math.max(0, Math.min(n - 1, i))]!.startMs;
  const brands: Brands = new Map(
    out.brands.map((b) => [b.name.trim().toLowerCase(), cut(b.domain, 60)]),
  );
  const ordered = [...out.scenes].sort((a, b) => a.fromWord - b.fromWord);
  const scenes: ReelScene[] = [];
  // The last graphic of each template: a carried scene continues it, even with other scenes in
  // between (a list that keeps coming back and growing).
  const lastOf = new Map<string, ReelScene>();
  ordered.forEach((d: DirectedScene, k) => {
    const from = Math.max(0, Math.min(n - 1, d.fromWord));
    const next = ordered[k + 1];
    const startMs = k === 0 ? 0 : wStart(from);
    const endMs = next ? wStart(Math.max(from + 1, next.fromWord)) : durationMs;
    if (endMs <= startMs) return;
    const span = Math.max(1, endMs - startMs);
    const lastGraphic = lastOf.get(d.graphic.template) ?? null;
    const carry = d.carry === true && lastGraphic !== null;
    // A cue: the item's word time, or spread evenly when the word is missing or out of range.
    // Carried items may point back at earlier words (they render already revealed).
    const lo = carry && lastGraphic ? lastGraphic.startMs : startMs;
    const at = (w: number | undefined, i: number): number => {
      if (w !== undefined && w >= 0 && w < n && w <= Math.max(from, d.toWord) + 2) {
        const ms = wStart(w);
        if (ms >= lo) return Math.min(endMs - 200, ms);
      }
      return Math.round(startMs + 250 + i * Math.min(700, span / 5));
    };
    let layout = d.layout;
    let content = contentFor(d.graphic, at, brands);
    if (content && carry && lastGraphic) content = mergeCarry(lastGraphic.content, content);
    if (content && SPEAKER_TEMPLATES.has(content.template)) layout = 'speaker';
    else if (layout === 'speaker') layout = look === 'mono' ? 'split' : 'card';
    if (!content) {
      content = { template: 'none' };
      layout = 'speaker';
    }
    if (look === 'mono' && layout === 'card') layout = 'split';
    if (look === 'cream' && layout === 'split') layout = 'card';
    const candidate = {
      id: `r${k + 1}`,
      startMs,
      endMs,
      layout,
      ...(d.bg ? { bg: look === 'mono' && d.bg === 'cream' ? 'light' : d.bg } : {}),
      ...(look === 'mono' && d.tag && layout !== 'speaker' ? { tag: cut(d.tag, 28) } : {}),
      ...(carry && layout !== 'speaker' ? { carry: true } : {}),
      content,
    };
    const parsed = ReelSceneSchema.safeParse(stripUndefined(candidate));
    if (parsed.success) {
      scenes.push(parsed.data);
      if (parsed.data.layout !== 'speaker') lastOf.set(parsed.data.content.template, parsed.data);
    }
  });
  if (scenes.length === 0) throw new Error('reel.direct: no usable scenes');
  const hook = cut(out.hook, 48);
  const footage = footageFor(out.footage, frameTimesMs);
  const music = cut(out.music, 300);
  return ReelPlanSchema.parse({
    v: 1,
    look,
    ...(footage ? { footage, focus: medianFocus(footage.focus) } : {}),
    ...(music && music.length >= 3 ? { music: { brief: music } } : {}),
    captions: true,
    ...(hook && look === 'mono' ? { hook } : {}),
    scenes: tileReelScenes(scenes, durationMs),
    by,
  });
}

/** Face keys on the reel clock from the director's per-keyframe answer (spec 27 R2.1). */
function footageFor(
  f: z.infer<typeof FootageSchema> | undefined,
  frameTimesMs: readonly number[],
): ReelPlan['footage'] {
  if (!f) return undefined;
  const byTime = new Map<number, { atMs: number; x: number; y: number }>();
  for (const face of f.faces) {
    const atMs = frameTimesMs[face.frame];
    if (atMs === undefined) continue;
    byTime.set(atMs, {
      atMs: Math.round(atMs),
      x: Math.min(1, Math.max(0, face.x / 1000)),
      y: Math.min(1, Math.max(0, face.y / 1000)),
    });
  }
  const focus = [...byTime.values()].sort((a, b) => a.atMs - b.atMs);
  // No face anywhere means there is no talking head to crop to.
  const kind =
    f.kind === 'talking-head' && focus.length === 0 && frameTimesMs.length > 0 ? 'scene' : f.kind;
  return { kind, focus };
}

function medianFocus(keys: readonly { x: number; y: number }[]): { x: number; y: number } {
  if (keys.length === 0) return { x: 0.5, y: 0.32 };
  const mid = (v: number[]) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
  return { x: mid(keys.map((k) => k.x)), y: mid(keys.map((k) => k.y)) };
}

/**
 * Directs a reel: the cloud director when a router is available, otherwise (or on any failure)
 * the deterministic `autoReelPlan`. Returns the plan and where it came from.
 */
export async function directReel(
  router: Router | null,
  params: {
    look: ReelLook;
    words: readonly ReelWord[];
    durationMs: number;
    model?: string;
    /** Keyframes of the footage on the reel clock (spec 27 R2.1). */
    frames?: readonly { atMs: number; base64: string }[];
    /** The creator's recipe and choices, as text for the director (spec 39 R3.5). */
    brief?: ReelDirectBrief;
    /** The creator's choices, enforced on the plan from either director (spec 39 R5.7). */
    choices?: EditChoices;
  },
): Promise<{ plan: ReelPlan; source: 'cloud' | 'auto'; error?: string }> {
  const { look, words, durationMs, choices } = params;
  const frames = (params.frames ?? []).slice(0, 6);
  const enforce = (plan: ReelPlan): ReelPlan =>
    choices ? applyEditChoices(plan, words, durationMs, choices) : plan;
  const auto = (): ReelPlan => enforce(autoReelPlan(words, durationMs, look));
  if (!router || words.length < 4) return { plan: auto(), source: 'auto' };
  try {
    const input: ReelDirectInput = {
      look,
      durationMs,
      words: words.slice(0, 2500).map((w, i) => [i, w.startMs, w.text] as [number, number, string]),
      frames: frames.map((f) => ({ atMs: Math.max(0, Math.round(f.atMs)), base64: f.base64 })),
      ...(params.brief ? { brief: params.brief } : {}),
    };
    const res = await router.run(reelTemplateDirectTask(), input, {
      mode: 'ONLY_IN_CLOUD',
      ...(params.model ? { model: params.model } : {}),
    });
    return {
      plan: enforce(
        toReelPlan(
          res.output,
          words,
          durationMs,
          look,
          res.model,
          input.frames.map((f) => f.atMs),
        ),
      ),
      source: 'cloud',
    };
  } catch (e) {
    return {
      plan: auto(),
      source: 'auto',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
