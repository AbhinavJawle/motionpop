/**
 * `reel.note` (spec 29): a frame note on a talking-head reel. The creator pauses, circles
 * something on the frame and writes what to change; the model answers with the scene's new data
 * in the director's own language (`Graphic`: word indices, brand names, picture subjects), which
 * `contentFor` maps onto the strict template schema with the same repairs the director gets
 * (length limits, icons, logo requests). Cues of items that stay keep their exact times, pictures
 * that stay keep their stored asset, and layout rules are enforced in code.
 */
import {
  APP_CONFIG_DEFAULTS,
  REEL_ICONS,
  ReelSceneSchema,
  costOf,
  reelMediaKey,
  stableJson,
  type ReelLook,
  type ReelMedia,
  type ReelScene,
  type ReelTemplate,
  type ReelWord,
} from '@motionpop/schemas';
import { z } from 'zod';
import type { Router, TaskDef } from '../router';
import {
  GraphicSchema,
  SPEAKER_TEMPLATES,
  contentFor,
  cut,
  reelGraphicBranches,
  stripUndefined,
  type Brands,
  type Graphic,
} from './director';
import { REEL_LAYOUTS_AND_TEMPLATES } from './prompt';

export const REEL_NOTE_PROMPT_VERSION = 'v3';

const LAYOUTS = ['split', 'card', 'pip', 'full', 'speaker'] as const;
const PARTS = ['graphic', 'speaker', 'caption', 'tag', 'hook'] as const;
export type ReelNotePart = (typeof PARTS)[number];
const Unit = z.number().min(0).max(1);

export const ReelNoteInputSchema = z.object({
  look: z.enum(['mono', 'cream']),
  note: z.object({
    text: z.string().trim().min(1).max(300),
    region: z.object({
      x: Unit,
      y: Unit,
      w: z.number().min(0.01).max(1),
      h: z.number().min(0.01).max(1),
    }),
  }),
  /** What lies under the circle, read from the preview. */
  target: z.object({
    parts: z.array(z.enum(PARTS)).max(5),
    texts: z.array(z.string().max(80)).max(8),
    /** What each circled picture shows (its request: brand, subject or domain). */
    pictures: z.array(z.string().max(120)).max(4),
  }),
  scene: z.object({
    /** 1-based position and the count, for the model's bearings. */
    n: z.number().int().positive(),
    of: z.number().int().positive(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    layout: z.enum(LAYOUTS),
    bg: z.enum(['light', 'cream', 'dark']).optional(),
    tag: z.string().max(60).optional(),
    graphic: z.record(z.string(), z.unknown()),
  }),
  /** [global word index, startMs, text] around the scene. */
  words: z
    .array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.string()]))
    .max(160),
  /** The caption line on screen at the note's moment, if any. */
  caption: z.string().max(120).optional(),
  /** The hook title band, when this is the first scene and the reel has one. */
  hook: z.string().max(80).optional(),
  /** JPEG of the circled area (base64), when frame capture worked. */
  image: z.string().max(400_000).optional(),
  /** Aspect ratio of this project (`16:9` / `1:1` / `9:16`). */
  format: z.enum(['16:9', '9:16', '1:1']).optional(),
  /** True for graphics-only / voiceover-only projects with no speaker video. */
  noVideo: z.boolean().optional(),
  /** Visual craft & custom SKILL.md guidance for edits and compose briefs. */
  styleDirection: z.string().max(2400).optional(),
});
export type ReelNoteInput = z.infer<typeof ReelNoteInputSchema>;

export const ReelNoteOutputSchema = z.object({
  action: z.enum(['edit', 'compose', 'none']),
  message: z.string().max(300).catch('').default(''),
  /** action "compose": what the new motion graphic shows and how it moves (spec 30). */
  compose: z
    .string()
    .transform((v) => v.slice(0, 1200))
    .optional(),
  layout: z.enum(LAYOUTS).optional(),
  bg: z.enum(['light', 'cream', 'dark']).optional(),
  /** "" removes the tag. */
  tag: z.string().max(80).optional(),
  /** "" removes the hook band. */
  hook: z.string().max(120).optional(),
  graphic: GraphicSchema.optional(),
  brands: z
    .array(z.object({ name: z.string().max(60), domain: z.string().max(80).optional() }))
    .max(8)
    .default([]),
  captions: z
    .array(
      z.object({
        find: z.string().trim().min(1).max(80),
        replace: z.string().trim().min(1).max(80),
      }),
    )
    .max(6)
    .default([]),
});
export type ReelNoteOutput = z.infer<typeof ReelNoteOutputSchema>;

// ----- scene → model language --------------------------------------------------------------------

