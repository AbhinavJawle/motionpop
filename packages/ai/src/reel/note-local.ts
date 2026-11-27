/**
 * `reel.note.local` — compact, multimodal on-device Gemini Nano handler for talking-head reel
 * frame notes. Runs via Firebase AI Logic / Chrome Prompt API (`ONLY_ON_DEVICE`, 0 credits, works
 * offline) across all 20 built-in reel templates: removals, text/number/caption/hook/tag edits,
 * list/item add & remove, icon picks, template-native style toggles (chart bars/line, compare
 * winner/swap, strike, image/clip fit/zoom/audio, headline accent), background/layout switches,
 * and swaps between the 13 text/data templates. Explicitly escalates custom HTML/JS animations,
 * new photos/logos/screenshots, and full visual redesigns to Qwen / Cloud.
 */
import {
  REEL_ICONS,
  ReelBgSchema,
  ReelLayoutSchema,
  ReelSceneSchema,
  type ReelScene,
} from '@motionpop/schemas';
import { z } from 'zod';
import type { Router, TaskDef } from '../router';
import { findWordRun, type ReelNoteContext } from './note';
import { cut } from './text';

export const REEL_NOTE_LOCAL_PROMPT_VERSION = 'v4';

export const ReelNoteLocalInputSchema = z.object({
  look: z.enum(['mono', 'cream']),
  noteText: z.string().trim().min(1).max(300),
  sceneTemplate: z.string().max(32),
  sceneLayout: ReelLayoutSchema,
  sceneBg: ReelBgSchema.optional(),
  sceneTag: z.string().max(40).optional(),
  sceneTexts: z.array(z.string().max(120)).max(12),
  sceneValue: z.number().finite().optional(),
  circledParts: z.array(z.enum(['graphic', 'speaker', 'caption', 'tag', 'hook'])).max(5).optional(),
  caption: z.string().max(120).optional(),
  hook: z.string().max(80).optional(),
  /** Optional cropped JPEG of the circled region (Nano supports JPEG input). */
  image: z.string().min(16).optional(),
});
export type ReelNoteLocalInput = z.infer<typeof ReelNoteLocalInputSchema>;

export const ReelNoteLocalFieldSchema = z.enum([
  'remove',
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
  'add_item',
  'remove_item',
  'icon',
  'style',
  'swap',
]);
export type ReelNoteLocalField = z.infer<typeof ReelNoteLocalFieldSchema>;

/** Built-in text/data templates Nano can cleanly swap into (never custom code or fetched media). */
export const ReelNoteLocalSwapTemplateSchema = z.enum([
  'headline',
  'counter',
  'punch',
  'cta',
  'list',
  'checklist',
  'compare',
  'statement',
  'quote',
  'progress',
  'terminal',
  'chart',
  'flow',
]);
export type ReelNoteLocalSwapTemplate = z.infer<typeof ReelNoteLocalSwapTemplateSchema>;

/**
 * Flat depth-1 output schema sized for Chrome Gemini Nano's constrained decoding:
 * 2 required properties + 6 optional properties (strictly <= MAX_OPTIONAL = 6), max enum = 16,
 * and numeric `maxLength` on every free-text string (spec 39 AI QA).
 */
export const ReelNoteLocalOutputSchema = z.object({
  action: z.enum(['edit', 'escalate']),
  message: z.string().max(140),
  field: ReelNoteLocalFieldSchema.optional(),
  to: z.string().max(160).optional(),
  from: z.string().max(80).optional(),
  bg: ReelBgSchema.optional(),
  layout: ReelLayoutSchema.optional(),
  template: ReelNoteLocalSwapTemplateSchema.optional(),
});
export type ReelNoteLocalOutput = z.infer<typeof ReelNoteLocalOutputSchema>;

export const REEL_NOTE_LOCAL_SYSTEM_V1 = `You edit one vertical video scene on-device from a user's short note (and optional cropped frame image).
Reply with ONLY flat JSON matching the schema.

ALWAYS prefer action="edit" whenever the request fits ANY capability below:
- Remove/hide graphic ("remove this", "delete it", "just show me"): field="remove", to="graphic" (or layout="speaker")
- Remove a specific part: field="remove", to="tag" | "hook" | "kicker" | "sub" | "strike" | "icon"
- Main title/headline/name/text: field="title", to="New text"
- Kicker/label/top/verb: field="kicker", to="New label" (to="" removes)
- Subtitle/suffix/button/doneTitle: field="sub", to="New sub" (to="" removes)
- Corner tag: field="tag", to="SHORT TAG" (to="" removes)
- Hook banner (only if Hook is shown): field="hook", to="New hook" (to="" removes)
- Number/zoom/chart value: field="value", to="98%" | "$3.5M" | "1.6x" (for chart point also set from="label")
- Replace or delete exact visible text: field="replace", from="exact old text", to="new text" (to="" deletes)
- Fix a misheard caption word: field="caption", from="wrong word", to="right word"
- Add a bullet/row/step/line/point: field="add_item", to="New item" (checklist: "Label | Value", chart: "Label: 42")
- Remove a bullet/row/step/line/point: field="remove_item", from="item text or 1/2/last"
- Change icon: field="icon", to="rocket" | "zap" | "flame" | "check" | "sparkles" | "trophy" | "clock" | "brain" | "target" | "trending-up"
- Visual toggle: field="style", to="bars"|"line" (chart) | "left"|"right"|"none"|"swap" (compare) | "strike"|"no-strike" | "frame"|"bleed"|"cover"|"screen-window"|"card" | "mute"|"duck"|"solo" | highlight word (headline accent)
- Switch template (text/data only): field="swap", template="headline"|"punch"|"cta"|"counter"|"list"|"checklist"|"compare"|"statement"|"quote"|"progress"|"terminal"|"chart"|"flow", to="Title | Item 1; Item 2"
- Background: bg="light" | "cream" | "dark" (combinable)
- Layout: layout="split" | "card" | "pip" | "full" | "speaker" (combinable)

Examples:
- "remove this" -> {"action":"edit","field":"remove","to":"graphic","message":"Removed the graphic"}
- "make it dark and full screen" -> {"action":"edit","bg":"dark","layout":"full","message":"Dark full-screen layout"}
- "change to 95%" -> {"action":"edit","field":"value","to":"95%","message":"Updated counter to 95%"}
- "add a bullet: Works offline" -> {"action":"edit","field":"add_item","to":"Works offline","message":"Added bullet"}
- "switch to bar chart" -> {"action":"edit","field":"style","to":"bars","message":"Switched to bar chart"}
- "make this a punchline" -> {"action":"edit","field":"swap","template":"punch","message":"Switched to punchline"}

ONLY return action="escalate" for:
- Writing/editing custom HTML/JS animations, adding a brand-new photo/logo/illustration/website screenshot, or a complex multi-part artistic redesign.

Rules:
- Never invent numbers or facts not in the user's note or visible texts.
- Keep message under 10 words.`;

