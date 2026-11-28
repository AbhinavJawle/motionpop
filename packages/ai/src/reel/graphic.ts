/**
 * `reel.graphic`: senior motion-designer storyboard director for standalone motion graphics (no
 * speaker video, no voiceover). Produces 1–4 rich, sequenced full-frame scenes with concrete visual
 * assets (keyed cutout illustrations, archival photos, logos, screenshots) and deep per-scene
 * art-direction blueprints so `reel.compose` can build agency/Vox-caliber bespoke Film Kit motion
 * graphics (with clean template fallbacks when offline or when a crisp data template fits best).
 */
import {
  APP_CONFIG_DEFAULTS,
  ReelPlanSchema,
  ReelSceneSchema,
  costOf,
  tileReelScenes,
  type Format,
  type ReelLook,
  type ReelMedia,
  type ReelPlan,
  type ReelScene,
} from '@motionpop/schemas';
import { z } from 'zod';
import type { Router, TaskDef } from '../router';
import {
  ReelDirectBriefSchema,
  recipeBlock,
  styleCraftDirection,
  type ReelDirectBrief,
} from './brief';
import {
  GraphicSchema,
  contentFor,
  cut,
  reelGraphicBranches,
  stripUndefined,
  type Graphic,
} from './director';

export const REEL_GRAPHIC_PROMPT_VERSION = 'v2';

const SPEAKER_ONLY = new Set(['punch', 'cta', 'none']);

export const ReelGraphicInputSchema = z.object({
  prompt: z.string().trim().min(1).max(1000),
  look: z.enum(['mono', 'cream']),
  format: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  /** Optional target total duration (ms). Absent = let the director pace naturally. */
  durationMs: z.number().int().min(1500).max(60_000).optional(),
  /** Recipe, chosen style, creator notes, and custom SKILL.md instructions. */
  brief: ReelDirectBriefSchema.optional(),
  /** Concrete motion-design & art-direction rules for the chosen visual style. */
  styleDirection: z.string().max(2400).optional(),
  /** Whether AI cutout illustrations/visuals are enabled (default true). */
  illustrations: z.boolean().optional(),
});
export type ReelGraphicInput = z.infer<typeof ReelGraphicInputSchema>;

const GraphicVisualSchema = z.object({
  kind: z.enum(['illustration', 'photo', 'logo', 'screenshot']),
  /** Concrete subject with NO text/words/watermarks (or "Brand|domain.com" for logo). */
  query: z.string().trim().min(1).max(160),
});

const GraphicSceneSchema = z.object({
  /** Scene length in milliseconds (2000–12000). */
  durationMs: z.number().int().min(1000).max(20_000).default(4000),
  bg: z.enum(['light', 'cream', 'dark']).optional(),
  tag: z.string().optional(),
  /** `custom`: bespoke layered Film Kit motion design (preferred for rich editorial/Vox/visual scenes). */
  mode: z.enum(['custom', 'template']).default('custom'),
  /** Detailed motion-designer brief for `reel.compose`: layout, depth layers, textures, typography, exact choreography. */
  artDirection: z.string().max(1200).optional(),
  /** 1–3 concrete visual assets to generate/fetch (`m0`, `m1`, `m2`) for this scene. */
  visuals: z.array(GraphicVisualSchema).max(3).default([]),
  /** Structured template fallback (also used directly when `mode === "template"` or offline). */
  graphic: GraphicSchema,
});

export const ReelGraphicOutputSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  brands: z.array(z.object({ name: z.string(), domain: z.string().optional() })).default([]),
  scenes: z.array(GraphicSceneSchema).min(1).max(8),
});
export type ReelGraphicOutput = z.input<typeof ReelGraphicOutputSchema>;

/** Per-scene blueprint returned alongside the base plan so the pipeline can compose custom scenes. */
export interface GraphicSceneBlueprint {
  sceneId: string;
  mode: 'custom' | 'template';
  artDirection: string;
  visuals: ReelMedia[];
}