/** The everything a note needs to map the model's answer back onto the scene. */
export interface ReelNoteContext {
  scene: ReelScene;
  look: ReelLook;
  words: readonly ReelWord[];
  graphic: Graphic;
  /** Brand (lowercase) → domain, from the scene's logo requests. */
  brands: Map<string, string | undefined>;
  /** Word index → the exact cue it stood for, so items that stay keep their time. */
  cueOf: Map<number, number>;
  /** The scene's graphic is AI-written code (spec 30): `graphic` is then `none`. */
  custom?: { title: string; brief: string };
}

const brandOf = (m: ReelMedia | undefined, brands: Map<string, string | undefined>) => {
  if (!m || m.kind !== 'logo') return undefined;
  const [name, domain] = m.query.split('|');
  const n = (name ?? '').trim();
  if (!n) return undefined;
  if (!brands.has(n.toLowerCase())) brands.set(n.toLowerCase(), domain?.trim() || undefined);
  return n;
};

/** The scene's content in the director's language (the inverse of `contentFor`). */
export function reelNoteContext(
  scene: ReelScene,
  words: readonly ReelWord[],
  look: ReelLook,
): ReelNoteContext {
  const brands = new Map<string, string | undefined>();
  const cueOf = new Map<number, number>();
  // The word being spoken at a cue: the last one that started by then.
  const wordAt = (ms: number | undefined): number | undefined => {
    if (ms === undefined || words.length === 0) return undefined;
    let k = 0;
    for (let i = 0; i < words.length; i++) {
      if (words[i]!.startMs <= ms + 1) k = i;
      else break;
    }
    if (!cueOf.has(k)) cueOf.set(k, ms);
    return k;
  };
  const c = scene.content;
  let g: Record<string, unknown>;
  switch (c.template) {
    case 'headline':
      g = { template: c.template, title: c.title, kicker: c.kicker, sub: c.sub, accent: c.accent };
      break;
    case 'list':
      g = {
        template: c.template,
        title: c.title,
        kicker: c.kicker,
        items: c.items.map((x) => ({
          word: wordAt(x.at),
          text: x.text,
          icon: x.icon,
          brand: brandOf(x.media, brands),
        })),
      };
      break;
    case 'stack':
      g = {
        template: c.template,
        label: c.label,
        items: c.words.map((x) => ({
          word: wordAt(x.at),
          text: x.text,
          brand: brandOf(x.media, brands),
        })),
      };
      break;
    case 'checklist':
      g = {
        template: c.template,
        kicker: c.kicker,
        items: c.rows.map((x) => ({ word: wordAt(x.at), text: x.label, value: x.value })),
      };
      break;
    case 'compare':
      g = {
        template: c.template,
        left: c.left,
        right: c.right,
        winner: c.winner,
        leftIcon: c.leftIcon,
        rightIcon: c.rightIcon,
        leftBrand: brandOf(c.leftMedia, brands),
        rightBrand: brandOf(c.rightMedia, brands),
        items: c.rows.map((x) => ({ word: wordAt(x.at), text: x.text })),
      };
      break;
    case 'statement':
      g = {
        template: c.template,
        icon: c.icon,
        strike: c.strike,
        items: c.lines.map((x) => ({ word: wordAt(x.at), text: x.text })),
      };
      break;
    case 'counter':
      g = {
        template: c.template,
        value: c.value,
        label: c.label,
        prefix: c.prefix || undefined,
        suffix: c.suffix || undefined,
        decimals: c.decimals || undefined,
        kicker: c.kicker,
        icon: c.icon,
      };
      break;
    case 'progress':
      g = {
        template: c.template,
        title: c.title,
        icon: c.icon,
        sub: c.sub,
        task: c.task,
        doneTitle: c.doneTitle,
      };
      break;
    case 'terminal':
      g = {
        template: c.template,
        title: c.title,
        items: c.lines.map((x) => ({ word: wordAt(x.at), text: x.text, kind: x.kind })),
      };
      break;
    case 'chart':
      g = {
        template: c.template,
        kind: c.kind,
        title: c.title,
        unit: c.unit || undefined,
        items: c.points.map((x) => ({ text: x.label, value: x.value })),
      };
      break;
    case 'browser':
      g = {
        template: c.template,
        url: c.url,
        headline: c.headline,
        sub: c.sub,
        button: c.button,
        strikeWord: wordAt(c.strikeAt),
      };
      break;
    case 'flow':
      g = {
        template: c.template,
        items: c.steps.map((x) => ({
          word: wordAt(x.at),
          text: x.text,
          icon: x.icon,
          brand: brandOf(x.media, brands),
        })),
      };
      break;
    case 'quote':
      g = {
        template: c.template,
        items: c.lines.map((x) => ({ word: wordAt(x.at), text: x.text })),
        highlight: c.highlight.length ? c.highlight : undefined,
      };
      break;
    case 'logo':
      g = { template: c.template, brand: brandOf(c.media, brands) ?? c.name, sub: c.sub };
      break;
    case 'logos':
      g = {
        template: c.template,
        title: c.title,
        items: c.items.map((x) => ({
          word: wordAt(x.at),
          brand: brandOf(x.media, brands) ?? x.name,
        })),
      };
      break;
    case 'image':
      g = {
        template: c.template,
        kind: c.media.kind === 'photo' ? 'photo' : 'illustration',
        subject: c.media.query,
        fit: c.fit,
        kicker: c.kicker,
        title: c.title,
        items: c.words.map((x) => ({ word: wordAt(x.at), text: x.text })),
      };
      break;
    case 'website':
      g = {
        template: c.template,
        domain: c.media.query,
        headline: c.headline,
        strikeWord: wordAt(c.strikeAt),
      };
      break;
    case 'clip':
      g = {
        template: c.template,
        clipId: c.clipId,
        clipStartMs: c.clipStartMs,
        fit: c.fit,
        focusX: c.focusX,
        focusY: c.focusY,
        zoom: c.zoom,
        label: c.label,
        audioMode: c.audioMode,
      };
      break;
    case 'punch':
      g = { template: c.template, text: c.text, top: c.top };
      break;
    case 'cta':
      g = { template: c.template, verb: c.verb, keyword: c.keyword };
      break;
    case 'none':
      g = { template: 'none' };
      break;
    case 'custom':
      g = { template: 'none' };
      break;
  }
  const graphic = GraphicSchema.parse(stripUndefined(g));
  return {
    scene,
    look,
    words,
    graphic,
    brands,
    cueOf,
    ...(c.template === 'custom' ? { custom: { title: c.title, brief: c.brief } } : {}),
  };
}

