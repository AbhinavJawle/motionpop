/**
 * `reel.compose` (spec 30): a frame note asked for something the templates can't do ("make it
 * snappier, better symbols and animations"), so the strong model writes a new motion graphic for
 * that one scene, in the film kit, from the note, the scene's words and what is there now. A note
 * on a scene it wrote before revises that code. The answer is checked like every generated graphic
 * (the motion package's `lintCustom`, injected) and, in the editor, built and reviewed in a sandbox
 * before it lands (`inspectCustomScene`); problems go back for one repair each.
 */
import {
  APP_CONFIG_DEFAULTS,
  REEL_CUSTOM_LIMITS,
  ReelSceneSchema,
  costOf,
  type ReelLook,
  type ReelMedia,
  type ReelScene,
} from '@motionpop/schemas';
import { z } from 'zod';
import type { TaskDef } from '../router';
import { ReelDirectBriefSchema, recipeBlock } from './brief';
import { stripUndefined } from './director';

export const REEL_COMPOSE_PROMPT_VERSION = 'v2';

const Code = z.object({
  html: z.string().max(REEL_CUSTOM_LIMITS.html),
  css: z.string().max(REEL_CUSTOM_LIMITS.css),
  script: z.string().max(REEL_CUSTOM_LIMITS.script),
});

export const ReelComposeInputSchema = z.object({
  /** The creator's note or prompt, verbatim. */
  note: z.string().trim().min(1).max(300),
  /** What the director/note step decided the new graphic should be. */
  brief: z.string().trim().min(3).max(1200),
  look: z.enum(['mono', 'cream']),
  layout: z.enum(['split', 'card', 'pip', 'full', 'speaker']),
  /** Stage aspect ratio (`16:9` = 1280×720, `1:1` = 720×720, `9:16` = 720×1280). */
  format: z.enum(['16:9', '9:16', '1:1']).optional(),
  /** True for standalone graphics-only compositions (no speaker video, no voiceover). */
  graphicOnly: z.boolean().optional(),
  /** Optional recipe + custom SKILL.md director brief. */
  directorBrief: ReelDirectBriefSchema.optional(),
  /** Concrete visual style & motion craft rules (e.g. Vox paper collage, investigative newsprint, dark studio). */
  styleDirection: z.string().max(2400).optional(),
  /** The graphic's area on the stage, px. */
  area: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  palette: z.object({
    bg: z.string().max(40),
    ink: z.string().max(40),
    muted: z.string().max(40),
    accent: z.string().max(40),
    link: z.string().max(40),
  }),
  durationMs: z.number().int().min(300).max(120_000),
  /** The scene's tag: the reel pins it centred at the top of the area (mono). */
  tag: z.string().max(60).optional(),
  /** The scene's spoken words, times from the scene start. */
  words: z.array(z.object({ text: z.string().max(60), startMs: z.number().int() })).max(240),
  /** What is on screen now. */
  current: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('template'), graphic: z.record(z.string(), z.unknown()) }),
    Code.extend({
      kind: z.literal('custom'),
      title: z.string().max(60),
      brief: z.string().max(500),
    }),
  ]),
  /** Pictures the code may show with `mp.image(id)`: id and what it shows. */
  pictures: z.array(z.object({ id: z.string().regex(/^m\d$/), shows: z.string().max(120) })).max(8),
  /** The kit example matched to the layout. */
  example: Code,
  /** JPEG of the circled area (base64). */
  image: z.string().max(400_000).optional(),
  /** A repair after the sandbox review: the code that was built and what was wrong with it. */
  fix: Code.extend({ problems: z.string().max(4000) }).optional(),
});
export type ReelComposeInput = z.infer<typeof ReelComposeInputSchema>;

const NewPicture = z.object({
  kind: z.enum(['logo', 'photo', 'illustration']),
  query: z.string().trim().min(1).max(120),
});

