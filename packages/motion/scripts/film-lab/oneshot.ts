// Film lab, one-shot film (docs/research/film-mode-test.md): the WHOLE voiceover as ONE
// `custom.compose` graphic in a single model call, no scene labels, the 12 s cap lifted. The
// model writes a storyboard first (one visual idea per beat, one shared world, one recurring
// element), then the code. One repair, as in the product (lint or runtime errors).
// Usage: node scripts/run-film-lab.ts oneshot --vo coffee --model gemini-3.8-pro [--format 9:16] [--look newsprint]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { customParams, lintCustom } from '../../src/components/custom';
import { KIT_DOC, kitExample } from '../../src/film/doc';
import type { Format } from '../../src/contract';
import { CRAFT_RULES } from './craft';
import { FIXTURES, loadVoiceover } from './data';
import { generate, parseJson, setLedger, usage } from './gemini';
import { shoot } from './shoot';

const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const voId = opt('vo') ?? 'coffee';
const model = opt('model') ?? 'gemini-3.8-flash';
const format = (opt('format') ?? '9:16') as Format;
const lookId = opt('look') ?? 'newsprint';
const thinking = (opt('thinking') ?? 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH';

/** Lab-only: the product caps (12k html/css, 24k script) are for one 4.5 s graphic. */
const filmParams = customParams.extend({
  html: z.string().max(60_000),
  css: z.string().max(40_000),
  script: z.string().max(120_000),
});

const ANSWER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    storyboard: {
      type: 'object',
      properties: {
        world: { type: 'string' },
        recurring: { type: 'string' },
        current: { type: 'string' },
        beats: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fromWord: { type: 'integer' },
              toWord: { type: 'integer' },
              meaning: { type: 'string' },
              picture: { type: 'string' },
              seam: { type: 'string' },
            },
            required: ['fromWord', 'toWord', 'meaning', 'picture', 'seam'],
          },
        },
      },
      required: ['world', 'recurring', 'current', 'beats'],
    },
    title: { type: 'string' },
    html: { type: 'string' },
    css: { type: 'string' },
    script: { type: 'string' },
    keyMomentMs: { type: 'integer' },
  },
  required: ['storyboard', 'title', 'html', 'css', 'script', 'keyMomentMs'],
};

/** Distilled from .claude/skills/motion-doctrine (whole-film rules; craft.ts has the per-graphic ones). */
const DOCTRINE = `Film doctrine. The video must feel like ONE continuous camera move, not a stack of slides.
- The current: pick ONE dominant direction (default left). Every ordinary beat change moves that way. Other directions are reserved and mean something: up = a conclusion rises; zoom in = deeper into the same thought; zoom out = something bigger arrives.
- Vector law: how a beat exits decides how the next enters. Same axis, same direction, matched speed; cut mid-motion on both sides (exit accelerating "in", entry decelerating "out", entry already >= 50 % through its path). Never mirror; never ping-pong.
- Carriers: the eye follows objects. Hand a concrete element across each cut (the recurring element, a coin, a line) at matching position and speed. Never crossfade.
- Causal motion: each move is launched by the last (impact -> recoil -> reveal), on the same frame.
- No idle wobble: no breathing, floating or pulsing to fill time. Between entry and exit every beat keeps performing through staged reveals on the narration, a camera with intent (establish wide -> travel -> arrive), counts ticking, or elements acting out the idea.
- Stillness before climax: 300 to 750 ms of stillness between the big action and its result.
- Use only 2 or 3 transition kinds in the whole film and repeat them.
- Audio is the clock: every element lands on the spoken word that names it.`;

