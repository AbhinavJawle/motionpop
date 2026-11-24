/**
 * `reel.note.local` — compact, multimodal on-device Gemini Nano handler for talking-head reel
 * frame notes. Runs via Firebase AI Logic (`ONLY_ON_DEVICE`, 0 credits, works offline) for direct
 * edits (text, numbers, typos, tag, background, layout, hook, captions) and explicitly returns
 * `action: 'escalate'` whenever a full template swap, new illustration, or custom motion graphic
 * is needed (which the user can trigger with one click to cloud `reel.note` / `reel.compose`).
 */
import {
  ReelBgSchema,
  ReelLayoutSchema,
  ReelSceneSchema,
  type ReelScene,
} from '@motionpop/schemas';
import { z } from 'zod';
import type { Router, TaskDef } from '../router';
import { findWordRun, type ReelNoteContext } from './note';

export const REEL_NOTE_LOCAL_PROMPT_VERSION = 'v2';

export const ReelNoteLocalInputSchema = z.object({
  look: z.enum(['mono', 'cream']),
  noteText: z.string().trim().min(1).max(300),
  sceneTemplate: z.string().max(32),
  sceneLayout: ReelLayoutSchema,
  sceneBg: ReelBgSchema.optional(),
  sceneTag: z.string().max(40).optional(),
  sceneTexts: z.array(z.string().max(120)).max(12),
  sceneValue: z.number().finite().optional(),
  caption: z.string().max(120).optional(),
  hook: z.string().max(80).optional(),
  /** Optional cropped JPEG of the circled region (Nano supports JPEG input). */
  image: z.string().min(16).optional(),
});
export type ReelNoteLocalInput = z.infer<typeof ReelNoteLocalInputSchema>;

export const ReelNoteLocalFieldSchema = z.enum([
  'title',
  'kicker',
  'sub',
  'tag',
  'bg',
  'layout',
  'hook',
  'value',
  'replace',
  'caption',
]);
export type ReelNoteLocalField = z.infer<typeof ReelNoteLocalFieldSchema>;

/**
 * Flat depth-1 output schema sized for Chrome Gemini Nano's constrained decoding:
 * 2 required properties + 5 optional properties (strictly <= MAX_OPTIONAL = 6), max enum = 10,
 * and numeric `maxLength` on every free-text string (spec 39 AI QA).
 */
export const ReelNoteLocalOutputSchema = z.object({
  action: z.enum(['edit', 'escalate']),
  message: z.string().max(140),
  field: ReelNoteLocalFieldSchema.optional(),
  to: z.string().max(80).optional(),
  from: z.string().max(80).optional(),
  bg: ReelBgSchema.optional(),
  layout: ReelLayoutSchema.optional(),
});
export type ReelNoteLocalOutput = z.infer<typeof ReelNoteLocalOutputSchema>;

export const REEL_NOTE_LOCAL_SYSTEM_V1 = `You edit one vertical video scene on-device from a user's short note (and optional cropped frame image).
Reply with ONLY flat JSON matching the schema.

Return action="edit" for direct single-scene tweaks:
- Main headline/title/text: field="title", to="New text"
- Kicker/label/top/CTA verb: field="kicker", to="New label"
- Subtitle/suffix: field="sub", to="New subtitle"
- Corner tag: field="tag", to="SHORT TAG"
- Counter number: field="value", to="98" (or "98%" / "$3.5M")
- Replace exact visible text: field="replace", from="exact old text", to="new text"
- Fix a misheard caption word: field="caption", from="wrong word", to="right word"
- Hook banner (only if Hook is shown): field="hook", to="New hook"
- Background color: bg="light" | "cream" | "dark" (can be combined with a field edit)
- Layout: layout="split" | "card" | "full" | "speaker" (can be combined with a field edit)

Return action="escalate" (hand to cloud frontier model) for:
- A brand-new motion graphic, custom animation, different chart/template type, new photo/logo/illustration, or complex multi-part redesign.
- Anything you cannot cleanly represent with these fields.

Rules:
- Never invent numbers or facts not in the user's note.
- Keep message under 10 words.`;