// ----- the model's answer → the scene --------------------------------------------------------------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Where a caption fix's words sit in `words` (consecutive, case and punctuation ignored). */
export function findWordRun(
  words: readonly { text: string }[],
  find: string,
  from = 0,
  to = words.length,
): { start: number; end: number } | null {
  const want = norm(find).split(' ').filter(Boolean);
  if (want.length === 0) return null;
  const toks = words.map((w) => norm(w.text));
  for (let i = Math.max(0, from); i < Math.min(to, words.length); i++) {
    // A word may hold several tokens ("mid-journey" → "mid journey"); match token by token.
    const got: string[] = [];
    let j = i;
    while (j < Math.min(to, words.length) && got.length < want.length) {
      got.push(...toks[j]!.split(' ').filter(Boolean));
      j++;
    }
    if (got.length === want.length && got.every((t, k) => t === want[k])) {
      return { start: i, end: j - 1 };
    }
  }
  return null;
}

function withAssets(content: ReelTemplate, assets: ReadonlyMap<string, string>): ReelTemplate {
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o['kind'] === 'string' && typeof o['query'] === 'string') {
        const a = assets.get(reelMediaKey(o as Pick<ReelMedia, 'kind' | 'query'>));
        return a ? { ...o, asset: a } : (({ asset: _drop, ...rest }) => rest)(o);
      }
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, visit(x)]));
    }
    return v;
  };
  return visit(content) as ReelTemplate;
}

function assetsOf(content: ReelTemplate): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o['kind'] === 'string' && typeof o['query'] === 'string') {
        if (typeof o['asset'] === 'string')
          out.set(reelMediaKey(o as Pick<ReelMedia, 'kind' | 'query'>), o['asset']);
      } else Object.values(o).forEach(visit);
    }
  };
  visit(content);
  return out;
}

/**
 * Models often leave out fields they meant to keep: the "brand" of an item they only retyped ("it's
 * Acme, not Acme Pro") or the kicker of a graphic whose label they changed. Dropping them would
 * take logos and text off the graphic, so a field the answer leaves out is carried over; an explicit
 * "" still removes it.
 * - Same template: every left-out scalar field (kicker, sub, icon, strikeWord…) is kept.
 * - Items (list, stack, flow): a left-out brand (and, same template, icon) comes from the old item
 *   with the same text, else the item on the same spoken word (or the same position when the count
 *   is unchanged) whose text shares a word with it. A wholly new name gets no old logo.
 * - Compare sides follow their text, so swapped sides swap their logos and icons.
 */