function graphicJsonSchema(): Record<string, unknown> {
  const sl = (maxLength: number) => ({ type: 'string', maxLength });
  const graphicBranches = reelGraphicBranches().filter((b) => {
    const props = b['properties'] as Record<string, { enum?: string[] }> | undefined;
    const t = props?.['template']?.enum?.[0];
    return t !== undefined && !SPEAKER_ONLY.has(t);
  });
  return {
    type: 'object',
    properties: {
      title: sl(80),
      brands: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: sl(40), domain: sl(60) },
          required: ['name'],
        },
      },
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            durationMs: { type: 'integer' },
            bg: { type: 'string', enum: ['light', 'cream', 'dark'] },
            tag: sl(28),
            mode: { type: 'string', enum: ['custom', 'template'] },
            artDirection: sl(1200),
            visuals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['illustration', 'photo', 'logo', 'screenshot'] },
                  query: sl(160),
                },
                required: ['kind', 'query'],
              },
            },
            graphic: { anyOf: graphicBranches },
          },
          required: ['durationMs', 'mode', 'artDirection', 'graphic'],
        },
      },
    },
    required: ['scenes'],
  };
}

const SYSTEM = `You are a Creative Director & Senior Motion Designer (editorial documentary, hardware launch, flat-vector science, and financial data-graphics caliber) storyboarding standalone motion graphics for Motionpop.
There is NO speaker video and NO voiceover — every frame MUST command attention visually on its own, with real imagery, layered depth, tactile textures, crisp typography, and purposeful choreography (and remain compatible with transparent WebM export).

THINK LIKE AN EDITORIAL MOTION DESIGNER — NEVER LIKE A BORING SLIDE DECK:
1. SHOW REAL THINGS, NOT EMPTY TEXT SLIDES:
   - Never produce 3 plain text-only cards in a row (no boring white-grid headline → plain counter → clipped checklist).
   - For EVERY scene where a concrete place, object, building, person archetype, product, map, or metaphor fits, request 1–2 concrete visuals in \`visuals[]\` (e.g. \`kind: "illustration"\` for editorial cutout art of a building/landmark/object/diagram, \`kind: "photo"\` for archival/editorial photography, \`kind: "logo"\` for real brands with domain in \`brands[]\`, \`kind: "screenshot"\` for named websites).
   - Keep \`visuals[].query\` concrete and vivid (4–14 plain visual words describing the physical subject, angle, and key details — NO text/words/letters inside the picture, NO style jargon, NO watermarks). Example for White House: \`"neoclassical White House south portico facade with Ionic columns and lawn"\` or \`"architectural isometric cutaway floorplan of a historic executive mansion"\`.
2. BESPOKE MOTION DESIGN (\`mode: "custom"\`) VS TEMPLATES (\`mode: "template"\`):
   - Use \`mode: "custom"\` BY DEFAULT for rich editorial graphics, Vox/collage explainers, architectural/conceptual breakdowns, custom diagrams, hero title sequences with cutout imagery, annotated charts, and anything where layered depth, textures, tape/paper/halftone, curved callout arrows, highlighter wipes, and parallax make it 10× better.
   - Use \`mode: "template"\` ONLY when a pure clean built-in template (e.g., \`terminal\`, \`logos\`, \`website\`) is genuinely ideal on its own.
   - ALWAYS still populate \`graphic\` with a clean, un-truncated fallback template (respecting every short character limit: checklist labels ≤ 16 chars, compare labels ≤ 14 chars, list items ≤ 24 chars, titles ≤ 48 chars — NEVER let a word get cut off mid-word!).
3. WRITE SPECIFIC, CINEMATIC \`artDirection\` FOR EVERY SCENE (3–5 tight sentences):
   - Specify the 3-layer composition: (a) decorative backdrop inside \`.mp-backdrop\` (paper wash, graph-paper patch, halftone dots, geometric color block, tape strips, or dark ambient glow), (b) midground visual anchor (exact placement & size of \`m0\` / \`m1\` cutouts with drop shadows, torn paper cards, maps, charts, or SVG diagrams), and (c) foreground kinetic storytelling (headline + highlighted keyword via \`mp.mark\`, exact short facts/numbers, hand-drawn curved arrows via \`mp.line\` pointing to parts of the visual, and continuous subtle camera push).
   - Specify exact choreography timing across the scene's \`durationMs\` (opening beat at 0–200 ms, hero cutout/diagram reveal, highlight/arrow draw, stat count or secondary callout).
4. PACING & STORY ARC:
   - Default to 1 focused hero scene (4000–6000 ms) when the prompt asks for ONE standalone object/stat/chart/card.
   - Use 2–3 tight, escalating scenes (3500–5000 ms each, ~10–14 s total) when the prompt asks for a topic explainer or story (e.g. "design a vox style motion graphic about the white house" → Scene 1: Iconic cutout establishing shot + title + highlighter reveal; Scene 2: Architectural scale / cutaway breakdown with animated callouts & metric; Scene 3: Key wing/structure or historical highlight with layered collage comparison/map).
   - Keep on-screen copy razor-sharp (≤ 14 words per scene), truthful, and scannable at a glance. Never invent fake numbers for a user's own business metrics; well-known historical/public facts are great when explaining public topics (like the White House).
5. RESPECT THE RECIPE, VISUAL STYLE & CUSTOM SKILL (\`SKILL.md\`):
   - When a Recipe, Style Craft block, or Custom Director Skill is provided below, treat it as your primary creative mandate for color mood, surface textures, visual metaphors, typography, and pacing.

Available fallback templates for \`graphic\`:
- headline {title, kicker?, sub?, accent?}
- counter {value, label, prefix?, suffix?, decimals?, kicker?, icon?}
- chart {kind: 'line'|'bars', title, unit?, items[{text, value}]}
- list {title, kicker?, items[{word, text, icon?, brand?}]}
- stack {label, items[{word, text, brand?}]}
- checklist {kicker?, items[{word, text, value?}]} (keep text ≤ 16 chars!)
- compare {left, right, winner, leftIcon?, rightIcon?, leftBrand?, rightBrand?, items?} (left/right ≤ 14 chars!)
- statement {icon?, strike?, items[{word, text}]}
- progress {title, icon?, sub?, task?, doneTitle?}
- terminal {title?, items[{word, text, kind: 'cmd'|'out'|'ok'}]}
- browser {url, headline, sub?, button?}
- flow {items[{word, text, icon?, brand?}]}
- quote {items[{word, text}], highlight?}
- logo {brand, sub?} / logos {title?, items[{word, brand}]}
- image {kind: 'photo'|'illustration', subject, fit: 'frame'|'bleed', kicker?, title?, items?}
- website {domain, headline?}

For item fields that take \`word\`, set \`word: 0, 1, 2, ...\` in reveal order.
Return JSON only, matching the schema.`;