const SYSTEM = [
  'You direct and build a COMPLETE short vertical motion-graphics film for a voiceover, in one answer. It plays over the whole voiceover, from the first word to the last.',
  'Answer with JSON only: { "storyboard", "title", "html", "css", "script", "keyMomentMs" }.',
  '',
  'WRITE THE STORYBOARD FIRST, then the code that follows it exactly.',
  '- storyboard.world: ONE shared world for the whole film (a place, a surface, a set) that every beat lives in. The camera travels through it; beats are not separate pages.',
  '- storyboard.recurring: ONE recurring element (a drawing or object) that appears in most beats and carries the eye across cuts.',
  '- storyboard.current: the dominant direction of travel.',
  '- storyboard.beats: split the words into beats yourself (fromWord/toWord are word indexes, covering every word in order). For each beat: meaning (what the narrator means), picture (ONE visual idea that SHOWS the meaning, e.g. "10 cents vs $4" as two stacks of coins of very different height; a habit as a calendar filling up), seam (how it hands over to the next beat).',
  '',
  "The film fills the whole frame, on the look's paper ground. Your three parts:",
  '- html: the elements, inside a root that is position:absolute; inset:0. No <script>, <style>, <iframe>, <link>, inline event handlers or external URLs. Inline <svg> is fine and encouraged for pictures.',
  "- css: plain rules, scoped for you. No @-rules, no animation or transition properties, no url(). Colours: var(--bg) var(--ink) var(--muted) var(--accent) var(--accent2) var(--highlight) var(--paper). Fonts: var(--display) var(--body) var(--mono). Size with calc(var(--u) * N): --u is 1 % of the frame's short side. Don't hide or move animated elements in css; the timeline does that.",
  '- script: the body of a function called once with (root, ctx, mp). It builds everything, declares ALL the motion of the whole film on one timeline, and must end by returning the timeline (or { seek(t) { … } }).',
  '  seek(t) is called with any time t in ms from 0 to ctx.durationMs, in any order. The same t must always give the same frame. Elements of a finished beat must be gone (moved off or hidden by the timeline) before the next beat needs the space.',
  '  ctx = { width, height, format, durationMs, keyMomentMs, seed, colors, fonts, words: [{ text, startMs, endMs }] } — ctx.words is the whole voiceover, times from the start of the film.',
  '  Not available: Date, performance, Math.random, timers, requestAnimationFrame, fetch, window, document, globalThis, eval, Function, addEventListener, element.animate, GSAP or any library. Find elements with root.querySelector.',
  '  mp.at(word) finds the FIRST time a word is said; for a repeated word pass its word index (mp.at(37)) instead.',
  '',
  KIT_DOC,
  '',
  DOCTRINE,
  '',
  CRAFT_RULES,
  '',
  'Also:',
  "- Build from the spoken words and numbers; never invent figures the narration doesn't say. Labels and units that support a picture are fine.",
  '- The format is vertical 9:16: stack vertically, keep text inside mp.safe, hero text large (a phone screen).',
  '- keyMomentMs: the time of the film\'s biggest payoff. title: 2 to 5 words.',
].join('\n');

function prompt(vo: ReturnType<typeof loadVoiceover>): string {
  const ex = kitExample();
  const spoken = vo.words.map((w, i) => `${i}:${w.text}@${w.startMs}`).join(' ');
  return [
    `Voiceover: "${vo.words.map((w) => w.text).join(' ')}"`,
    'Spoken words (index:word@ms): ' + spoken,
    `Duration: ${vo.durationMs} ms · Format: ${format} · Look: newsprint collage (warm paper ground, serif display, red accent, yellow highlighter, torn paper)`,
    '',
    'A complete example of the contract (one short graphic on a different topic; do not copy its idea or layout):',
    'html: ' + ex.html,
    'css: ' + ex.css,
    'script:\n' + ex.script,
  ].join('\n');
}

const vo = loadVoiceover(voId);
const name = `oneshot-${voId}-${model}-${format.replace(':', 'x')}`;
const outDir = join(pkgDir, '.check', 'film-lab', name);
mkdirSync(outDir, { recursive: true });
setLedger(join(pkgDir, '.check', 'film-lab', 'ledger.jsonl'));
writeFileSync(join(outDir, 'system.txt'), SYSTEM);