export function carryOver(old: Graphic, next: Graphic): Graphic {
  const related = (a: string, b: string) => {
    const ta = new Set(
      norm(a)
        .split(' ')
        .filter((w) => w.length > 1),
    );
    return norm(b)
      .split(' ')
      .some((w) => ta.has(w));
  };
  const same = old.template === next.template;
  const o = old as Record<string, unknown>;
  const out: Record<string, unknown> = { ...next };
  const SIDE = new Set(['leftBrand', 'rightBrand', 'leftIcon', 'rightIcon']);
  if (same)
    for (const [k, v] of Object.entries(o))
      if (
        out[k] === undefined &&
        !SIDE.has(k) &&
        ['string', 'number', 'boolean'].includes(typeof v)
      )
        out[k] = v;

  type It = { word?: number | undefined; text?: string; brand?: string | undefined; icon?: string };
  const itemsOf = (g: Graphic): It[] | undefined =>
    g.template === 'list' || g.template === 'stack' || g.template === 'flow'
      ? (g.items as It[])
      : undefined;
  const oldItems = itemsOf(old);
  const nextItems = itemsOf(next);
  if (oldItems && nextItems) {
    const sameCount = oldItems.length === nextItems.length;
    out['items'] = nextItems.map((x, i) => {
      if (x.brand !== undefined && (!same || x.icon !== undefined)) return x;
      const t = norm(x.text ?? '');
      const near = (c: It | undefined) =>
        c && related(c.text ?? '', x.text ?? '') ? c : undefined;
      const hit =
        (t && oldItems.find((c) => norm(c.text ?? '') === t)) ||
        (x.word !== undefined && near(oldItems.find((c) => c.word === x.word))) ||
        (sameCount ? near(oldItems[i]) : undefined);
      if (!hit) return x;
      return stripUndefined({
        ...x,
        brand: x.brand ?? hit.brand,
        icon: same ? (x.icon ?? hit.icon) : x.icon,
      });
    });
  }
  if (old.template === 'compare' && next.template === 'compare') {
    const side = <K extends 'Brand' | 'Icon'>(text: string, own: 'left' | 'right', kind: K) => {
      const t = norm(text);
      if (t && t === norm(old.left)) return old[`left${kind}`];
      if (t && t === norm(old.right)) return old[`right${kind}`];
      return related(old[own], text) ? old[`${own}${kind}`] : undefined;
    };
    out['leftBrand'] = next.leftBrand ?? side(next.left, 'left', 'Brand');
    out['rightBrand'] = next.rightBrand ?? side(next.right, 'right', 'Brand');
    out['leftIcon'] = next.leftIcon ?? side(next.left, 'left', 'Icon');
    out['rightIcon'] = next.rightIcon ?? side(next.right, 'right', 'Icon');
  }
  return stripUndefined(out) as Graphic;
}

export interface ReelNoteResult {
  scene: ReelScene;
  /** The new hook title; null removes it; undefined leaves it. */
  hook?: string | null;
  captions: { find: string; replace: string }[];
  /** False when the answer leaves the scene, the hook and the captions as they were. */
  changed: boolean;
  message: string;
  /**
   * The note needs a new motion graphic (spec 30): what it should be, and the layout it goes on.
   * The scene is then unchanged; the caller runs `reel.compose`.
   */
  compose?: { brief: string; layout: ReelScene['layout'] };
}

const ICONS = new Set<string>(REEL_ICONS);

/**
 * Applies the model's answer to the scene (pure). Throws when the graphic can't be made valid;
 * the caller treats that as a failed answer.
 */
export function applyReelNote(
  ctx: ReelNoteContext,
  out: ReelNoteOutput,
  opts: { hook?: string | undefined } = {},
): ReelNoteResult {
  const kept = applyOnce(ctx, out, opts, true);
  if (out.action !== 'edit' || !out.graphic || kept.hook !== undefined || kept.captions.length)
    return kept;
  // Left-out fields are kept (carryOver). When that leaves the scene as it was (compared with the
  // scene rebuilt as is, so a cleaned-up old value doesn't count), dropping them was the whole
  // edit ("remove this small text" answered by leaving the kicker out): apply it as sent.
  const asIs = applyOnce(
    ctx,
    { action: 'edit', message: '', graphic: ctx.graphic, brands: [], captions: [] },
    opts,
    true,
  );
  if (stableJson(kept.scene) !== stableJson(asIs.scene)) return kept;
  const dropped = applyOnce(ctx, out, opts, false);
  return dropped.changed ? dropped : kept;
}