export const ReelComposeOutputSchema = z.object({
  title: z.string().trim().min(1).max(60),
  /** One or two sentences: what the graphic shows and how it moves (the next note revises it). */
  brief: z.string().trim().min(1).max(500),
  html: z.string().max(REEL_CUSTOM_LIMITS.html),
  css: z.string().max(REEL_CUSTOM_LIMITS.css),
  script: z.string().min(1).max(REEL_CUSTOM_LIMITS.script),
  keyMomentMs: z.number().int().nonnegative(),
  /** New pictures to fetch, shown as the ids after the listed ones. */
  newPictures: z.array(NewPicture).max(2).default([]),
  /** One short sentence for the creator. */
  message: z.string().max(300).catch('').default(''),
});
export type ReelComposeOutput = z.infer<typeof ReelComposeOutputSchema>;

export function reelComposeJsonSchema(): Record<string, unknown> {
  const s = { type: 'string' };
  return {
    type: 'object',
    properties: {
      title: s,
      brief: s,
      html: s,
      css: s,
      script: s,
      keyMomentMs: { type: 'integer' },
      newPictures: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['logo', 'photo', 'illustration'] },
            query: s,
          },
          required: ['kind', 'query'],
        },
      },
      message: s,
    },
    required: ['title', 'brief', 'html', 'css', 'script', 'keyMomentMs', 'message'],
  };
}

const LOOK_TEXT: Record<ReelLook, string> = {
  mono: 'MONO: crisp black-and-white editorial on a fine grid. var(--display) is a heavy sans set in CAPITALS (text-transform: uppercase), var(--mono) for labels and numbers, var(--accent) is the one highlight colour. Hard edges, bold weights, strong contrast.',
  cream:
    'CREAM: warm paper. var(--display) is an editorial serif (italic for the key words), var(--body) a clean sans, soft dark ink, var(--accent) as the one highlight colour. Rounded soft cards, generous space, sentence case.',
};