export function reelNoteLocalPromptV1(i: ReelNoteLocalInput): string {
  const lines = [
    `Look: ${i.look} | Template: ${i.sceneTemplate} | Layout: ${i.sceneLayout}${i.sceneBg ? ` | Bg: ${i.sceneBg}` : ''}`,
    ...(i.circledParts?.length ? [`Circled: ${i.circledParts.join(', ')}`] : []),
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
        'remove',
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
        'add_item',
        'remove_item',
        'icon',
        'style',
        'swap',
      ],
    },
    to: { type: 'string', maxLength: 160 },
    from: { type: 'string', maxLength: 80 },
    bg: { type: 'string', enum: ['light', 'cream', 'dark'] },
    layout: { type: 'string', enum: ['split', 'card', 'pip', 'full', 'speaker'] },
    template: {
      type: 'string',
      enum: [
        'headline',
        'counter',
        'punch',
        'cta',
        'list',
        'checklist',
        'compare',
        'statement',
        'quote',
        'progress',
        'terminal',
        'chart',
        'flow',
      ],
    },
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
  'leftIcon',
  'rightIcon',
  'asset',
  'src',
  'html',
  'css',
  'script',
  'kind',
  'at',
  'url',
  'clipId',
  'fit',
  'audioMode',
  'winner',
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
    parts?: readonly ('graphic' | 'speaker' | 'caption' | 'tag' | 'hook')[] | undefined;
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
    ...(p.parts?.length ? { circledParts: p.parts.slice(0, 5) } : {}),
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
    const replaced = (obj.slice(0, idx) + to + obj.slice(idx + from.length)).replace(/\s{2,}/g, ' ').trim();
    return { next: replaced, hit: true };
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

const VALID_ICONS = new Set<string>(REEL_ICONS);
const ICON_ALIASES: Record<string, string> = {
  fire: 'flame',
  hot: 'flame',
  lightning: 'zap',
  bolt: 'zap',
  fast: 'zap',
  speed: 'zap',
  magic: 'wand-sparkles',
  ai: 'sparkles',
  idea: 'lightbulb',
  money: 'coins',
  cash: 'banknote',
  dollar: 'banknote',
  growth: 'trending-up',
  chart: 'chart-line',
  bar: 'chart-column',
  bars: 'chart-column',
  pie: 'chart-pie',
  win: 'trophy',
  winner: 'trophy',
  king: 'crown',
  love: 'heart',
  like: 'thumbs-up',
  people: 'users',
  team: 'users',
  person: 'user',
  time: 'clock',
  stopwatch: 'timer',
  tick: 'check',
  checkmark: 'check',
  done: 'check',
  code: 'terminal',
  console: 'terminal',
  warning: 'triangle-alert',
  alert: 'triangle-alert',
  no: 'ban',
  stop: 'ban',
};

function resolveLocalIcon(raw: string): string | null {
  const clean = raw
    .trim()
    .toLowerCase()
    .replace(/^icon[:\s-]+/, '')
    .replace(/[\s_]+/g, '-');
  if (!clean) return null;
  if (VALID_ICONS.has(clean)) return clean;
  const alias = ICON_ALIASES[clean];
  if (alias && VALID_ICONS.has(alias)) return alias;
  return null;
}

function fit(s: string | undefined, max: number, fallback = ''): string {
  const trimmed = cut(s, max)?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function cueAt(scene: ReelScene, index: number, total: number): number {
  const span = Math.max(400, scene.endMs - scene.startMs);
  return Math.round(
    scene.startMs + Math.min(span - 150, 180 + index * Math.min(600, span / Math.max(2, total + 1))),
  );
}

function splitListParts(raw: string, maxLen: number, maxCount: number): string[] {
  return raw
    .split(/[;•\n]|,\s+/)
    .map((s) => fit(s.replace(/^[-*•\d.)]+\s*/, ''), maxLen))
    .filter((s) => s.length > 0)
    .slice(0, maxCount);
}

