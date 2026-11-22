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
import { stripUndefined } from './director';

export const REEL_COMPOSE_PROMPT_VERSION = 'v1';

const Code = z.object({
  html: z.string().max(REEL_CUSTOM_LIMITS.html),
  css: z.string().max(REEL_CUSTOM_LIMITS.css),
  script: z.string().max(REEL_CUSTOM_LIMITS.script),
});

export const ReelComposeInputSchema = z.object({
  /** The creator's note, verbatim. */
  note: z.string().trim().min(1).max(300),
  /** What the note step decided the new graphic should be. */
  brief: z.string().trim().min(3).max(1200),
  look: z.enum(['mono', 'cream']),
  layout: z.enum(['split', 'card', 'full', 'speaker']),
  /** The graphic's area on the 720 × 1280 stage, px. */
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
  return `You are a senior motion designer. You write ONE motion graphic for one scene of a vertical (9:16) talking-head reel, in deterministic HTML, CSS and JavaScript, because the creator circled it and asked for something new.
Answer with JSON only: { "title", "brief", "html", "css", "script", "keyMomentMs", "newPictures", "message" }.

DO EXACTLY WHAT THE NOTE ASKS
- The note is the spec. "Snappier" means faster entrances (200–350 ms), tighter staggers (60–140 ms), harder eases (outStrong, outQuart, back), punchier reveals that land on the spoken words. "Better symbols" means real, clear icons and diagrams (mp.icon, inline SVG, mp.tile, mp.window…) that show the idea, not decoration. "More animation" means more things move with purpose (counts, draws, wipes, word reveals, a moving camera), never idle wobble.
- Keep what the note doesn't touch: the message, the exact on-screen words and the facts of the current graphic, unless the note says otherwise. When the current graphic is code you wrote, revise it: change what the note asks and keep the rest.
- Never invent facts or numbers: use the current graphic, the note and the spoken words.

WHERE IT PLAYS
- Your root is the scene's graphic area: exactly W × H px (given), clipped. On layouts split, card and full the reel has ALREADY painted its background behind you (the palette's bg, with a fine grid on mono): leave your root transparent and never call mp.stage() or mp.sheet().
- Layout speaker: the speaker's video fills the whole frame behind you. Keep the face clear (22 %–56 % of the height) and the captions (76 %–92 %); dock your graphic in the top 20 % or the chest area (58 %–74 %) on a solid card (#FFFFFF with ink text, or rgba(10,10,14,0.92) with white text).
- Keep every text inside 6 % margins of your area, large and readable: labels at least calc(var(--u) * 2.8), headlines calc(var(--u) * 6) or more. --u is 1 % of 720 px (7.2 px).
- At most ~14 words of on-screen text. One clear idea.
- Contrast: var(--ink) on the painted bg; var(--bg) on var(--ink) or var(--accent) fills.

THE CONTRACT
- html: elements inside your root (position:absolute; inset:0). No <script>, <style>, <iframe>, <link>, <img>, inline handlers or external URLs. Inline <svg> is welcome.
- css: plain rules (scoped for you). No @-rules, no CSS animation or transition, no url(). Colours: var(--bg) var(--ink) var(--muted) var(--accent) var(--accent2) var(--highlight) var(--positive) var(--negative). Fonts: var(--display) var(--body) var(--mono). Sizes: calc(var(--u) * N). Never hide animated elements in CSS: tl.from() sets their start state.
- script: the body of a function called once with (root, ctx, mp). Declare every animation on ONE deterministic timeline and end with: return tl;
  ctx = { width, height, durationMs, keyMomentMs, seed, colors, fonts, words: [{ text, startMs, endMs }] } (times from the scene start). seek(t) may be called with any t in any order: everything must be a pure function of t.
  Not available: Date, performance, Math.random (use mp.rng(ctx.seed)), timers, requestAnimationFrame, fetch, window, document, globalThis, eval, Function, addEventListener, element.animate, any library.
- The scene has no sound of its own: don't call mp.sfx.
- The first thing must be visible within 150 ms; reveals land on the spoken words (on: "word"); text holds still once it lands; the graphic stays on screen to the end of the scene (the reel cuts away; no exit needed).
- Pictures: mp.image(id, { x, y, w, h, fit, shadow }) only with the ids listed. You may ask for up to 2 new pictures in "newPictures" (a logo: query "Brand name|domain.com"; a photo or illustration: query = a plain subject, no text, no real people); they become the next ids in order (if m0 and m1 are listed, your first new picture is m2) and appear once fetched, so the graphic must also read well without them.

THE ANSWER
- title: 2–5 words naming the graphic. brief: one or two sentences saying what it shows and how it moves (the next note starts from it). keyMomentMs: when the focal element lands (ms from the scene start, on a spoken word). message: one short sentence for the creator saying what you made ("Rebuilt it as a snappy three-step flow with icons.").

${kitDoc}`;
}

export function reelComposePromptV1(i: ReelComposeInput): string {
  const spoken = i.words.map((w, k) => `${k}:${w.text}@${w.startMs}`).join(' ');
  const cur =
    i.current.kind === 'template'
      ? [
          `NOW ON SCREEN: the reel's "${String(i.current.graphic['template'])}" template with the reel's standard motion: ${JSON.stringify(i.current.graphic)}`,
        ]
      : [
          `NOW ON SCREEN: the graphic you wrote before, "${i.current.title}": ${i.current.brief}`,
          `html:\n${i.current.html}`,
          `css:\n${i.current.css}`,
          `script:\n${i.current.script}`,
        ];
  const lines = [
    `Look: ${LOOK_TEXT[i.look]}`,
    `Palette: bg ${i.palette.bg}, ink ${i.palette.ink}, muted ${i.palette.muted}, accent ${i.palette.accent}, second accent ${i.palette.link}.`,
    `Layout: ${i.layout}. Your root: W ${i.area.w} × H ${i.area.h} px. Scene length: ${i.durationMs} ms.`,
    i.tag
      ? `The reel already shows the scene's tag "${i.tag}" centred at the top of your area (y 40–80 px): never draw it yourself, and keep the top 100 px free of your content.`
      : '',
    `Spoken words in the scene (index:word@ms): ${spoken || '(none)'}`,
    i.pictures.length
      ? `Pictures you may show: ${i.pictures.map((p) => `${p.id} = ${p.shows}`).join('; ')}`
      : 'Pictures you may show: none yet (ask in newPictures if one would help).',
    '',
    ...cur,
    i.image ? 'A picture of the circled area is attached.' : '',
    '',
    `CREATOR'S NOTE: "${i.note}"`,
    `WHAT TO MAKE: ${i.brief}`,
    '',
    'Reference craft for this kind of area (match its cleanliness and balance; never copy its topic or words):',
    `html:\n${i.example.html}`,
    `css:\n${i.example.css}`,
    `script:\n${i.example.script}`,
  ];
  if (i.fix) {
    lines.push(
      '',
      'REPAIR: your graphic was built and reviewed in the reel, and these problems were found. Fix every one and return the full updated JSON:',
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