export function reelComposeSystemV1(kitDoc: string): string {
  return `You are a Principal Motion Designer & Creative Technologist (Vox / Johnny Harris / Kurzgesagt / Apple Keynote / Bloomberg Graphics caliber). You write ONE bespoke, museum-grade motion graphic scene in deterministic HTML, CSS, inline SVG, and JavaScript using the Motionpop Film Kit (\`mp\`).
Answer with JSON only: { "title", "brief", "html", "css", "script", "keyMomentMs", "newPictures", "message" }.

THINK LIKE A SENIOR MOTION DESIGNER — CRAFT DEPTH, TEXTURE, AND CHOREOGRAPHY:
1. THREE-LAYER VISUAL DEPTH (NEVER A FLAT POWERPOINT SLIDE):
   - Layer 1 — Atmosphere & Graphic Anchors (put full-frame decorative background textures/patches inside \`<div class="mp-backdrop">...</div>\` so they render richly in MP4 and vanish cleanly when the creator exports Transparent WebM alpha!):
     Use subtle CSS radial washes, offset graph-paper patches (\`linear-gradient\` grids), halftone dot clusters (\`radial-gradient\` dot patterns), muted geometric color discs/blocks, angled masking-tape strips, or subtle dark ambient glows matched to the Visual Craft direction.
   - Layer 2 — Hero Visual Subject (35–55% of visual weight):
     ALWAYS feature listed \`pictures\` (\`m0\`, \`m1\`, ...) prominently via \`mp.image("m0", { parent: root.querySelector(".slot"), fit: "contain", shadow: true })\` — NEVER ignore a fetched picture! Complement with torn paper cards (\`mp.paper({ tilt, tape: true })\`), crisp multi-layer inline \`<svg>\` architectural/conceptual diagrams, real maps (\`mp.map\`), charts (\`mp.chart\`), macOS windows (\`mp.window\`), or 3D perspective cards (\`mp.card3d\`).
   - Layer 3 — Editorial Callouts & Kinetic Typography:
     Pair bold display typography (\`tl.words\`) with crisp monospace metadata tags/badges, hand-drawn highlighter wipes or underlines (\`mp.mark(el, "highlight" | "underline" | "circle")\` + \`tl.draw\`), animated curved pointer arrows (\`mp.line(..., { arrow: true, curve: true })\` + \`tl.draw\`) pointing directly at key visual features, and animated numbers (\`tl.count\` or \`mp.odometer\`).
2. CINEMATIC CHOREOGRAPHY (ZERO DEAD STATIC FRAMES):
   - Wrap the scene in \`.scene-cam { position: absolute; inset: 0; overflow: hidden; }\` and drive a continuous subtle camera push (\`tl.fromTo(".scene-cam", { scale: 1.0 }, { scale: 1.032 }, { at: 0, dur: ctx.durationMs, ease: "linear" })\`).
   - First visual layer lands within 120 ms (never a blank opening frame).
   - Stagger beats purposefully (80–160 ms apart) with crisp easing (\`back\`, \`outQuart\`, \`outStrong\`). Give cutout images a tactile pop-in (\`y: 44, scale: 0.9, rotate: -2.5\`) followed by gentle parallax drift (\`y: -10, rotate: 0.8\`, \`ease: "inOutSine"\`) — never cheap idle wobble.
   - If spoken \`words\` exist, land key reveals on spoken words (\`on: "word"\`). If \`words\` is empty (graphics-only), pace beats cleanly across \`0 .. ctx.durationMs * 0.72\` so everything lands with breathing room to read before the cut.
3. ADAPT TO THE EXACT STAGE ASPECT RATIO (W × H px):
   - Widescreen \`16:9\` (1280×720): use asymmetric editorial split compositions (e.g. left 44% typography + metric card, right 46% cutout hero + graph-paper patch + callout tag, OR panoramic horizontal collage/diagram). Keep all content cleanly within 6% margins.
   - Square \`1:1\` (720×720): tight balanced 2-zone composition (hero cutout + overlapping bold editorial headline & callout).
   - Vertical \`9:16\` (720×1280 or split top-half 720×640): stacked vertical composition (headline top, hero cutout/diagram center-bottom, or vice versa).
   - Layout \`speaker\`: the speaker fills the frame behind you. Keep the face clear (22%–56% height) and captions clear (76%–92%); dock on a crisp card in top 20% or chest area (58%–74%).
4. FOLLOW THE CREATIVE BRIEF, STYLE & CUSTOM SKILL (\`SKILL.md\`):
   - Obey the note/brief, Visual Craft direction, and any attached Custom Director Skill (\`SKILL.md\`) down to the palette, typography tone, surface texture, and motion personality.
   - Keep on-screen text crisp, truthful, and completely un-truncated (≤ 16 words total; use \`mp.fit(el, "90%")\` on large titles so nothing clips). Labels ≥ \`calc(var(--u) * 2.1)\`, headlines ≥ \`calc(var(--u) * 5.6)\` (\`--u\` = 1% of the frame's short side = 7.2 px).
   - High contrast always: \`var(--ink)\` on light/paper surfaces; \`var(--bg)\` on \`var(--ink)\` or \`var(--accent)\` fills.

THE CONTRACT
- Root is already painted with the scene's base palette behind you on \`split\`/\`card\`/\`full\`: NEVER call \`mp.stage()\` or \`mp.sheet()\` (keep your root itself transparent; put rich decorative backdrop elements inside \`<div class="mp-backdrop">\` so transparent WebM exports automatically drop only the backdrop!).
- \`html\`: elements inside root (\`position:absolute; inset:0\`). No \`<script>\`, \`<style>\`, \`<iframe>\`, \`<link>\`, \`<img>\`, inline handlers, or external URLs. Inline \`<svg>\` is welcome.
- \`css\`: plain rules (auto-scoped). No \`@\`-rules, no CSS \`animation\` or \`transition\`, no \`url()\`. Colors: \`var(--bg) var(--ink) var(--muted) var(--accent) var(--accent2) var(--highlight) var(--positive) var(--negative) var(--paper)\`. Fonts: \`var(--display) var(--body) var(--mono)\`. Sizes: \`calc(var(--u) * N)\`. Never hide animated elements in CSS: \`tl.from()\` sets their start state.
- \`script\`: function body called once with \`(root, ctx, mp)\`. Declare every animation on ONE deterministic timeline and end with \`return tl;\`.
  \`ctx = { width, height, durationMs, keyMomentMs, seed, colors, fonts, words }\`. Pure function of \`t\` — no Date, performance, Math.random (use \`mp.rng(ctx.seed)\`), timers, fetch, window, document, eval, Function, or external libraries. Don't call \`mp.sfx\`.
- Pictures: \`mp.image(id, { x, y, w, h, fit, shadow, parent })\` ONLY with ids listed in \`Pictures you may show\` (or new ids you request in \`newPictures\`). If \`m0\` is listed, USE IT prominently!

THE ANSWER
- \`title\`: 2–5 words naming the scene. \`brief\`: 1–2 sentences describing what it shows and how it moves. \`keyMomentMs\`: when the focal visual & headline have landed (ms from scene start, ≤ durationMs). \`message\`: one crisp sentence describing what you crafted.

${kitDoc}`;
}