function applyOnce(
  ctx: ReelNoteContext,
  out: ReelNoteOutput,
  opts: { hook?: string | undefined },
  keepLeftOut: boolean,
): ReelNoteResult {
  const { scene, look, words } = ctx;
  const message = cut(out.message, 200) ?? '';
  if (out.action === 'none') return { scene, captions: [], changed: false, message };
  if (out.action === 'compose') {
    let layout = out.layout ?? scene.layout;
    if (look === 'mono' && layout === 'card') layout = 'split';
    if (look === 'cream' && layout === 'split') layout = 'card';
    const brief = (out.compose ?? '').trim().slice(0, 1200);
    return { scene, captions: [], changed: false, message, compose: { brief, layout } };
  }

  const brands: Brands = new Map([
    ...ctx.brands,
    ...out.brands
      .filter((b) => b.name.trim())
      .map((b) => [b.name.trim().toLowerCase(), cut(b.domain, 60)] as const),
  ]);
  const n = words.length;
  const span = Math.max(1, scene.endMs - scene.startMs);
  const at = (w: number | undefined, i: number): number => {
    if (w !== undefined) {
      const kept = ctx.cueOf.get(w);
      if (kept !== undefined) return kept;
      if (w >= 0 && w < n) {
        const ms = words[w]!.startMs;
        if (ms >= scene.startMs && ms < scene.endMs) return Math.min(scene.endMs - 200, ms);
      }
    }
    return Math.round(scene.startMs + 250 + i * Math.min(700, span / 5));
  };

  let content = scene.content;
  // An AI-written graphic already composed as a speaker overlay (spec 30) stays there, unless the
  // answer asks for a graphic layout.
  const onSpeaker = (template: string) =>
    SPEAKER_TEMPLATES.has(template as never) ||
    (template === 'custom' &&
      scene.layout === 'speaker' &&
      (out.layout === undefined || out.layout === 'speaker'));
  // The speaker layout shows the speaker full-frame: a graphic the answer kept there goes
  // ("remove this graphic, just show me", "make me bigger" with only a layout change).
  const graphicOut =
    out.layout === 'speaker' &&
    !onSpeaker(out.graphic ? out.graphic.template : scene.content.template)
      ? ({ template: 'none' } as Graphic)
      : out.graphic;
  if (graphicOut) {
    const next = contentFor(
      keepLeftOut ? carryOver(ctx.graphic, graphicOut) : graphicOut,
      at,
      brands,
    );
    if (!next) throw new Error(`the "${graphicOut.template}" graphic is not valid`);
    content = withAssets(next, assetsOf(scene.content));
  }
  let layout = out.layout ?? scene.layout;
  if (onSpeaker(content.template)) layout = 'speaker';
  else if (layout === 'speaker') {
    // A graphic asked onto the speaker layout keeps its old graphic layout, or the look's.
    layout = scene.layout !== 'speaker' ? scene.layout : look === 'mono' ? 'split' : 'card';
  }
  if (look === 'mono' && layout === 'card') layout = 'split';
  if (look === 'cream' && layout === 'split') layout = 'card';

  const bg0 = out.bg ?? scene.bg;
  const bg = look === 'mono' && bg0 === 'cream' ? 'light' : bg0;
  const tag0 = out.tag === undefined ? scene.tag : cut(out.tag, 28);
  const tag = look === 'mono' && layout !== 'speaker' ? tag0 : undefined;
  const carry = scene.carry && layout !== 'speaker' && content.template === scene.content.template;

  const base: Partial<ReelScene> = { ...scene };
  delete base.tag;
  delete base.bg;
  delete base.carry;
  const candidate = {
    ...base,
    layout,
    ...(bg ? { bg } : {}),
    ...(tag ? { tag } : {}),
    ...(carry ? { carry: true } : {}),
    content,
  };
  const parsed = ReelSceneSchema.safeParse(stripUndefined(candidate));
  if (!parsed.success) throw new Error('the edited scene is not valid');

  let hook: string | null | undefined;
  if (out.hook !== undefined && opts.hook !== undefined) {
    const h = cut(out.hook, 48);
    hook = h ?? null;
    if (h === opts.hook) hook = undefined;
  }
  const captions = out.captions.filter((c) => c.find !== c.replace);
  const changed =
    stableJson(parsed.data) !== stableJson(scene) || hook !== undefined || captions.length > 0;
  return {
    scene: parsed.data,
    ...(hook !== undefined ? { hook } : {}),
    captions,
    changed,
    message,
  };
}

// ----- the task ----------------------------------------------------------------------------------

export const REEL_NOTE_LIMITS = `Character limits (shorter is better; longer text is cut): headline title 60, kicker 40, sub 80, accent 40 · list title 40, item 28 · stack label 44, item 18 · checklist item 18, value 14 · compare left/right 14, items 18 · statement items 22 · counter label 36, prefix 4, suffix 8 · progress title 32 · terminal items 48 · chart title 36, item label 10 · browser url 32, headline 48, button 18 · flow items 16 · quote items 60 · logo brand 28, sub 48 · logos brand 20 · image title 40, items 24, subject 120 · punch text 28, top 28 · cta verb 14, keyword 16 · tag 28 · hook 48.`;

