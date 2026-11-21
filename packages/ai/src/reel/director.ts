// `reel.direct` (spec 25 R3.1): one cloud call turns the transcript into a reel plan. The model
// answers in word indices with flat, lenient fields; `toReelPlan` maps them onto the strict
// `ReelPlan`, repairing or dropping what does not fit, so one odd scene never sinks the plan.
import {
  REEL_ICONS,
  ReelPlanSchema,
  ReelSceneSchema,
  ReelTemplateSchema,
  tileReelScenes,
  type ReelLook,
  type ReelPlan,
  type ReelScene,
  type ReelTemplate,
  type ReelWord,
} from '@motionpop/schemas';
import { z } from 'zod';
import type { Router, TaskDef } from '../router';
import { autoReelPlan } from './auto';
import { REEL_DIRECT_PROMPT_VERSION, REEL_DIRECT_SYSTEM_V1, reelDirectPromptV1 } from './prompt';

export const REEL_TEMPLATE_IDS = [
  'headline',
  'list',
  'stack',
  'checklist',
  'compare',
  'statement',
  'counter',
  'progress',
  'terminal',
  'chart',
  'browser',
  'flow',
  'quote',
  'punch',
  'cta',
  'none',
] as const;

export const ReelDirectInputSchema = z.object({
  look: z.enum(['mono', 'cream']),
  durationMs: z.number().int().positive(),
  /** [wordIndex, startMs, text] */
  words: z
    .array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.string()]))
    .min(1)
    .max(2500),
});
export type ReelDirectInput = z.infer<typeof ReelDirectInputSchema>;

const str = z.string().optional();
const num = z.number().optional();
const ItemSchema = z.object({
  word: z.number().int().optional(),
  text: z.string().default(''),
  icon: str,
  value: z.union([z.string(), z.number()]).optional(),
  kind: str,
});
const DirectedSceneSchema = z.object({
  fromWord: z.number().int(),
  toWord: z.number().int(),
  layout: z.enum(['split', 'card', 'full', 'speaker']),
  template: z.enum(REEL_TEMPLATE_IDS),
  bg: z.enum(['light', 'cream', 'dark']).optional(),
  tag: str,
  kicker: str,
  title: str,
  sub: str,
  accent: str,
  label: str,
  text: str,
  top: str,
  verb: str,
  keyword: str,
  url: str,
  headline: str,
  button: str,
  unit: str,
  prefix: str,
  suffix: str,
  value: num,
  decimals: num,
  icon: str,
  strike: z.boolean().optional(),
  winner: z.enum(['left', 'right', 'none']).optional(),
  left: str,
  right: str,
  leftIcon: str,
  rightIcon: str,
  kind: str,
  strikeWord: z.number().int().optional(),
  highlight: z.array(z.string()).optional(),
  items: z.array(ItemSchema).optional(),
});
export const ReelDirectOutputSchema = z.object({
  hook: z.string().optional(),
  scenes: z.array(DirectedSceneSchema).min(1).max(80),
});
export type ReelDirectOutput = z.infer<typeof ReelDirectOutputSchema>;
type DirectedScene = z.infer<typeof DirectedSceneSchema>;

/** Gemini structured-output schema (flat; every prop optional except the scene frame). */
export function reelDirectJsonSchema(): Record<string, unknown> {
  const s = { type: 'string' };
  const n = { type: 'number' };
  const item = {
    type: 'object',
    properties: { word: { type: 'integer' }, text: s, icon: s, value: n, kind: s },
    required: ['text'],
  };
  return {
    type: 'object',
    properties: {
      hook: s,
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            fromWord: { type: 'integer' },
            toWord: { type: 'integer' },
            layout: { type: 'string', enum: ['split', 'card', 'full', 'speaker'] },
            template: { type: 'string', enum: [...REEL_TEMPLATE_IDS] },
            bg: { type: 'string', enum: ['light', 'cream', 'dark'] },
            tag: s,
            kicker: s,
            title: s,
            sub: s,
            accent: s,
            label: s,
            text: s,
            top: s,
            verb: s,
            keyword: s,
            url: s,
            headline: s,
            button: s,
            unit: s,
            prefix: s,
            suffix: s,
            value: n,
            decimals: { type: 'integer' },
            icon: s,
            strike: { type: 'boolean' },
            winner: { type: 'string', enum: ['left', 'right', 'none'] },
            left: s,
            right: s,
            leftIcon: s,
            rightIcon: s,
            strikeWord: { type: 'integer' },
            highlight: { type: 'array', items: s },
            items: { type: 'array', items: item },
          },
          required: ['fromWord', 'toWord', 'layout', 'template'],
        },
      },
    },
    required: ['hook', 'scenes'],
  };
}