export function reelGraphicTask(): TaskDef<ReelGraphicInput, ReelGraphicOutput> {
  return {
    id: 'reel.graphic',
    promptVersion: REEL_GRAPHIC_PROMPT_VERSION,
    input: ReelGraphicInputSchema,
    output: ReelGraphicOutputSchema as unknown as z.ZodType<ReelGraphicOutput>,
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelStrong || APP_CONFIG_DEFAULTS.modelStrong,
    cloudCost: () => costOf('reel', 1, APP_CONFIG_DEFAULTS),
    cloudFallback: false,
    maxRepairs: 1,
    thinking: 'MEDIUM',
    maxOutputTokens: 8192,
    system: SYSTEM,
    prompt: (i) => {
      const styleBlock =
        i.styleDirection ??
        styleCraftDirection({
          styleId: i.brief?.style,
          customStyle: i.brief?.notes,
          promptHint: i.prompt,
        });
      return [
        `Look: ${i.look}`,
        `Format: ${i.format} (${i.format === '16:9' ? '1280×720 widescreen' : i.format === '1:1' ? '720×720 square' : '720×1280 vertical'})`,
        `AI Cutout Visuals / Illustrations: ${i.illustrations === false ? 'OFF (do not request kind="illustration"; use crisp inline SVG diagrams, maps, charts, photos, or logos instead)' : 'ON (actively plan 1–2 compelling cutout illustrations or photos per scene in visuals[])'}`,
        ...(i.durationMs ? [`Target total duration: ${i.durationMs} ms`] : []),
        '',
        styleBlock,
        ...(i.brief ? ['', recipeBlock(i.brief)] : []),
        '',
        'USER BRIEF (what to design):',
        i.prompt,
      ].join('\n');
    },
    jsonSchema: graphicJsonSchema,
  };
}