export const REEL_NOTE_SYSTEM_V1 = `You fix one scene of a vertical (9:16) talking-head reel from the creator's note.
The creator paused the video, circled something on the frame and wrote what to change. They must get
exactly what they describe, and nothing else may change. You have two tools: edit the scene's data
(the reel's templates, animated by its standard motion), or have a new motion graphic written for
this scene (compose), which can show and move anything.

WHAT WAS CIRCLED
- "Circled" lists what lies under the circle: graphic (the graphic panel), speaker (the speaker's
  video), caption (the burned-in caption line), tag (the small label pinned on top of the panel,
  mono look), hook (the title band over the first seconds).
- "Texts in the circle" are the words drawn inside it; "Pictures in the circle" say what each picture
  shows. "this", "it", "here" in the note mean the circled thing.
- The text on screen may be shown in capitals (mono look) or sentence case (cream look); the data
  is what you edit.

THE SCENE
A scene has a layout, an optional background (light, cream, dark), an optional tag (mono only) and
one graphic: a template filled with short text.

${REEL_LAYOUTS_AND_TEMPLATES}
${REEL_NOTE_LIMITS}

HOW TO ANSWER
- action "edit": you changed something. Send ONLY what changes:
  - graphic: the new graphic (same template unless the note asks for another kind). Optional
    fields you leave out keep their current value, so send the required fields and what changes;
    "" removes a text field or a logo. Items: send the whole list, keep the same "word" index for
    items that stay (a left-out brand or icon is kept) and give new items the index of the word
    where they are spoken.
  - layout / bg / tag when the note asks for it: "make the graphic bigger" or "full screen" → full
    (or card); "darker" → dark. tag "" removes the tag.
  - The speaker layout shows the speaker full-frame and takes only punch, cta or none: "show me
    instead", "no graphic here", "make me bigger" → layout speaker AND graphic {template: none}
    (or a punch with a short line from the old graphic when the words should stay on screen).
  - hook: the new hook title, only when the hook band is circled or the note asks for it ("" removes it).
  - captions: when a caption word is wrong (misheard, a brand spelled wrong): "find" = the wrong
    words exactly as in the spoken words list, "replace" = the right text. Only fix transcription
    mistakes; never rewrite what was said.
  - brands: the official domain of any brand you name that is new to the scene.
- action "compose": the note asks for something the template data can't give: how things move
  ("snappier", "more dynamic", "animate the numbers"), visual punch/energy/style ("make it pop",
  "make it stand out", "looks flat", "boring", "more vibrant", "bolder", "better symbols", "more
  premium", "bigger icons", "different colours", "upgrade this"), positions, sizes, a custom
  diagram or visual, or anything else visual. Also EVERY change to an AI-written graphic (Graphic
  "custom") except its layout, background or tag, and except replacing it with a template the note
  names. Write "compose": a precise brief for the motion designer, 2–4 sentences: what the graphic
  shows (the exact on-screen words, kept from the current graphic unless the note changes them),
  how it should look and move to satisfy the note (bold hierarchy, contrast/accent color, depth,
  expressive icons/diagrams, and punchy choreography), and what must stay. Add "layout" only when
  the note asks for a bigger or different area. Never use compose for a plain text, logo or caption
  fix on a template graphic: that's an edit.
- action "none": ONLY when the note EXPLICITLY asks to alter something outside motion graphics (e.g.
  retouching the speaker's face/skin/clothes/lighting/camera lens, changing the speaker's voice,
  changing background music, or editing a different scene/cut). Whenever the scene has a graphic,
  general requests like "make it pop" or "make this better" ALWAYS refer to the graphic — use
  "compose", NEVER "none". Even on a speaker-only scene with template "none", an energy/visual note
  like "make it pop" should compose a punchy kinetic overlay graphic rather than refusing. When you
  genuinely must return "none", say why in "message" and what they can do instead in one short
  friendly sentence.
- message: one short sentence saying what you changed or will make, in plain words ("Changed the
  title to 'Work smarter'.", "Making it a snappier graphic with clearer icons.").

RULES
1. Do what the note says, literally. Change the circled thing, not its neighbours.
2. Keep text short and in the speaker's language and style. Fix spellings of names when asked.
3. Change the template only when the note asks for a different kind of graphic ("make this a chart",
   "show their logo", "turn this into a list"). When there are more items than a template takes,
   pick one that fits (logos takes 6 brands) or compose a graphic that holds them all. Never refuse
   a visual request: compose it.
4. Pictures: a different picture means a different brand (its real logo) or a new image subject/kind.
   Subjects are plain nouns, no text, no brands, no real people.
5. Never invent facts or numbers: take them from the note or the spoken words.
6. "remove this": the whole graphic → layout speaker with template none; one item of several → drop
   that item (if only one is left, show it alone: a logo for a brand, else a headline); a tag → tag "".
7. icon values must come from: ${REEL_ICONS.join(', ')}.

Return JSON only, matching the schema.`;