export function reelNoteLocalPromptV1(i: ReelNoteLocalInput): string {
  const lines = [
    `Look: ${i.look} | Template: ${i.sceneTemplate} | Layout: ${i.sceneLayout}${i.sceneBg ? ` | Bg: ${i.sceneBg}` : ''}`,
    ...(i.sceneTag ? [`Tag: "${i.sceneTag}"`] : []),
    ...(i.sceneValue !== undefined ? [`Counter value: ${i.sceneValue}`] : []),
    ...(i.sceneTexts.length
      ? [`Visible texts: ${i.sceneTexts.map((t) => `"${t}"`).join(', ')}`]
      : []),
    ...(i.hook !== undefined ? [`Hook: "${i.hook}"`] : []),
    ...(i.caption ? [`Caption: "${i.caption}"`] : []),
    `User note: "${i.noteText}"`,
  ];
  return lines.join('\n');
}

export const reelNoteLocalJsonSchema = (): Record<string, unknown> => ({
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['edit', 'escalate'] },
    message: { type: 'string', maxLength: 140 },
    field: {
      type: 'string',
      enum: [
        'title',
        'kicker',
        'sub',
        'tag',
        'bg',
        'layout',
        'hook',
        'value',
        'replace',
        'caption',
      ],
    },
    to: { type: 'string', maxLength: 80 },
    from: { type: 'string', maxLength: 80 },
    bg: { type: 'string', enum: ['light', 'cream', 'dark'] },
    layout: { type: 'string', enum: ['split', 'card', 'full', 'speaker'] },
  },
  required: ['action', 'message'],
});

export function reelNoteLocalTask(): TaskDef<ReelNoteLocalInput, ReelNoteLocalOutput> {
  return {
    id: 'reel.note.local',
    input: ReelNoteLocalInputSchema,
    output: ReelNoteLocalOutputSchema,
    mode: () => 'ONLY_ON_DEVICE',
    model: (cfg) => cfg.modelFast,
    system: REEL_NOTE_LOCAL_SYSTEM_V1,
    prompt: reelNoteLocalPromptV1,
    jsonSchema: reelNoteLocalJsonSchema,
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 1,
    promptVersion: REEL_NOTE_LOCAL_PROMPT_VERSION,
    maxOutputTokens: 512,
    media: (i) => (i.image ? { mimeType: 'image/jpeg', base64: i.image } : undefined),
  };
}

/** Collect short visible strings from a reel scene content object (excluding code/media keys). */
const SKIP_KEYS = new Set([
  'template',
  'icon',
  'asset',
  'src',
  'html',
  'css',
  'script',
  'kind',
  'at',
  'url',
]);

export function extractSceneTexts(content: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (out.length >= 12 || depth > 3) return;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t && !out.includes(t)) out.push(t.slice(0, 120));
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (!SKIP_KEYS.has(k)) walk(x, depth + 1);
      }
    }
  };
  walk(content, 0);
  return out;
}

/** Build the compact input for `reel.note.local` from a scene context. */
export function reelNoteLocalInput(
  ctx: ReelNoteContext,
  p: {
    noteText: string;
    caption?: string | undefined;
    hook?: string | undefined;
    image?: string | undefined;
  },
): ReelNoteLocalInput {
  const { scene } = ctx;
  const value =
    scene.content.template === 'counter' && typeof scene.content.value === 'number'
      ? scene.content.value
      : undefined;
  return ReelNoteLocalInputSchema.parse({
    look: ctx.look,
    noteText: p.noteText.slice(0, 300),
    sceneTemplate: scene.content.template.slice(0, 32),
    sceneLayout: scene.layout,
    ...(scene.bg ? { sceneBg: scene.bg } : {}),
    ...(scene.tag ? { sceneTag: scene.tag.slice(0, 40) } : {}),
    sceneTexts: extractSceneTexts(scene.content),
    ...(value !== undefined ? { sceneValue: value } : {}),
    ...(p.caption ? { caption: p.caption.slice(0, 120) } : {}),
    ...(p.hook !== undefined ? { hook: p.hook.slice(0, 80) } : {}),
    ...(p.image && p.image.length >= 16 ? { image: p.image } : {}),
  });
}