/** Deterministic local fallback when offline or if the model call fails. */
export function autoGraphicPlan(
  prompt: string,
  look: ReelLook,
  durationMs = 5000,
): ReelPlan {
  const cleanPrompt = prompt.trim();
  const safeDuration = Math.max(2500, Math.min(30_000, Math.round(durationMs)));
  const numMatch = /(\$?)(\d[\d,]*(?:\.\d+)?)(%|x|k|m|b)?/i.exec(cleanPrompt);
  const vsMatch = /^(.{2,24}?)\s+(?:vs\.?|versus)\s+(.{2,24}?)(?:[:.,!?]|$)/i.exec(cleanPrompt);
  const arrowParts = cleanPrompt
    .split(/\s*(?:->|→|,|;)\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 28);

  let content: ReelScene['content'];
  if (vsMatch) {
    content = {
      template: 'compare',
      left: cut(vsMatch[1], 14) ?? 'Before',
      right: cut(vsMatch[2], 14) ?? 'After',
      winner: 'right',
      leftIcon: 'x',
      rightIcon: 'check',
      rows: [],
    };
  } else if (arrowParts.length >= 2 && arrowParts.length <= 4 && /->|→|step/i.test(cleanPrompt)) {
    const stepGap = Math.round((safeDuration - 900) / arrowParts.length);
    content = {
      template: 'flow',
      steps: arrowParts.map((text, idx) => ({
        at: 260 + idx * Math.max(450, stepGap),
        icon: idx === arrowParts.length - 1 ? 'check' : 'arrow-right',
        text: cut(text, 16) ?? `Step ${idx + 1}`,
      })),
    };
  } else if (numMatch) {
    const rawNum = Number(numMatch[2]!.replace(/,/g, ''));
    const decimals = numMatch[2]!.includes('.') ? Math.min(2, numMatch[2]!.split('.')[1]!.length) : 0;
    const label = cut(cleanPrompt.replace(numMatch[0], '').replace(/\s+/g, ' ').trim(), 36) ?? cleanPrompt.slice(0, 36);
    content = {
      template: 'counter',
      value: Number.isFinite(rawNum) ? rawNum : 100,
      decimals,
      prefix: numMatch[1] ?? '',
      suffix: numMatch[3] ?? '',
      label: label || 'Key metric',
      icon: 'trending-up',
    };
  } else {
    const words = cleanPrompt.split(/\s+/).filter(Boolean);
    const title = cut(words.slice(0, 7).join(' '), 60) ?? 'Motion graphic';
    const sub = words.length > 7 ? cut(words.slice(7).join(' '), 80) : undefined;
    content = {
      template: 'headline',
      title,
      ...(sub ? { sub } : {}),
    };
  }

  return ReelPlanSchema.parse({
    v: 1,
    look,
    captions: false,
    graphicOnly: true,
    prompt: cleanPrompt.slice(0, 1000),
    scenes: [
      {
        id: 'g1',
        startMs: 0,
        endMs: safeDuration,
        layout: 'full',
        bg: look === 'mono' ? 'light' : 'cream',
        content,
      },
    ],
    by: 'auto',
  });
}