export function reelComposePromptV1(i: ReelComposeInput): string {
  const spoken = i.words.map((w, k) => `${k}:${w.text}@${w.startMs}`).join(' ');
  const cur =
    i.current.kind === 'template'
      ? [
          `NOW ON SCREEN (${JSON.stringify(i.current.graphic.template ?? 'template')} template — base facts to elevate): ${JSON.stringify(i.current.graphic)}`,
        ]
      : [
          `NOW ON SCREEN (the graphic you wrote before, "${i.current.title}"): ${i.current.brief}`,
          `html:\n${i.current.html}`,
          `css:\n${i.current.css}`,
          `script:\n${i.current.script}`,
        ];
  const lines = [
    `Look: ${LOOK_TEXT[i.look]}`,
    `Palette: bg ${i.palette.bg}, ink ${i.palette.ink}, muted ${i.palette.muted}, accent ${i.palette.accent}, second accent ${i.palette.link}.`,
    `Format: ${i.format ?? (i.area.w > i.area.h ? '16:9' : i.area.w === i.area.h ? '1:1' : '9:16')}. Layout: ${i.layout}. Root size: W ${i.area.w} × H ${i.area.h} px. Scene duration: ${i.durationMs} ms.${i.graphicOnly ? ' Standalone graphics-only scene (no speaker video, no voiceover).' : ''}`,
    i.tag
      ? `The reel already shows the scene's tag "${i.tag}" centred at the top of your area (y 40–80 px): never draw it yourself, and keep the top 100 px free of your content.`
      : '',
    spoken ? `Spoken words in the scene (index:word@ms): ${spoken}` : 'Spoken words: (none — pace reveals cleanly across 0 to 70% of scene duration)',
    i.pictures.length
      ? `Pictures ALREADY FETCHED & READY TO RENDER (USE THEM with mp.image): ${i.pictures.map((p) => `${p.id} = ${p.shows}`).join('; ')}`
      : 'Pictures ready: none yet (use crisp multi-layer inline SVG diagrams, mp.paper, mp.chart, mp.map, or request up to 2 in newPictures).',
    ...(i.styleDirection ? ['', i.styleDirection] : []),
    ...(i.directorBrief ? ['', recipeBlock(i.directorBrief)] : []),
    '',
    ...cur,
    i.image ? 'A picture of the circled area is attached.' : '',
    '',
    `CREATOR'S NOTE: "${i.note}"`,
    `SCENE ART DIRECTION & CHOREOGRAPHY BRIEF:\n${i.brief}`,
    '',
    'Reference craft for this stage (match its depth, layering, contrast, and choreography — never copy its topic or words):',
    `html:\n${i.example.html}`,
    `css:\n${i.example.css}`,
    `script:\n${i.example.script}`,
  ];
  if (i.fix) {
    lines.push(
      '',
      'REPAIR: your graphic was built and reviewed in the sandbox, and these problems were found. Fix EVERY ONE and return the full updated JSON:',
      i.fix.problems,
      `Your html:\n${i.fix.html}`,
      `Your css:\n${i.fix.css}`,
      `Your script:\n${i.fix.script}`,
    );
  }
  return lines.filter((l, k, a) => l !== '' || a[k - 1] !== '').join('\n');
}