function replaceTextInObject(
  obj: unknown,
  from: string,
  to: string,
  depth = 0,
): { next: unknown; hit: boolean } {
  if (depth > 4) return { next: obj, hit: false };
  if (typeof obj === 'string') {
    const idx = obj.toLowerCase().indexOf(from.toLowerCase());
    if (idx === -1) return { next: obj, hit: false };
    return { next: obj.slice(0, idx) + to + obj.slice(idx + from.length), hit: true };
  }
  if (Array.isArray(obj)) {
    let hit = false;
    const next = obj.map((item) => {
      const r = replaceTextInObject(item, from, to, depth + 1);
      if (r.hit) hit = true;
      return r.next;
    });
    return { next, hit };
  }
  if (obj && typeof obj === 'object') {
    let hit = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SKIP_KEYS.has(k)) {
        out[k] = v;
        continue;
      }
      const r = replaceTextInObject(v, from, to, depth + 1);
      if (r.hit) hit = true;
      out[k] = r.next;
    }
    return { next: out, hit };
  }
  return { next: obj, hit: false };
}

/** Parses `"98"`, `"98%"`, `"$3.5M"`, `"-12.5"` into counter parts; null if not a valid number. */
function parseCounterValue(raw: string): { value: number; prefix?: string; suffix?: string } | null {
  const m = /^\s*([^\d+-]{0,6})([+-]?\d[\d,]*(?:\.\d+)?)\s*([^\d\s]{0,8})\s*$/.exec(raw);
  if (!m?.[2]) return null;
  const num = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(num) || Math.abs(num) > 1e12) return null;
  const prefix = m[1]?.trim() || undefined;
  const suffix = m[3]?.trim() || undefined;
  return {
    value: num,
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
  };
}

export interface AppliedLocalReelNote {
  changed: boolean;
  escalate: boolean;
  scene: ReelScene;
  hook?: string;
  captions: { find: string; replace: string }[];
  message: string;
}

const CUSTOM_CONTENT_FIELDS = new Set<ReelNoteLocalField>([
  'title',
  'kicker',
  'sub',
  'value',
  'replace',
]);

/**
 * Applies a validated `reel.note.local` answer onto `ctx.scene`, verifying the resulting scene
 * against `ReelSceneSchema`. Any invalid or empty edit signals `escalate: true` so the caller can
 * offer cloud escalation without ever corrupting the scene or silently spending credits.
 */