export function reelTemplateDirectTask(): TaskDef<ReelDirectInput, ReelDirectOutput> {
  return {
    id: 'reel.direct',
    input: ReelDirectInputSchema,
    output: ReelDirectOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    model: () => 'gemini-3.8-flash',
    system: REEL_DIRECT_SYSTEM_V1,
    prompt: (i) => reelDirectPromptV1(i),
    jsonSchema: reelDirectJsonSchema,
    cloudCost: () => 3,
    cloudFallback: false,
    maxRepairs: 1,
    promptVersion: REEL_DIRECT_PROMPT_VERSION,
    thinking: 'LOW',
    maxOutputTokens: 8192,
  };
}

// ----- mapping ----------------------------------------------------------------------------------

const ICONS = new Set<string>(REEL_ICONS);
const iconOr = (name: string | undefined, dflt: string): string =>
  name && ICONS.has(name.trim()) ? name.trim() : dflt;
const cut = (s: string | undefined, max: number): string | undefined => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  if (t.length <= max) return t;
  // Cut on a word boundary.
  const sliced = t.slice(0, max + 1);
  const sp = sliced.lastIndexOf(' ');
  return (sp > max * 0.5 ? sliced.slice(0, sp) : t.slice(0, max)).trim();
};

const SPEAKER_TEMPLATES = new Set(['punch', 'cta', 'none']);

/** Builds the template content for one directed scene; null when it can't be made valid. */
function contentFor(
  d: DirectedScene,
  at: (word: number | undefined, i: number) => number,
): ReelTemplate | null {
  const items = (d.items ?? []).filter((x) => x.text.trim().length > 0);
  const cued = <T>(max: number, f: (x: (typeof items)[number], i: number) => T) =>
    items.slice(0, max).map(f);
  let c: unknown;
  switch (d.template) {
    case 'headline':
      c = {
        template: 'headline',
        kicker: cut(d.kicker, 40),
        title: cut(d.title ?? d.text ?? d.headline, 60),
        sub: cut(d.sub, 80),
        accent: cut(d.accent, 40),
      };
      break;
    case 'list':
      c = {
        template: 'list',
        kicker: cut(d.kicker, 40),
        title: cut(d.title ?? d.label, 40),
        items: cued(5, (x, i) => ({
          at: at(x.word, i),
          icon: iconOr(x.icon, 'check'),
          text: cut(x.text, 28),
        })),
      };
      break;
    case 'stack':
      c = {
        template: 'stack',
        label: cut(d.label ?? d.title ?? d.kicker, 44),
        words: cued(5, (x, i) => ({ at: at(x.word, i), text: cut(x.text, 18) })),
      };
      break;
    case 'checklist':
      c = {
        template: 'checklist',
        kicker: cut(d.kicker ?? d.title, 40),
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
        left: cut(d.left, 14),
        right: cut(d.right, 14),
        winner: d.winner ?? 'right',
        leftIcon: d.leftIcon ? iconOr(d.leftIcon, 'x') : undefined,
        rightIcon: d.rightIcon ? iconOr(d.rightIcon, 'check') : undefined,
        rows: cued(3, (x, i) => ({ at: at(x.word, i), text: cut(x.text, 18) })),
      };
      break;
    case 'statement': {
      const lines = items.length
        ? cued(4, (x, i) => ({ at: at(x.word, i), text: cut(x.text, 22) }))
        : [{ at: at(undefined, 0), text: cut(d.text ?? d.title, 22) }];
      c = {
        template: 'statement',
        icon: d.icon ? iconOr(d.icon, 'sparkles') : undefined,
        strike: d.strike ?? false,
        lines,
      };
      break;
    }
    case 'counter':
      c = {
        template: 'counter',
        value: d.value,
        decimals: Math.max(0, Math.min(2, Math.round(d.decimals ?? 0))),
        prefix: (d.prefix ?? '').slice(0, 4),
        suffix: (d.suffix ?? '').slice(0, 8),
        label: cut(d.label ?? d.title ?? d.text, 36),
        kicker: cut(d.kicker, 36),
        icon: d.icon ? iconOr(d.icon, 'trending-up') : undefined,
      };
      break;
    case 'progress':
      c = {
        template: 'progress',
        icon: iconOr(d.icon, 'download'),
        title: cut(d.title ?? d.text, 32),
        sub: cut(d.sub, 36),
        task: cut(d.label ?? d.kicker, 32),
        doneTitle: cut(d.headline ?? d.top, 32),
      };
      break;
    case 'terminal':
      c = {
        template: 'terminal',
        title: cut(d.title, 30),
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
        kind: d.kind === 'bars' ? 'bars' : 'line',
        title: cut(d.title, 36),
        unit: (d.unit ?? '').slice(0, 6),
        points,
      };
      break;
    }
    case 'browser':
      c = {
        template: 'browser',
        url: cut(d.url, 32) ?? 'example.com',
        headline: cut(d.headline ?? d.title, 48),
        sub: cut(d.sub, 80),
        button: cut(d.button, 18),
        strikeAt: d.strikeWord === undefined ? undefined : at(d.strikeWord, 0),
      };
      break;
    case 'flow':
      c = {
        template: 'flow',
        steps: cued(4, (x, i) => ({
          at: at(x.word, i),
          icon: iconOr(x.icon, 'arrow-right'),
          text: cut(x.text, 16),
        })),
      };
      break;
    case 'quote':
      c = {
        template: 'quote',
        lines: cued(4, (x, i) => ({ at: at(x.word, i), text: cut(x.text, 60) })),
        highlight: (d.highlight ?? [])
          .slice(0, 4)
          .map((h) => h.slice(0, 24))
          .filter(Boolean),
      };
      break;
    case 'punch':
      c = { template: 'punch', top: cut(d.top ?? d.kicker, 28), text: cut(d.text ?? d.title, 28) };
      break;
    case 'cta':
      c = {
        template: 'cta',
        verb: cut(d.verb, 14) ?? 'Comment',
        keyword: cut(d.keyword ?? d.text, 16),
      };
      break;
    case 'none':
      c = { template: 'none' };
      break;
  }
  const parsed = ReelTemplateSchema.safeParse(stripUndefined(c));
  return parsed.success ? parsed.data : null;
}