export function reelNotePromptV1(i: ReelNoteInput): string {
  const s = i.scene;
  const words = i.words.map(([idx, ms, text]) => `${idx}@${(ms / 1000).toFixed(2)} ${text}`);
  const custom = s.graphic['template'] === 'custom';
  const lines = [
    `Look: ${i.look}.${i.format ? ` Format: ${i.format}.` : ''}${i.noVideo ? ' NO SPEAKER VIDEO (full-frame graphic only — keep layout "full", never use speaker/punch/cta/none).' : ''} Scene ${s.n} of ${s.of}, ${(s.startMs / 1000).toFixed(2)}–${(s.endMs / 1000).toFixed(2)} s.`,
    `Layout: ${s.layout}. Background: ${s.bg ?? 'default'}. Tag: ${s.tag ? `"${s.tag}"` : 'none'}.`,
    custom
      ? `Graphic: custom (an AI-written motion graphic) "${String(s.graphic['title'])}": ${String(s.graphic['brief'])}`
      : `Graphic: ${JSON.stringify(s.graphic)}`,
    i.hook !== undefined ? `Hook band: "${i.hook}"` : null,
    i.caption ? `Caption on screen: "${i.caption}"` : null,
    i.styleDirection ? `\n${i.styleDirection}` : null,
    words.length ? `Spoken words around the scene (index@seconds word):` : null,
    ...words,
    ``,
    `Circled: ${i.target.parts.length ? i.target.parts.join(', ') : 'empty area'}.`,
    i.target.texts.length
      ? `Texts in the circle: ${i.target.texts.map((t) => `"${t}"`).join(', ')}`
      : null,
    i.target.pictures.length
      ? `Pictures in the circle: ${i.target.pictures.map((t) => `"${t}"`).join(', ')}`
      : null,
    i.image ? 'A picture of the circled area is attached.' : null,
    ``,
    `Note: "${i.note.text}"`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

export function reelNoteJsonSchema(): Record<string, unknown> {
  // Caps match the zod limits: an uncapped string can run away (spec 39 AI QA).
  const sl = (maxLength: number) => ({ type: 'string', maxLength });
  return {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['edit', 'compose', 'none'] },
      message: sl(300),
      compose: sl(1200),
      layout: { type: 'string', enum: [...LAYOUTS] },
      bg: { type: 'string', enum: ['light', 'cream', 'dark'] },
      tag: sl(80),
      hook: sl(120),
      graphic: { anyOf: reelGraphicBranches() },
      brands: {
        type: 'array',
        items: { type: 'object', properties: { name: sl(60), domain: sl(80) }, required: ['name'] },
      },
      captions: {
        type: 'array',
        items: {
          type: 'object',
          properties: { find: sl(80), replace: sl(80) },
          required: ['find', 'replace'],
        },
      },
    },
    required: ['action', 'message'],
  };
}

/** Why an answer can't be used, or null (fed back to the model for one repair). */
const NOT_TEXT = new Set([
  'template',
  'brand',
  'subject',
  'domain',
  'icon',
  'kind',
  'fit',
  'winner',
  'leftBrand',
  'rightBrand',
  'leftIcon',
  'rightIcon',
]);

/** Texts of the answer that the strict builder would shorten (`"Train my assistant" → "Train my assista"`). */
function cutTexts(g: Graphic, content: ReelTemplate): string[] {
  let back: Record<string, unknown>;
  try {
    const scene = { id: 'check', startMs: 0, endMs: 1000, layout: 'full', content } as ReelScene;
    back = reelNoteContext(scene, [], 'mono').graphic as Record<string, unknown>;
  } catch {
    return [];
  }
  const out: string[] = [];
  const cmp = (a: Record<string, unknown>, b: Record<string, unknown> | undefined) => {
    for (const [k, v] of Object.entries(a)) {
      if (typeof v !== 'string' || NOT_TEXT.has(k)) continue;
      const w = b?.[k];
      if (typeof w !== 'string') continue;
      const t = v.replace(/\s+/g, ' ').trim();
      if (norm(w) !== norm(t) && norm(t).includes(norm(w))) out.push(`"${t}" → "${w}"`);
    }
  };
  const ga = g as Record<string, unknown>;
  cmp(ga, back);
  const ia = ga['items'];
  const ib = back['items'];
  if (Array.isArray(ia) && Array.isArray(ib))
    ia.forEach((x, i) => cmp(x as Record<string, unknown>, ib[i] as Record<string, unknown>));
  return out;
}