export function applyReelNoteLocal(
  ctx: ReelNoteContext,
  out: ReelNoteLocalOutput,
  opts: { hook?: string | undefined } = {},
): AppliedLocalReelNote {
  const msg = out.message.trim() || 'Updated on-device';
  if (out.action === 'escalate') {
    return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
  }
  // Custom scenes hold arbitrary HTML/CSS/JS; escalate any content edit rather than mutating code.
  if (
    ctx.scene.content.template === 'custom' &&
    out.field !== undefined &&
    CUSTOM_CONTENT_FIELDS.has(out.field)
  ) {
    return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
  }

  let changed = false;
  let nextScene: ReelScene = { ...ctx.scene };
  const to = out.to?.trim() ?? '';
  const from = out.from?.trim() ?? '';

  // Background change (either via `bg` or `field: 'bg'`).
  const wantedBg =
    out.bg ?? (out.field === 'bg' ? ReelBgSchema.safeParse(to.toLowerCase()).data : undefined);
  if (wantedBg !== undefined && wantedBg !== nextScene.bg) {
    nextScene = { ...nextScene, bg: wantedBg };
    changed = true;
  }

  // Layout change (either via `layout` or `field: 'layout'`), guarding speaker-only templates.
  const wantedLayout =
    out.layout ??
    (out.field === 'layout' ? ReelLayoutSchema.safeParse(to.toLowerCase()).data : undefined);
  if (wantedLayout !== undefined && wantedLayout !== nextScene.layout) {
    const speakerOnly = ['punch', 'cta', 'none'].includes(nextScene.content.template);
    if (!speakerOnly && wantedLayout !== 'speaker') {
      nextScene = { ...nextScene, layout: wantedLayout };
      changed = true;
    }
  }

  // Corner tag.
  if (out.field === 'tag' && to && to !== nextScene.tag) {
    nextScene = { ...nextScene, tag: to.slice(0, 28) };
    changed = true;
  }

  // Template content edits.
  let nextContent: Record<string, unknown> = {
    ...(nextScene.content as Record<string, unknown>),
  };

  if (out.field === 'title' && to) {
    const key = (['title', 'headline', 'text', 'keyword', 'label'] as const).find(
      (k) => k in nextContent,
    );
    if (key && nextContent[key] !== to) {
      nextContent = { ...nextContent, [key]: to };
      changed = true;
    }
  } else if (out.field === 'kicker' && to) {
    const key = (['kicker', 'label', 'top', 'verb'] as const).find((k) => k in nextContent);
    if (key && nextContent[key] !== to) {
      nextContent = { ...nextContent, [key]: to };
      changed = true;
    }
  } else if (out.field === 'sub' && to) {
    const key = (['sub', 'suffix', 'body'] as const).find((k) => k in nextContent);
    if (key && nextContent[key] !== to) {
      nextContent = { ...nextContent, [key]: to };
      changed = true;
    }
  } else if (out.field === 'value' && to && nextScene.content.template === 'counter') {
    const parsedVal = parseCounterValue(to);
    if (parsedVal) {
      const next: Record<string, unknown> = {
        ...nextContent,
        value: parsedVal.value,
        decimals: Number.isInteger(parsedVal.value) ? 0 : 1,
      };
      if (parsedVal.prefix !== undefined) next.prefix = parsedVal.prefix;
      if (parsedVal.suffix !== undefined) next.suffix = parsedVal.suffix;
      if (
        next.value !== nextContent.value ||
        next.prefix !== nextContent.prefix ||
        next.suffix !== nextContent.suffix
      ) {
        nextContent = next;
        changed = true;
      }
    }
  } else if (out.field === 'replace' && from && out.to !== undefined) {
    const r = replaceTextInObject(nextContent, from, to);
    if (r.hit && r.next && typeof r.next === 'object') {
      nextContent = r.next as Record<string, unknown>;
      changed = true;
    }
  }

  nextScene = { ...nextScene, content: nextContent as ReelScene['content'] };
  const parsed = ReelSceneSchema.safeParse(nextScene);
  if (!parsed.success) {
    return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
  }
  nextScene = parsed.data;

  // Hook text on scene 1 (only when the reel shows a hook).
  let nextHook: string | undefined;
  if (out.field === 'hook' && opts.hook !== undefined && to && to !== opts.hook) {
    nextHook = to.slice(0, 60);
    changed = true;
  }

  // Caption word fix.
  const captions: { find: string; replace: string }[] = [];
  if (out.field === 'caption' && from && to && from.toLowerCase() !== to.toLowerCase()) {
    if (findWordRun(ctx.words, from)) {
      captions.push({ find: from, replace: to });
      changed = true;
    }
  }

  return {
    changed,
    escalate: !changed,
    scene: nextScene,
    ...(nextHook !== undefined ? { hook: nextHook } : {}),
    captions,
    message: msg,
  };
}

/** Runs the on-device reel note task (never reaches the cloud). */
export async function runReelNoteLocal(router: Router, input: ReelNoteLocalInput) {
  return router.run(reelNoteLocalTask(), input, { mode: 'ONLY_ON_DEVICE', allowCloud: false });
}