const history: { role: 'user' | 'model'; text: string }[] = [];
let ask = prompt(vo);
const attempts: { problems: string[]; latencyMs: number; inTokens: number; outTokens: number; thoughtTokens: number }[] = [];
let final: z.output<typeof filmParams> | null = null;
let storyboard: unknown = null;
let shot: Awaited<ReturnType<typeof shoot>> | null = null;
const wall = Date.now();
for (let attempt = 0; attempt < 2; attempt++) {
  let problems: string[] = [];
  let text = '';
  const rec = { problems, latencyMs: 0, inTokens: 0, outTokens: 0, thoughtTokens: 0 };
  try {
    const res = await generate({
      model,
      system: SYSTEM,
      prompt: ask,
      jsonSchema: ANSWER_SCHEMA,
      thinking,
      maxOutputTokens: Number(opt('max-out') ?? 64_000),
      temperature: 0.4,
      history,
    });
    text = res.text;
    Object.assign(rec, { latencyMs: res.latencyMs, inTokens: res.inTokens, outTokens: res.outTokens, thoughtTokens: res.thoughtTokens });
    writeFileSync(join(outDir, `answer-${attempt}.json`), text);
    const raw = parseJson(text) as { storyboard?: unknown };
    storyboard = raw.storyboard ?? storyboard;
    const parsed = filmParams.safeParse({ ...(raw as object), brief: 'Whole film' });
    if (!parsed.success) problems = parsed.error.issues.map((x) => x.path.join('.') + ': ' + x.message);
    else {
      problems = lintCustom(parsed.data);
      if (problems.length === 0) {
        shot = await shoot({
          outDir,
          format,
          lookId,
          durationMs: vo.durationMs,
          slots: [{ id: 'film', componentId: 'custom', startMs: 0, endMs: vo.durationMs, params: parsed.data as never, words: vo.words }],
          shares: Array.from({ length: 16 }, (_, i) => (i + 0.5) / 16),
          label: name,
        });
        problems = shot.errors.map((e) => `runtime ${e.phase}: ${e.message}`);
        final = parsed.data;
      }
    }
  } catch (e) {
    problems = [String(e instanceof Error ? e.message : e).slice(0, 400)];
  }
  rec.problems = problems;
  attempts.push(rec);
  console.log(`attempt ${attempt + 1}: ${problems.length ? problems.slice(0, 4).join(' | ') : 'clean'} (${Math.round(rec.latencyMs / 1000)} s, out ${rec.outTokens} tok)`);
  if (problems.length === 0) break;
  if (attempt === 1) break;
  // No answer at all (network, quota): a repair prompt would make no sense.
  if (!text) break;
  history.push({ role: 'user', text: ask }, { role: 'model', text: text || '{}' });
  ask = 'Fix these problems and answer with the whole corrected JSON: ' + problems.join('; ');
}
writeFileSync(
  join(outDir, 'summary.json'),
  JSON.stringify(
    {
      model,
      vo: voId,
      format,
      thinking,
      ok: !!final && (shot?.errors.length ?? 1) === 0,
      wallMs: Date.now() - wall,
      attempts,
      sizes: final ? { html: final.html.length, css: final.css.length, script: final.script.length } : null,
      critic: shot?.critic ?? null,
      runtimeErrors: shot?.errors ?? [],
      storyboard,
      usage: { ...usage },
    },
    null,
    1,
  ),
);
if (final) writeFileSync(join(outDir, 'params.json'), JSON.stringify(final, null, 1));
console.log(`${name}: ${final ? 'composition → ' + join(outDir, 'index.html') : 'NO VALID FILM'}`);
console.log(`voice: ${join(FIXTURES, vo.audio)}`);
console.log(`cost: $${usage.usd.toFixed(4)} over ${usage.calls} calls, wall ${Math.round((Date.now() - wall) / 1000)} s`);