/** Converts `reel.graphic` output into a strict, tiled `ReelPlan` + custom scene blueprints. */
export function toGraphicPlan(
  raw: ReelGraphicOutput,
  prompt: string,
  look: ReelLook,
  by: string,
): { plan: ReelPlan; durationMs: number; title?: string; blueprints: GraphicSceneBlueprint[] } {
  const out = ReelGraphicOutputSchema.parse(raw);
  const brands = new Map(
    out.brands.map((b) => [b.name.trim().toLowerCase(), cut(b.domain, 60)]),
  );
  const scenes: ReelScene[] = [];
  const blueprints: GraphicSceneBlueprint[] = [];
  let cursor = 0;
  out.scenes.forEach((d, k) => {
    const span = Math.max(1500, Math.min(15_000, Math.round(d.durationMs)));
    const startMs = cursor;
    const endMs = cursor + span;
    const at = (_w: number | undefined, idx: number): number =>
      Math.min(endMs - 250, Math.round(startMs + 260 + idx * Math.min(650, (span - 500) / 5)));
    const content = contentFor(d.graphic as Graphic, at, brands);
    if (!content || SPEAKER_ONLY.has(content.template)) return;
    const sceneId = `g${k + 1}`;
    const candidate = {
      id: sceneId,
      startMs,
      endMs,
      layout: 'full' as const,
      ...(d.bg ? { bg: look === 'mono' && d.bg === 'cream' ? 'light' : d.bg } : {}),
      ...(look === 'mono' && d.tag ? { tag: cut(d.tag, 28) } : {}),
      content,
    };
    const parsed = ReelSceneSchema.safeParse(stripUndefined(candidate));
    if (parsed.success) {
      scenes.push(parsed.data);
      const visuals: ReelMedia[] = (d.visuals ?? [])
        .map((v) => {
          const q = v.query.trim().slice(0, 120);
          if (!q) return null;
          if (v.kind === 'logo') {
            const domain = brands.get(q.toLowerCase());
            return { kind: 'logo' as const, query: domain && !q.includes('|') ? `${q}|${domain}` : q };
          }
          return { kind: v.kind, query: q };
        })
        .filter((v): v is ReelMedia => Boolean(v));
      blueprints.push({
        sceneId,
        mode: d.mode ?? 'custom',
        artDirection: (d.artDirection ?? '').trim().slice(0, 1200),
        visuals,
      });
      cursor = endMs;
    }
  });
  if (scenes.length === 0) throw new Error('reel.graphic: no usable scenes');
  const durationMs = Math.max(2000, cursor);
  const plan = ReelPlanSchema.parse({
    v: 1,
    look,
    captions: false,
    graphicOnly: true,
    prompt: prompt.trim().slice(0, 1000),
    scenes: tileReelScenes(scenes, durationMs),
    by,
  });
  const title = cut(out.title, 80);
  return { plan, durationMs, ...(title ? { title } : {}), blueprints };
}

/**
 * Directs a standalone motion graphic from a user description prompt. Uses cloud Gemini when
 * available, falls back cleanly to `autoGraphicPlan` offline or on error.
 */
export async function directGraphic(
  router: Router | null,
  params: {
    prompt: string;
    look: ReelLook;
    format?: Format;
    durationMs?: number;
    brief?: ReelDirectBrief;
    styleDirection?: string;
    illustrations?: boolean;
    model?: string;
    preferOnDevice?: boolean;
  },
): Promise<{
  plan: ReelPlan;
  durationMs: number;
  title?: string;
  blueprints?: GraphicSceneBlueprint[];
  source: 'cloud' | 'device' | 'auto';
  error?: string;
}> {
  const { prompt, look, format = '16:9', durationMs, brief, styleDirection, illustrations } = params;
  const fallback = () => {
    const plan = autoGraphicPlan(prompt, look, durationMs ?? 5000);
    return {
      plan,
      durationMs: plan.scenes[plan.scenes.length - 1]!.endMs,
      source: 'auto' as const,
    };
  };
  if (!router) return fallback();
  try {
    const input: ReelGraphicInput = {
      prompt: prompt.trim().slice(0, 1000),
      look,
      format,
      ...(durationMs ? { durationMs } : {}),
      ...(brief ? { brief } : {}),
      ...(styleDirection ? { styleDirection: styleDirection.slice(0, 2400) } : {}),
      ...(illustrations !== undefined ? { illustrations } : {}),
    };
    const res = await router.run(reelGraphicTask(), input, {
      mode: params.preferOnDevice ? 'PREFER_ON_DEVICE' : 'ONLY_IN_CLOUD',
      ...(params.model ? { model: params.model } : {}),
    });
    const built = toGraphicPlan(res.output, prompt, look, res.model);
    return { ...built, source: res.ranOn };
  } catch (err) {
    return {
      ...fallback(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