/** Why an answer can't be used, or null. */
export function checkReelCompose(
  out: ReelComposeOutput,
  input: ReelComposeInput,
  lint: (p: { html: string; css: string; script: string }) => string[],
): string | null {
  const problems = lint(out);
  if (out.keyMomentMs > input.durationMs)
    problems.push(
      `keyMomentMs (${out.keyMomentMs}) is after the scene's end (${input.durationMs})`,
    );
  // Ids past the scene's 8 pictures are dropped on apply: the code can't show them.
  const max = Math.min(8, input.pictures.length + out.newPictures.length);
  for (const m of out.script.matchAll(/mp\.image\(\s*["'`]([^"'`]+)["'`]/g)) {
    const id = m[1] ?? '';
    const n = /^m(\d)$/.exec(id);
    if (!n || Number(n[1]) >= max)
      problems.push(`mp.image("${id}") is not a listed picture or one you asked for`);
  }
  if (/\bmp\.(stage|sheet)\s*\(/.test(out.script) && input.layout !== 'speaker')
    problems.push('the background is already painted: remove mp.stage() / mp.sheet()');
  return problems.length ? `fix these problems: ${[...new Set(problems)].join('; ')}` : null;
}

export function reelComposeTask(
  lint: (p: { html: string; css: string; script: string }) => string[],
  kitDoc: string,
): TaskDef<ReelComposeInput, ReelComposeOutput> {
  return {
    id: 'reel.compose',
    input: ReelComposeInputSchema,
    output: ReelComposeOutputSchema as unknown as z.ZodType<ReelComposeOutput>,
    mode: () => 'ONLY_IN_CLOUD',
    model: (cfg) => cfg.modelStrong,
    system: reelComposeSystemV1(kitDoc),
    prompt: reelComposePromptV1,
    jsonSchema: reelComposeJsonSchema,
    // The new graphic is priced like a custom graphic; the caller reserves it before the call.
    // The repair after the sandbox review is part of the same graphic: logged at 0.
    cloudCost: (i) => (i.fix ? 0 : costOf('custom', 1, APP_CONFIG_DEFAULTS)),
    cloudFallback: false,
    maxRepairs: 1,
    promptVersion: REEL_COMPOSE_PROMPT_VERSION,
    // LOW: the same code in about half the time (spec 30 lab: 47 s against 112 s on MEDIUM).
    thinking: 'LOW',
    maxOutputTokens: 24_576,
    media: (i) => (i.image ? { mimeType: 'image/jpeg', base64: i.image } : undefined),
    check: (out, input) => checkReelCompose(out, input, lint),
  };
}

/**
 * The scene with the new graphic (pure): same id, times and notes; pictures the code may show are
 * the listed ones (kept with their stored asset) followed by the new requests. Throws when the
 * result isn't a valid scene.
 */
export function applyReelCompose(
  scene: ReelScene,
  look: ReelLook,
  out: ReelComposeOutput,
  pictures: readonly ReelMedia[],
): ReelScene {
  const media: ReelMedia[] = [
    ...pictures,
    ...out.newPictures.map((p) => ({ kind: p.kind, query: p.query.slice(0, 120) })),
  ].slice(0, 8);
  // AI-written scenes keep a graphic layout; on the speaker layout they overlay the video.
  const layout =
    look === 'mono' && scene.layout === 'card'
      ? 'split'
      : look === 'cream' && scene.layout === 'split'
        ? 'card'
        : scene.layout;
  const base: Partial<ReelScene> = { ...scene };
  delete base.carry;
  const candidate = {
    ...base,
    layout,
    content: {
      template: 'custom' as const,
      title: out.title,
      brief: out.brief,
      html: out.html,
      css: out.css,
      script: out.script,
      keyMomentMs: Math.min(out.keyMomentMs, Math.max(0, scene.endMs - scene.startMs)),
      ...(media.length ? { media } : {}),
    },
  };
  return ReelSceneSchema.parse(stripUndefined(candidate));
}