function stripUndefined(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripUndefined);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = stripUndefined(x);
    return out;
  }
  return v;
}

/**
 * Maps the model's answer onto a valid, tiled `ReelPlan`. Scenes that cannot be made valid fall
 * back to the speaker (graphic layouts) so the timeline stays covered.
 */
export function toReelPlan(
  out: ReelDirectOutput,
  words: readonly ReelWord[],
  durationMs: number,
  look: ReelLook,
  by: string,
): ReelPlan {
  const n = words.length;
  const wStart = (i: number) => words[Math.max(0, Math.min(n - 1, i))]!.startMs;
  const ordered = [...out.scenes].sort((a, b) => a.fromWord - b.fromWord);
  const scenes: ReelScene[] = [];
  ordered.forEach((d, k) => {
    const from = Math.max(0, Math.min(n - 1, d.fromWord));
    const next = ordered[k + 1];
    const startMs = k === 0 ? 0 : wStart(from);
    const endMs = next ? wStart(Math.max(from + 1, next.fromWord)) : durationMs;
    if (endMs <= startMs) return;
    const span = Math.max(1, endMs - startMs);
    // A cue: the item's word time, or spread evenly when the word is missing or out of range.
    const at = (word: number | undefined, i: number): number => {
      if (word !== undefined && word >= from && word <= Math.max(from, d.toWord) + 2 && word < n) {
        return Math.max(startMs, Math.min(endMs - 200, wStart(word)));
      }
      return Math.round(startMs + 250 + i * Math.min(700, span / 5));
    };
    let layout = d.layout;
    let content = contentFor(d, at);
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
      content,
    };
    const parsed = ReelSceneSchema.safeParse(stripUndefined(candidate));
    if (parsed.success) scenes.push(parsed.data);
  });
  if (scenes.length === 0) throw new Error('reel.direct: no usable scenes');
  const hook = cut(out.hook, 48);
  return ReelPlanSchema.parse({
    v: 1,
    look,
    captions: true,
    ...(hook && look === 'mono' ? { hook } : {}),
    scenes: tileReelScenes(scenes, durationMs),
    by,
  });
}

/**
 * Directs a reel: the cloud director when a router is available, otherwise (or on any failure)
 * the deterministic `autoReelPlan`. Returns the plan and where it came from.
 */
export async function directReel(
  router: Router | null,
  params: { look: ReelLook; words: readonly ReelWord[]; durationMs: number; model?: string },
): Promise<{ plan: ReelPlan; source: 'cloud' | 'auto'; error?: string }> {
  const { look, words, durationMs } = params;
  if (!router || words.length < 4)
    return { plan: autoReelPlan(words, durationMs, look), source: 'auto' };
  try {
    const input: ReelDirectInput = {
      look,
      durationMs,
      words: words.slice(0, 2500).map((w, i) => [i, w.startMs, w.text] as [number, number, string]),
    };
    const res = await router.run(reelTemplateDirectTask(), input, {
      mode: 'ONLY_IN_CLOUD',
      ...(params.model ? { model: params.model } : {}),
    });
    return { plan: toReelPlan(res.output, words, durationMs, look, res.model), source: 'cloud' };
  } catch (e) {
    return {
      plan: autoReelPlan(words, durationMs, look),
      source: 'auto',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