/** Build a schema-valid content object when swapping to one of the 13 built-in text/data templates. */
function buildSwappedContent(
  tpl: ReelNoteLocalSwapTemplate,
  scene: ReelScene,
  rawTo: string,
  rawFrom: string,
): ReelScene['content'] | null {
  const existing = extractSceneTexts(scene.content);
  const existingCombined =
    scene.content.template === 'counter'
      ? `${scene.content.prefix ?? ''}${scene.content.value}${scene.content.suffix ?? ''} ${scene.content.label}`.trim()
      : existing[0] ?? '';
  const pipes = rawTo
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  switch (tpl) {
    case 'headline': {
      const title = fit(pipes[0] || existingCombined || existing[0], 60);
      if (!title) return null;
      const kicker = fit(pipes[1] || (rawTo ? undefined : existing[1]), 40) || undefined;
      const sub = fit(pipes[2], 80) || undefined;
      return {
        template: 'headline',
        title,
        ...(kicker ? { kicker } : {}),
        ...(sub ? { sub } : {}),
      };
    }
    case 'punch': {
      const text = fit(pipes[0] || existingCombined || existing[0], 28);
      if (!text) return null;
      const top = fit(pipes[1] || rawFrom || undefined, 28) || undefined;
      return { template: 'punch', text, ...(top ? { top } : {}) };
    }
    case 'cta': {
      const verb =
        pipes.length >= 2
          ? fit(pipes[0], 14, 'Try')
          : rawFrom
            ? fit(rawFrom, 14, 'Try')
            : 'Try';
      const keyword = fit(
        pipes.length >= 2 ? pipes[1] : pipes[0] || existing[0],
        16,
      );
      if (!keyword) return null;
      return { template: 'cta', verb, keyword };
    }
    case 'counter': {
      const numSource = pipes[0] || rawTo || existingCombined;
      const parsedVal = parseCounterValue(numSource);
      if (!parsedVal) return null;
      const label = fit(pipes[1] || existing[0] || 'Key stat', 36, 'Key stat');
      const kicker = fit(pipes[2], 36) || undefined;
      return {
        template: 'counter',
        value: parsedVal.value,
        decimals: Number.isInteger(parsedVal.value) ? 0 : 1,
        prefix: parsedVal.prefix ?? '',
        suffix: parsedVal.suffix ?? '',
        label,
        ...(kicker ? { kicker } : {}),
      };
    }
    case 'list': {
      const title = fit(pipes.length >= 2 ? pipes[0] : existing[0] || 'Key points', 40, 'Key points');
      const itemSource = pipes.length >= 2 ? pipes.slice(1).join('; ') : rawTo || existing.slice(1).join('; ');
      const pts = splitListParts(itemSource, 28, 5);
      if (pts.length < 2) return null;
      return {
        template: 'list',
        title,
        items: pts.map((text, i) => ({ at: cueAt(scene, i, pts.length), icon: 'check', text })),
      };
    }
    case 'checklist': {
      const hasKicker = pipes.length >= 2;
      const kicker = hasKicker ? fit(pipes[0], 40) || undefined : undefined;
      const rawRows = (hasKicker ? pipes.slice(1).join('; ') : rawTo || existing.join('; '))
        .split(/[;•\n]/)
        .map((r) => r.trim())
        .filter((r) => r.length > 0)
        .slice(0, 5);
      if (rawRows.length < 2) return null;
      const rows = rawRows.map((entry, i) => {
        const [lhs, rhs] = entry.split(':').map((s) => s.trim());
        const label = fit(lhs, 18, 'Item');
        const value = fit(rhs, 14) || undefined;
        return { at: cueAt(scene, i, rawRows.length), label, ...(value ? { value } : {}) };
      });
      return { template: 'checklist', ...(kicker ? { kicker } : {}), rows };
    }
    case 'compare': {
      const header = pipes[0] || rawTo;
      const sides = header
        .split(/\s+(?:vs\.?|versus)\s+|\s*\/\s*/i)
        .map((s) => s.trim())
        .filter(Boolean);
      const left = fit(sides[0] || rawFrom, 14);
      const right = fit(sides[1] || (sides.length === 1 && rawFrom ? sides[0] : ''), 14);
      if (!left || !right || left === right) return null;
      const rowPts = pipes[1] ? splitListParts(pipes[1], 18, 3) : [];
      return {
        template: 'compare',
        left,
        right,
        winner: 'right',
        rows: rowPts.map((text, i) => ({ at: cueAt(scene, i, rowPts.length), text })),
      };
    }
    case 'statement': {
      const src = rawTo || existingCombined || existing.join('; ');
      const lines = splitListParts(src, 22, 4);
      if (lines.length < 1) return null;
      const strike = /^(strike|no|without|stop)$/i.test(rawFrom);
      return {
        template: 'statement',
        strike,
        lines: lines.map((text, i) => ({ at: cueAt(scene, i, lines.length), text })),
      };
    }
    case 'quote': {
      const src = rawTo || existingCombined || existing.join('; ');
      const lines = src
        .split(/[;\n|]/)
        .map((s) => fit(s, 60))
        .filter((s) => s.length > 0)
        .slice(0, 4);
      if (lines.length < 1) return null;
      const hl = fit(rawFrom, 24);
      return {
        template: 'quote',
        lines: lines.map((text, i) => ({ at: cueAt(scene, i, lines.length), text })),
        highlight: hl ? [hl] : [],
      };
    }
    case 'progress': {
      const title = fit(pipes[0] || existing[0], 32);
      if (!title) return null;
      const sub = fit(pipes[1], 36) || undefined;
      const doneTitle = fit(pipes[2], 32) || undefined;
      return {
        template: 'progress',
        title,
        ...(sub ? { sub } : {}),
        ...(doneTitle ? { doneTitle } : {}),
      };
    }
    case 'terminal': {
      const hasTitle = pipes.length >= 2;
      const title = hasTitle ? fit(pipes[0], 30) || undefined : undefined;
      const rawLines = (hasTitle ? pipes.slice(1).join('; ') : rawTo || existing.join('; '))
        .split(/[;\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 5);
      if (rawLines.length < 1) return null;
      const lines = rawLines.map((line, i) => {
        if (/^ok:\s*/i.test(line)) {
          return { at: cueAt(scene, i, rawLines.length), text: fit(line.replace(/^ok:\s*/i, ''), 48, 'ok'), kind: 'ok' as const };
        }
        if (/^out:\s*/i.test(line)) {
          return { at: cueAt(scene, i, rawLines.length), text: fit(line.replace(/^out:\s*/i, ''), 48, 'out'), kind: 'out' as const };
        }
        return { at: cueAt(scene, i, rawLines.length), text: fit(line, 48, '$ run'), kind: 'cmd' as const };
      });
      return { template: 'terminal', ...(title ? { title } : {}), lines };
    }
    case 'flow': {
      const rawSteps = (rawTo || existing.join(' -> '))
        .split(/\s*(?:->|→|=>|;|\|)\s*/)
        .map((s) => fit(s, 16))
        .filter((s) => s.length > 0)
        .slice(0, 4);
      if (rawSteps.length < 2) return null;
      return {
        template: 'flow',
        steps: rawSteps.map((text, i) => ({ at: cueAt(scene, i, rawSteps.length), icon: 'arrow-right', text })),
      };
    }
    case 'chart': {
      const hasTitle = pipes.length >= 2;
      const title = fit(hasTitle ? pipes[0] : existing[0] || 'Trend', 36, 'Trend');
      const rawPts = (hasTitle ? pipes.slice(1).join('; ') : rawTo)
        .split(/[;,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const points: { label: string; value: number }[] = [];
      let unit = '';
      for (const entry of rawPts) {
        const m = /^([^:=]+?)\s*[:=]\s*(.+)$/.exec(entry);
        if (!m?.[1] || !m[2]) continue;
        const parsedVal = parseCounterValue(m[2]);
        if (!parsedVal) continue;
        const label = fit(m[1], 10);
        if (!label) continue;
        if (!unit && (parsedVal.suffix || parsedVal.prefix)) {
          unit = fit(parsedVal.suffix || parsedVal.prefix, 6);
        }
        points.push({ label, value: parsedVal.value });
        if (points.length >= 8) break;
      }
      if (points.length < 2) return null;
      const kind = /\bline\b/i.test(rawFrom) ? ('line' as const) : ('bars' as const);
      return { template: 'chart', kind, title, unit, points };
    }
  }
}

function matchItemIndex<T>(items: readonly T[], query: string, textOf: (item: T) => string): number {
  const q = query.trim().toLowerCase();
  if (!q) return -1;
  if (q === 'last' || q === 'final') return items.length - 1;
  if (q === 'first' || q === '1st') return 0;
  if (q === 'second' || q === '2nd') return 1 < items.length ? 1 : -1;
  if (q === 'third' || q === '3rd') return 2 < items.length ? 2 : -1;
  if (q === 'fourth' || q === '4th') return 3 < items.length ? 3 : -1;
  const numMatch = /^(?:item\s+|#|row\s+|step\s+|line\s+|point\s+)?(\d+)$/.exec(q);
  if (numMatch?.[1]) {
    const idx = Number(numMatch[1]) - 1;
    return idx >= 0 && idx < items.length ? idx : -1;
  }
  return items.findIndex((it) => textOf(it).toLowerCase().includes(q));
}

function applyAddItem(scene: ReelScene, rawTo: string): ReelScene['content'] | null {
  const c = scene.content;
  const trimmed = rawTo.trim();
  if (!trimmed) return null;

  switch (c.template) {
    case 'list': {
      if (c.items.length >= 5) return null;
      const text = fit(trimmed, 28);
      if (!text) return null;
      const icon = c.items.at(-1)?.icon || 'check';
      return { ...c, items: [...c.items, { at: cueAt(scene, c.items.length, c.items.length + 1), icon, text }] };
    }
    case 'stack': {
      if (c.words.length >= 5) return null;
      const text = fit(trimmed, 18);
      if (!text) return null;
      return { ...c, words: [...c.words, { at: cueAt(scene, c.words.length, c.words.length + 1), text }] };
    }
    case 'checklist': {
      if (c.rows.length >= 5) return null;
      const [lhs, rhs] = trimmed.split(/[|:]/).map((s) => s.trim());
      const label = fit(lhs, 18);
      if (!label) return null;
      const value = fit(rhs, 14) || undefined;
      return {
        ...c,
        rows: [
          ...c.rows,
          { at: cueAt(scene, c.rows.length, c.rows.length + 1), label, ...(value ? { value } : {}) },
        ],
      };
    }
    case 'compare': {
      if (c.rows.length >= 3) return null;
      const text = fit(trimmed, 18);
      if (!text) return null;
      return { ...c, rows: [...c.rows, { at: cueAt(scene, c.rows.length, c.rows.length + 1), text }] };
    }
    case 'statement': {
      if (c.lines.length >= 4) return null;
      const text = fit(trimmed, 22);
      if (!text) return null;
      return { ...c, lines: [...c.lines, { at: cueAt(scene, c.lines.length, c.lines.length + 1), text }] };
    }
    case 'terminal': {
      if (c.lines.length >= 5) return null;
      const kind = /^ok:\s*/i.test(trimmed)
        ? ('ok' as const)
        : /^out:\s*/i.test(trimmed)
          ? ('out' as const)
          : ('cmd' as const);
      const text = fit(trimmed.replace(/^(ok|out):\s*/i, ''), 48);
      if (!text) return null;
      return { ...c, lines: [...c.lines, { at: cueAt(scene, c.lines.length, c.lines.length + 1), text, kind }] };
    }
    case 'flow': {
      if (c.steps.length >= 4) return null;
      const text = fit(trimmed, 16);
      if (!text) return null;
      const icon = c.steps.at(-1)?.icon || 'arrow-right';
      return { ...c, steps: [...c.steps, { at: cueAt(scene, c.steps.length, c.steps.length + 1), icon, text }] };
    }
    case 'quote': {
      if (c.lines.length >= 4) return null;
      const text = fit(trimmed, 60);
      if (!text) return null;
      return { ...c, lines: [...c.lines, { at: cueAt(scene, c.lines.length, c.lines.length + 1), text }] };
    }
    case 'image': {
      if (c.words.length >= 3) return null;
      const text = fit(trimmed, 24);
      if (!text) return null;
      return { ...c, words: [...c.words, { at: cueAt(scene, c.words.length, c.words.length + 1), text }] };
    }
    case 'chart': {
      if (c.points.length >= 8) return null;
      const m = /^([^:=|]+?)\s*[:=|]\s*(.+)$/.exec(trimmed);
      if (!m?.[1] || !m[2]) return null;
      const parsedVal = parseCounterValue(m[2]);
      const label = fit(m[1], 10);
      if (!parsedVal || !label) return null;
      return { ...c, points: [...c.points, { label, value: parsedVal.value }] };
    }
    default:
      return null;
  }
}

function applyRemoveItem(scene: ReelScene, query: string): ReelScene['content'] | null {
  const c = scene.content;
  if (!query.trim()) return null;

  switch (c.template) {
    case 'list': {
      if (c.items.length <= 2) return null;
      const idx = matchItemIndex(c.items, query, (x) => x.text);
      return idx >= 0 ? { ...c, items: c.items.filter((_, i) => i !== idx) } : null;
    }
    case 'stack': {
      if (c.words.length <= 2) return null;
      const idx = matchItemIndex(c.words, query, (x) => x.text);
      return idx >= 0 ? { ...c, words: c.words.filter((_, i) => i !== idx) } : null;
    }
    case 'checklist': {
      if (c.rows.length <= 2) return null;
      const idx = matchItemIndex(c.rows, query, (x) => `${x.label} ${x.value ?? ''}`);
      return idx >= 0 ? { ...c, rows: c.rows.filter((_, i) => i !== idx) } : null;
    }
    case 'compare': {
      if (c.rows.length <= 0) return null;
      const idx = matchItemIndex(c.rows, query, (x) => x.text);
      return idx >= 0 ? { ...c, rows: c.rows.filter((_, i) => i !== idx) } : null;
    }
    case 'statement': {
      if (c.lines.length <= 1) return null;
      const idx = matchItemIndex(c.lines, query, (x) => x.text);
      return idx >= 0 ? { ...c, lines: c.lines.filter((_, i) => i !== idx) } : null;
    }
    case 'terminal': {
      if (c.lines.length <= 1) return null;
      const idx = matchItemIndex(c.lines, query, (x) => x.text);
      return idx >= 0 ? { ...c, lines: c.lines.filter((_, i) => i !== idx) } : null;
    }
    case 'flow': {
      if (c.steps.length <= 2) return null;
      const idx = matchItemIndex(c.steps, query, (x) => x.text);
      return idx >= 0 ? { ...c, steps: c.steps.filter((_, i) => i !== idx) } : null;
    }
    case 'quote': {
      if (c.lines.length <= 1) return null;
      const idx = matchItemIndex(c.lines, query, (x) => x.text);
      return idx >= 0 ? { ...c, lines: c.lines.filter((_, i) => i !== idx) } : null;
    }
    case 'image': {
      if (c.words.length <= 0) return null;
      const idx = matchItemIndex(c.words, query, (x) => x.text);
      return idx >= 0 ? { ...c, words: c.words.filter((_, i) => i !== idx) } : null;
    }
    case 'chart': {
      if (c.points.length <= 2) return null;
      const idx = matchItemIndex(c.points, query, (x) => x.label);
      return idx >= 0 ? { ...c, points: c.points.filter((_, i) => i !== idx) } : null;
    }
    default:
      return null;
  }
}

function applyIconEdit(scene: ReelScene, rawIcon: string, rawFrom: string): ReelScene['content'] | null {
  const c = scene.content;
  const clearIcon = rawIcon.trim() === '' || /^(none|remove|off)$/i.test(rawIcon.trim());
  const resolved = clearIcon ? null : resolveLocalIcon(rawIcon);
  if (!clearIcon && !resolved) return null;

  switch (c.template) {
    case 'counter':
    case 'statement':
    case 'progress': {
      if (clearIcon) {
        if (!c.icon) return null;
        const copy = { ...c };
        delete copy.icon;
        return copy;
      }
      if (!resolved || c.icon === resolved) return null;
      return { ...c, icon: resolved };
    }
    case 'compare': {
      if (clearIcon) {
        const copy = { ...c };
        delete copy.leftIcon;
        delete copy.rightIcon;
        return copy;
      }
      if (!resolved) return null;
      if (/left/i.test(rawFrom)) return { ...c, leftIcon: resolved };
      return { ...c, rightIcon: resolved };
    }
    case 'list': {
      if (!resolved) return null;
      const idx = rawFrom ? matchItemIndex(c.items, rawFrom, (x) => x.text) : -1;
      const items = c.items.map((it, i) => (idx === -1 || i === idx ? { ...it, icon: resolved } : it));
      return { ...c, items };
    }
    case 'flow': {
      if (!resolved) return null;
      const idx = rawFrom ? matchItemIndex(c.steps, rawFrom, (x) => x.text) : -1;
      const steps = c.steps.map((st, i) => (idx === -1 || i === idx ? { ...st, icon: resolved } : st));
      return { ...c, steps };
    }
    default:
      return null;
  }
}

function applyStyleToggle(scene: ReelScene, rawTo: string): ReelScene['content'] | null {
  const c = scene.content;
  const v = rawTo.trim().toLowerCase();
  if (!v) return null;

  switch (c.template) {
    case 'chart': {
      if (/\bbar/.test(v) && c.kind !== 'bars') return { ...c, kind: 'bars' };
      if (/\bline/.test(v) && c.kind !== 'line') return { ...c, kind: 'line' };
      return null;
    }
    case 'compare': {
      if (/\b(swap|flip|reverse)\b/.test(v)) {
        const winner = c.winner === 'left' ? 'right' : c.winner === 'right' ? 'left' : 'none';
        return {
          ...c,
          left: c.right,
          right: c.left,
          winner,
          ...(c.rightIcon ? { leftIcon: c.rightIcon } : { leftIcon: undefined }),
          ...(c.leftIcon ? { rightIcon: c.leftIcon } : { rightIcon: undefined }),
          ...(c.rightMedia ? { leftMedia: c.rightMedia } : { leftMedia: undefined }),
          ...(c.leftMedia ? { rightMedia: c.leftMedia } : { rightMedia: undefined }),
        };
      }
      if (/\bleft\b/.test(v) && c.winner !== 'left') return { ...c, winner: 'left' };
      if (/\bright\b/.test(v) && c.winner !== 'right') return { ...c, winner: 'right' };
      if (/\b(none|tie|equal|neither)\b/.test(v) && c.winner !== 'none') return { ...c, winner: 'none' };
      return null;
    }
    case 'statement': {
      if (/\b(no[- ]?strike|unstrike|remove|off|clear)\b/.test(v) && c.strike) return { ...c, strike: false };
      if (/\b(strike|cross|slash|x)\b/.test(v) && !c.strike) return { ...c, strike: true };
      return null;
    }
    case 'browser':
    case 'website': {
      if (/\b(no[- ]?strike|unstrike|remove|off|clear)\b/.test(v) && c.strikeAt !== undefined) {
        const copy = { ...c };
        delete copy.strikeAt;
        return copy;
      }
      if (/\b(strike|cross|slash|red x)\b/.test(v) && c.strikeAt === undefined) {
        return { ...c, strikeAt: Math.round(scene.startMs + (scene.endMs - scene.startMs) * 0.5) };
      }
      return null;
    }
    case 'image': {
      if (/\b(bleed|full)\b/.test(v) && c.fit !== 'bleed') return { ...c, fit: 'bleed' };
      if (/\b(frame|card|boxed)\b/.test(v) && c.fit !== 'frame') return { ...c, fit: 'frame' };
      return null;
    }
    case 'clip': {
      if (/\b(screen-window|window|mac|browser)\b/.test(v) && c.fit !== 'screen-window')
        return { ...c, fit: 'screen-window' };
      if (/\b(cover|full|bleed)\b/.test(v) && c.fit !== 'cover') return { ...c, fit: 'cover' };
      if (/\bcard\b/.test(v) && c.fit !== 'card') return { ...c, fit: 'card' };
      if (/\b(mute|silent|off)\b/.test(v) && c.audioMode !== 'mute') return { ...c, audioMode: 'mute' };
      if (/\b(duck|quiet|soft)\b/.test(v) && c.audioMode !== 'duck') return { ...c, audioMode: 'duck' };
      if (/\b(solo|unmute|sound|audio)\b/.test(v) && c.audioMode !== 'solo') return { ...c, audioMode: 'solo' };
      return null;
    }
    case 'headline': {
      if (/^(none|clear|remove)$/.test(v)) {
        if (!c.accent) return null;
        const copy = { ...c };
        delete copy.accent;
        return copy;
      }
      const accent = fit(rawTo, 40);
      if (accent && accent !== c.accent) return { ...c, accent };
      return null;
    }
    case 'quote': {
      const hl = fit(rawTo, 24);
      if (!hl || c.highlight.includes(hl) || c.highlight.length >= 4) return null;
      return { ...c, highlight: [...c.highlight, hl] };
    }
    default:
      return null;
  }
}

export interface AppliedLocalReelNote {
  changed: boolean;
  escalate: boolean;
  scene: ReelScene;
  /** New hook title; null removes the hook band; undefined leaves it unchanged. */
  hook?: string | null;
  captions: { find: string; replace: string }[];
  message: string;
}

const CUSTOM_CONTENT_FIELDS = new Set<ReelNoteLocalField>([
  'title',
  'kicker',
  'sub',
  'value',
  'replace',
  'add_item',
  'remove_item',
  'icon',
  'style',
]);

function clearedSpeakerScene(scene: ReelScene): ReelScene | null {
  if (scene.content.template === 'none' && scene.layout === 'speaker') return null;
  const cleared: ReelScene = {
    id: scene.id,
    startMs: scene.startMs,
    endMs: scene.endMs,
    layout: 'speaker',
    content: { template: 'none' },
    ...(scene.notes ? { notes: scene.notes } : {}),
  };
  const parsed = ReelSceneSchema.safeParse(cleared);
  return parsed.success ? parsed.data : null;
}

/**
 * Applies a validated `reel.note.local` answer onto `ctx.scene`, verifying the resulting scene
 * against `ReelSceneSchema`. Any invalid or empty edit signals `escalate: true` so the caller can
 * offer local-LLM/cloud escalation without ever corrupting the scene or silently spending credits.
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

  let changed = false;
  let nextScene: ReelScene = { ...ctx.scene };
  const to = out.to?.trim() ?? '';
  const from = out.from?.trim() ?? '';

  // 1. Explicit removal (`field: 'remove'`): works on every template, including custom graphics.
  if (out.field === 'remove') {
    const target = to.toLowerCase();
    if (target === 'tag') {
      if (nextScene.tag) {
        const rest = { ...nextScene };
        delete rest.tag;
        const parsed = ReelSceneSchema.safeParse(rest);
        if (parsed.success) {
          return { changed: true, escalate: false, scene: parsed.data, captions: [], message: msg };
        }
      }
      return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
    }
    if (target === 'hook') {
      if (opts.hook !== undefined) {
        return {
          changed: true,
          escalate: false,
          scene: ctx.scene,
          hook: null,
          captions: [],
          message: msg,
        };
      }
      return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
    }
    if (target === 'strike') {
      const toggled = applyStyleToggle(nextScene, 'no-strike');
      if (toggled) {
        const parsed = ReelSceneSchema.safeParse({ ...nextScene, content: toggled });
        if (parsed.success) {
          return { changed: true, escalate: false, scene: parsed.data, captions: [], message: msg };
        }
      }
      return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
    }
    if (target === 'icon') {
      const updated = applyIconEdit(nextScene, '', from);
      if (updated) {
        const parsed = ReelSceneSchema.safeParse({ ...nextScene, content: updated });
        if (parsed.success) {
          return { changed: true, escalate: false, scene: parsed.data, captions: [], message: msg };
        }
      }
      return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
    }
    if (target === 'kicker' || target === 'sub') {
      const keys =
        target === 'kicker' ? (['kicker', 'top', 'accent'] as const) : (['sub', 'suffix', 'body', 'button', 'doneTitle'] as const);
      const nextContent: Record<string, unknown> = { ...(nextScene.content as Record<string, unknown>) };
      const key = keys.find((k) => k in nextContent && nextContent[k]);
      if (key) {
        delete nextContent[key];
        const parsed = ReelSceneSchema.safeParse({ ...nextScene, content: nextContent });
        if (parsed.success) {
          return { changed: true, escalate: false, scene: parsed.data, captions: [], message: msg };
        }
      }
      return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
    }
    const cleared = clearedSpeakerScene(nextScene);
    if (cleared) {
      return { changed: true, escalate: false, scene: cleared, captions: [], message: msg };
    }
    return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
  }

  // 2. Template swap (`field: 'swap'` or `out.template` provided): works on any scene (even replacing custom).
  if (out.template && (out.field === 'swap' || out.field === undefined || out.template !== nextScene.content.template)) {
    const swapped = buildSwappedContent(out.template, nextScene, to, from);
    if (swapped) {
      const speakerTpl = swapped.template === 'punch' || swapped.template === 'cta';
      const defaultGraphicLayout = ctx.look === 'cream' ? 'card' : 'split';
      const rawLayout = out.layout;
      const layout = speakerTpl
        ? 'speaker'
        : rawLayout && rawLayout !== 'speaker'
          ? rawLayout === 'card' && ctx.look === 'mono'
            ? 'split'
            : rawLayout === 'split' && ctx.look === 'cream'
              ? 'card'
              : rawLayout
          : nextScene.layout === 'speaker'
            ? defaultGraphicLayout
            : nextScene.layout;
      const rawBg = out.bg ?? nextScene.bg ?? (ctx.look === 'cream' ? 'cream' : 'light');
      const bg = rawBg === 'cream' && ctx.look === 'mono' ? 'light' : rawBg;
      const candidate: ReelScene = {
        ...nextScene,
        layout,
        ...(speakerTpl ? {} : { bg }),
        content: swapped,
      };
      if (speakerTpl) {
        delete candidate.bg;
        delete candidate.tag;
      }
      const parsed = ReelSceneSchema.safeParse(candidate);
      if (parsed.success) {
        return { changed: true, escalate: false, scene: parsed.data, captions: [], message: msg };
      }
    }
    if (out.field === 'swap') {
      return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
    }
  }

  // Custom scenes hold arbitrary HTML/CSS/JS; escalate code content edits rather than mutating code.
  if (
    ctx.scene.content.template === 'custom' &&
    out.field !== undefined &&
    CUSTOM_CONTENT_FIELDS.has(out.field)
  ) {
    return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
  }

  // 3. Layout change (either via `layout` or `field: 'layout'`).
  const rawLayout =
    out.layout ??
    (out.field === 'layout' ? ReelLayoutSchema.safeParse(to.toLowerCase()).data : undefined);
  const wantedLayout =
    rawLayout === 'card' && ctx.look === 'mono'
      ? 'split'
      : rawLayout === 'split' && ctx.look === 'cream'
        ? 'card'
        : rawLayout;
  if (wantedLayout === 'speaker') {
    const cleared = clearedSpeakerScene(nextScene);
    if (cleared) {
      return { changed: true, escalate: false, scene: cleared, captions: [], message: msg };
    }
  } else if (wantedLayout !== undefined && wantedLayout !== nextScene.layout) {
    const speakerOnly = ['punch', 'cta', 'none'].includes(nextScene.content.template);
    if (!speakerOnly) {
      nextScene = { ...nextScene, layout: wantedLayout };
      changed = true;
    }
  }

  // 4. Background change (either via `bg` or `field: 'bg'`), normalized for look.
  const rawBg =
    out.bg ?? (out.field === 'bg' ? ReelBgSchema.safeParse(to.toLowerCase()).data : undefined);
  const wantedBg = rawBg === 'cream' && ctx.look === 'mono' ? 'light' : rawBg;
  if (wantedBg !== undefined && wantedBg !== nextScene.bg) {
    nextScene = { ...nextScene, bg: wantedBg };
    changed = true;
  }

  // 5. Corner tag (empty string removes it).
  if (out.field === 'tag' && out.to !== undefined) {
    if (to === '' && nextScene.tag) {
      const rest = { ...nextScene };
      delete rest.tag;
      nextScene = rest;
      changed = true;
    } else if (to && to !== nextScene.tag) {
      nextScene = { ...nextScene, tag: to.slice(0, 28) };
      changed = true;
    }
  }

  // 6. Template content edits.
  let nextContent: Record<string, unknown> = {
    ...(nextScene.content as Record<string, unknown>),
  };

  if (out.field === 'title' && to) {
    const key = (['title', 'headline', 'text', 'keyword', 'label', 'name'] as const).find(
      (k) => k in nextContent,
    );
    if (key && nextContent[key] !== to) {
      nextContent = { ...nextContent, [key]: to };
      changed = true;
    } else if (
      (nextScene.content.template === 'statement' || nextScene.content.template === 'quote') &&
      nextScene.content.lines.length > 0
    ) {
      const maxLen = nextScene.content.template === 'statement' ? 22 : 60;
      const lines = nextScene.content.lines.map((l, i) => (i === 0 ? { ...l, text: fit(to, maxLen, l.text) } : l));
      if (lines[0]!.text !== nextScene.content.lines[0]!.text) {
        nextContent = { ...nextContent, lines };
        changed = true;
      }
    }
  } else if (out.field === 'kicker' && out.to !== undefined) {
    const key = (['kicker', 'label', 'top', 'verb', 'accent'] as const).find((k) => k in nextContent);
    if (to === '' && key && (key === 'kicker' || key === 'top' || key === 'accent') && nextContent[key]) {
      const copy = { ...nextContent };
      delete copy[key];
      nextContent = copy;
      changed = true;
    } else if (to && key && nextContent[key] !== to) {
      nextContent = { ...nextContent, [key]: to };
      changed = true;
    } else if (
      to &&
      (nextScene.content.template === 'headline' ||
        nextScene.content.template === 'list' ||
        nextScene.content.template === 'checklist' ||
        nextScene.content.template === 'counter' ||
        nextScene.content.template === 'image')
    ) {
      nextContent = { ...nextContent, kicker: fit(to, 40) };
      changed = true;
    } else if (to && nextScene.content.template === 'punch') {
      nextContent = { ...nextContent, top: fit(to, 28) };
      changed = true;
    }
  } else if (out.field === 'sub' && out.to !== undefined) {
    const key = (['sub', 'suffix', 'body', 'button', 'doneTitle', 'task'] as const).find(
      (k) => k in nextContent,
    );
    if (to === '' && key && nextContent[key]) {
      const copy = { ...nextContent };
      delete copy[key];
      nextContent = copy;
      changed = true;
    } else if (to && key && nextContent[key] !== to) {
      nextContent = { ...nextContent, [key]: to };
      changed = true;
    } else if (
      to &&
      (nextScene.content.template === 'headline' ||
        nextScene.content.template === 'progress' ||
        nextScene.content.template === 'browser' ||
        nextScene.content.template === 'logo')
    ) {
      nextContent = { ...nextContent, sub: fit(to, 80) };
      changed = true;
    }
  } else if (out.field === 'value' && to) {
    if (nextScene.content.template === 'counter') {
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
    } else if (nextScene.content.template === 'clip') {
      const lower = to.toLowerCase();
      let zoom: number | null = null;
      if (/^(no zoom|reset|off|1x?)$/.test(lower)) zoom = 1;
      else if (/zoom in|closer|more/.test(lower)) zoom = Math.min(2.5, Number((nextScene.content.zoom + 0.35).toFixed(2)));
      else if (/zoom out|less|wider/.test(lower)) zoom = Math.max(1, Number((nextScene.content.zoom - 0.35).toFixed(2)));
      else {
        const parsedVal = parseCounterValue(to);
        if (parsedVal && parsedVal.value >= 1 && parsedVal.value <= 2.5) zoom = parsedVal.value;
      }
      if (zoom !== null && zoom !== nextScene.content.zoom) {
        nextContent = { ...nextContent, zoom };
        changed = true;
      }
    } else if (nextScene.content.template === 'chart') {
      const parsedVal = parseCounterValue(to);
      if (parsedVal && from) {
        const idx = matchItemIndex(nextScene.content.points, from, (p) => p.label);
        if (idx >= 0 && nextScene.content.points[idx]!.value !== parsedVal.value) {
          const points = nextScene.content.points.map((p, i) =>
            i === idx ? { ...p, value: parsedVal.value } : p,
          );
          nextContent = { ...nextContent, points };
          changed = true;
        }
      } else if (!parsedVal && to.length <= 6 && to !== nextScene.content.unit) {
        nextContent = { ...nextContent, unit: to };
        changed = true;
      }
    }
  } else if (out.field === 'replace' && from && out.to !== undefined) {
    const r = replaceTextInObject(nextContent, from, to);
    if (r.hit && r.next && typeof r.next === 'object') {
      nextContent = r.next as Record<string, unknown>;
      changed = true;
    }
  } else if (out.field === 'add_item' && to) {
    const added = applyAddItem(nextScene, to);
    if (added) {
      nextContent = added as Record<string, unknown>;
      changed = true;
    }
  } else if (out.field === 'remove_item' && (from || to)) {
    const removed = applyRemoveItem(nextScene, from || to);
    if (removed) {
      nextContent = removed as Record<string, unknown>;
      changed = true;
    }
  } else if (out.field === 'icon' && out.to !== undefined) {
    const updated = applyIconEdit(nextScene, to, from);
    if (updated) {
      nextContent = updated as Record<string, unknown>;
      changed = true;
    }
  } else if (out.field === 'style' && to) {
    const toggled = applyStyleToggle(nextScene, to);
    if (toggled) {
      nextContent = toggled as Record<string, unknown>;
      changed = true;
    }
  }

  nextScene = { ...nextScene, content: nextContent as ReelScene['content'] };
  const parsed = ReelSceneSchema.safeParse(nextScene);
  if (!parsed.success) {
    return { changed: false, escalate: true, scene: ctx.scene, captions: [], message: msg };
  }
  nextScene = parsed.data;

  // 7. Hook text on scene 1 (only when the reel shows a hook; empty string removes it).
  let nextHook: string | null | undefined;
  if (out.field === 'hook' && opts.hook !== undefined && out.to !== undefined) {
    if (to === '') {
      nextHook = null;
      changed = true;
    } else if (to !== opts.hook) {
      nextHook = to.slice(0, 60);
      changed = true;
    }
  }

  // 8. Caption word fix.
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

/**
 * Deterministic safety net for unambiguous single-intent frame notes (remove/hide graphic,
 * remove tag/hook/kicker/sub/strike, switch background or layout, template-native toggles, and
 * text-preserving swaps) when Gemini Nano conservatively returns `escalate` or throws.
 * Every result is validated through `applyReelNoteLocal`.
 */
export function tryDeterministicReelNote(
  ctx: ReelNoteContext,
  noteText: string,
  opts: {
    hook?: string | undefined;
    parts?: readonly ('graphic' | 'speaker' | 'caption' | 'tag' | 'hook')[] | undefined;
  } = {},
): AppliedLocalReelNote | null {
  const raw = noteText.trim();
  const lower = raw.toLowerCase().replace(/[.!?]+$/, '').trim();
  if (!lower) return null;

  const attempt = (out: ReelNoteLocalOutput): AppliedLocalReelNote | null => {
    const res = applyReelNoteLocal(ctx, out, { hook: opts.hook });
    return res.changed && !res.escalate ? res : null;
  };

  // Explicit part removals: tag, hook, kicker, subtitle, strike/red X, icon.
  if (/^(remove|delete|hide|clear|drop|get rid of)\s+(this\s+|the\s+|that\s+)?(corner\s+)?tag$/.test(lower)) {
    return attempt({ action: 'edit', field: 'remove', to: 'tag', message: 'Removed the tag' });
  }
  if (/^(remove|delete|hide|clear|drop|get rid of)\s+(this\s+|the\s+|that\s+)?hook(\s+banner)?$/.test(lower)) {
    return attempt({ action: 'edit', field: 'remove', to: 'hook', message: 'Removed the hook' });
  }
  if (/^(remove|delete|hide|clear|drop|get rid of)\s+(this\s+|the\s+|that\s+)?(kicker|eyebrow|top label)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'remove', to: 'kicker', message: 'Removed the kicker' });
  }
  if (/^(remove|delete|hide|clear|drop|get rid of)\s+(this\s+|the\s+|that\s+)?(sub|subtitle|subtext)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'remove', to: 'sub', message: 'Removed the subtitle' });
  }
  if (/^(remove|delete|hide|clear)\s+(this\s+|the\s+|that\s+)?(red\s+)?(strike|slash|x|cross)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'remove', to: 'strike', message: 'Removed the strike' });
  }
  if (/^(remove|delete|hide|clear)\s+(this\s+|the\s+|that\s+)?icon$/.test(lower)) {
    return attempt({ action: 'edit', field: 'remove', to: 'icon', message: 'Removed the icon' });
  }

  // Generic remove/hide graphic: "remove this", "delete it", "hide graphic", "just show me", "no graphic".
  if (
    /^(remove|delete|hide|clear|drop|get rid of)(\s+(this|it|the|that))?(\s+(graphic|overlay|card|scene|counter|box|visual|element|panel|animation|chart))?$/.test(
      lower,
    ) ||
    /^(just\s+show\s+me|speaker\s+only|no\s+graphic|hide\s+graphic|show\s+only\s+me|only\s+speaker)$/.test(
      lower,
    )
  ) {
    const primary = opts.parts?.[0];
    if (primary === 'tag' && ctx.scene.tag) {
      return attempt({ action: 'edit', field: 'remove', to: 'tag', message: 'Removed the tag' });
    }
    if (primary === 'hook' && opts.hook !== undefined) {
      return attempt({ action: 'edit', field: 'remove', to: 'hook', message: 'Removed the hook' });
    }
    return attempt({ action: 'edit', field: 'remove', to: 'graphic', message: 'Removed the graphic' });
  }

  // Unambiguous background switches.
  if (/^(make\s+(it|this|bg|background)\s+)?(dark|darker|dark\s+mode|dark\s+bg|dark\s+background)$/.test(lower)) {
    return attempt({ action: 'edit', bg: 'dark', message: 'Switched to dark background' });
  }
  if (/^(make\s+(it|this|bg|background)\s+)?(light|lighter|white|light\s+mode|light\s+bg|light\s+background)$/.test(lower)) {
    return attempt({ action: 'edit', bg: 'light', message: 'Switched to light background' });
  }
  if (/^(make\s+(it|this|bg|background)\s+)?(cream|warm|cream\s+bg|cream\s+background)$/.test(lower)) {
    return attempt({ action: 'edit', bg: 'cream', message: 'Switched to cream background' });
  }

  // Unambiguous layout switches.
  if (/^(make\s+(it|this)\s+)?(full|fullscreen|full\s+screen)(\s+layout)?$/.test(lower)) {
    return attempt({ action: 'edit', layout: 'full', message: 'Switched to full screen' });
  }
  if (/^(make\s+(it|this)\s+)?(split|split\s+screen)(\s+layout)?$/.test(lower)) {
    return attempt({ action: 'edit', layout: 'split', message: 'Switched to split layout' });
  }
  if (/^(make\s+(it|this)\s+)?(card)(\s+layout)?$/.test(lower)) {
    return attempt({ action: 'edit', layout: 'card', message: 'Switched to card layout' });
  }
  if (/^(make\s+(it|this)\s+)?(pip|picture\s+in\s+picture)$/.test(lower)) {
    return attempt({ action: 'edit', layout: 'pip', message: 'Switched to picture-in-picture' });
  }

  // Template-native style toggles.
  if (/^(switch\s+to\s+|make\s+(it|this)\s+(a\s+)?)?(bar\s+chart|bars)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'style', to: 'bars', message: 'Switched to bar chart' });
  }
  if (/^(switch\s+to\s+|make\s+(it|this)\s+(a\s+)?)?(line\s+chart|line)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'style', to: 'line', message: 'Switched to line chart' });
  }
  if (/^(swap|flip|reverse)(\s+(the\s+)?sides)?$/.test(lower)) {
    return attempt({ action: 'edit', field: 'style', to: 'swap', message: 'Swapped comparison sides' });
  }
  if (/^(make\s+left\s+win|left\s+wins)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'style', to: 'left', message: 'Highlighted left side' });
  }
  if (/^(make\s+right\s+win|right\s+wins)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'style', to: 'right', message: 'Highlighted right side' });
  }
  if (/^(add\s+(a\s+)?(red\s+)?(strike|slash|x|cross))$/.test(lower)) {
    return attempt({ action: 'edit', field: 'style', to: 'strike', message: 'Added strike' });
  }
  if (/^(full\s+bleed|make\s+(it|this)\s+full\s+bleed)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'style', to: 'bleed', message: 'Switched to full bleed' });
  }
  if (/^(frame\s+(it|this)|put\s+in\s+a\s+frame)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'style', to: 'frame', message: 'Framed image' });
  }
  if (/^(screen\s+window|mac\s+window|put\s+in\s+a\s+window)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'style', to: 'screen-window', message: 'Switched to window frame' });
  }
  if (/^(mute(\s+clip)?)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'style', to: 'mute', message: 'Muted clip' });
  }
  if (/^(unmute(\s+clip)?|solo(\s+audio)?)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'style', to: 'solo', message: 'Unmuted clip' });
  }
  if (/^(zoom\s+in(\s+more)?)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'value', to: 'zoom in', message: 'Zoomed in' });
  }
  if (/^(zoom\s+out|no\s+zoom|reset\s+zoom)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'value', to: lower, message: 'Updated zoom' });
  }

  // Simple text-preserving template conversions.
  if (/^(make\s+(it|this)\s+(a\s+)?|turn\s+(it|this)\s+into\s+(a\s+)?)(headline|title\s+card)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'swap', template: 'headline', message: 'Switched to headline' });
  }
  if (/^(make\s+(it|this)\s+(a\s+)?|turn\s+(it|this)\s+into\s+(a\s+)?)(punch|punchline)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'swap', template: 'punch', message: 'Switched to punchline' });
  }
  if (/^(make\s+(it|this)\s+(a\s+)?|turn\s+(it|this)\s+into\s+(a\s+)?)(quote)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'swap', template: 'quote', message: 'Switched to quote' });
  }
  if (/^(make\s+(it|this)\s+(a\s+)?|turn\s+(it|this)\s+into\s+(a\s+)?)(statement)$/.test(lower)) {
    return attempt({ action: 'edit', field: 'swap', template: 'statement', message: 'Switched to statement' });
  }

  return null;
}

/** Runs the on-device reel note task (never reaches the cloud). */
export async function runReelNoteLocal(router: Router, input: ReelNoteLocalInput) {
  return router.run(reelNoteLocalTask(), input, { mode: 'ONLY_ON_DEVICE', allowCloud: false });
}