export function checkReelNote(out: ReelNoteOutput, input: ReelNoteInput): string | null {
  if (out.action === 'none') return null;
  if (out.action === 'compose') {
    if ((out.compose ?? '').trim().length < 12)
      return 'action is "compose": write the brief for the new graphic in "compose" (2–4 sentences)';
    return null;
  }
  const nothing =
    !out.graphic &&
    !out.layout &&
    !out.bg &&
    out.tag === undefined &&
    out.hook === undefined &&
    out.captions.length === 0;
  if (nothing) return 'action is "edit" but the answer changes nothing: send the changed parts';
  if (out.graphic) {
    const content = contentFor(out.graphic, () => 0, new Map());
    if (!content)
      return `the "${out.graphic.template}" graphic is missing required fields or items (check the template's fields and item counts)`;
    if ('icon' in out.graphic && out.graphic.icon && !ICONS.has(out.graphic.icon.trim()))
      return `icon "${out.graphic.icon}" is not in the icon list`;
    const long = cutTexts(out.graphic, content);
    if (long.length)
      return `too long for its spot, so it would be cut: ${long.join('; ')}. Use shorter text that fits the character limits`;
  }
  const spoken = input.words.map(([, , text]) => ({ text }));
  for (const c of out.captions) {
    if (!findWordRun(spoken, c.find))
      return `caption fix "${c.find}" does not match the spoken words: copy the wrong words exactly`;
  }
  if (out.hook !== undefined && input.hook === undefined)
    return 'this scene has no hook band: leave "hook" out';
  return null;
}

export function reelNoteTask(): TaskDef<ReelNoteInput, ReelNoteOutput> {
  return {
    id: 'reel.note',
    input: ReelNoteInputSchema,
    output: ReelNoteOutputSchema as unknown as z.ZodType<ReelNoteOutput>,
    // Spec 30: the strong model in the cloud, so a note can ask for anything (founder, 2026-11-22:
    // "use frontier models for everything including the notes feature").
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelStrong,
    system: REEL_NOTE_SYSTEM_V1,
    prompt: reelNotePromptV1,
    jsonSchema: reelNoteJsonSchema,
    // Priced like a note on a graphic: the caller reserves the credit before the call.
    cloudCost: () => costOf('edit', 1, APP_CONFIG_DEFAULTS),
    cloudFallback: false,
    maxRepairs: 1,
    promptVersion: REEL_NOTE_PROMPT_VERSION,
    thinking: 'LOW',
    maxOutputTokens: 8192,
    media: (i) => (i.image ? { mimeType: 'image/jpeg', base64: i.image } : undefined),
    check: checkReelNote,
  };
}

/** The input for a note on `scene`, from its context and what the preview showed. */
export function reelNoteInput(
  ctx: ReelNoteContext,
  p: {
    sceneIndex: number;
    sceneCount: number;
    note: ReelNoteInput['note'];
    target: ReelNoteInput['target'];
    caption?: string | undefined;
    hook?: string | undefined;
    image?: string | undefined;
    format?: '16:9' | '9:16' | '1:1' | undefined;
    noVideo?: boolean | undefined;
    styleDirection?: string | undefined;
  },
): ReelNoteInput {
  const { scene, words } = ctx;
  const around = words
    .map((w, i) => [i, w.startMs, w.text] as [number, number, string])
    .filter(([, ms]) => ms >= scene.startMs - 1500 && ms < scene.endMs + 600)
    .slice(0, 160);
  return ReelNoteInputSchema.parse({
    look: ctx.look,
    note: p.note,
    target: {
      parts: p.target.parts.slice(0, 5),
      texts: p.target.texts.slice(0, 8).map((t) => t.slice(0, 80)),
      pictures: p.target.pictures.slice(0, 4).map((t) => t.slice(0, 120)),
    },
    scene: {
      n: p.sceneIndex + 1,
      of: Math.max(p.sceneCount, p.sceneIndex + 1),
      startMs: scene.startMs,
      endMs: scene.endMs,
      layout: scene.layout,
      ...(scene.bg ? { bg: scene.bg } : {}),
      ...(scene.tag ? { tag: scene.tag } : {}),
      graphic: ctx.custom ? { template: 'custom', ...ctx.custom } : ctx.graphic,
    },
    words: around,
    ...(p.caption ? { caption: p.caption.slice(0, 120) } : {}),
    ...(p.hook !== undefined ? { hook: p.hook.slice(0, 80) } : {}),
    ...(p.image ? { image: p.image } : {}),
    ...(p.format ? { format: p.format } : {}),
    ...(p.noVideo ? { noVideo: true } : {}),
    ...(p.styleDirection ? { styleDirection: p.styleDirection.slice(0, 2400) } : {}),
  });
}

/** Runs the note. Throws on any failure (the caller refunds and reports). */
export async function runReelNote(router: Router, input: ReelNoteInput) {
  return router.run(reelNoteTask(), input, { mode: 'ONLY_IN_CLOUD', allowCloud: false });
}
