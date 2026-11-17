// Film lab, setups S1 to S3 (docs/research/film-mode.md): the Suez voiceover as nine custom
// graphics, each generated alone through the `custom.compose` contract, with one repair like the
// product. S1 is today's prompt. S2 adds the distilled craft rules. S3 adds the film kit.
// Usage: node scripts/run-film-lab.ts run --setup s1 --model gemini-3.8-flash [--beats b1,b2] [--video] [--reuse]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CUSTOM_COMPOSE_SYSTEM_V1,
  customComposePromptV1,
} from '../../../ai/src/prompts/custom-compose.v1';
import { customExample, customParams, lintCustom } from '../../src/components/custom';
import { KIT_DOC, kitExample } from '../../src/film/doc';
import type { CompileSlot } from '../../src/compiler';
import { CRAFT_RULES } from './craft';
import { FIXTURES, loadBeats, loadVoiceover, type FixedBeat } from './data';
import { generate, parseJson, setLedger, usage } from './gemini';
import { shoot } from './shoot';

const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (k: string) => args.includes(`--${k}`);
const setup = (opt('setup') ?? 's1') as 's1' | 's2' | 's3';
const model = opt('model') ?? 'gemini-3.8-flash';
const only = opt('beats')?.split(',');
const lookId = opt('look') ?? 'newsprint';
const LOOK_NAME: Record<string, string> = { newsprint: 'Newsprint' };

/** The answer shape of `custom.compose` (the same JSON schema the product sends). */
const ANSWER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    html: { type: 'string' },
    css: { type: 'string' },
    script: { type: 'string' },
    keyMomentMs: { type: 'integer' },
  },
  required: ['title', 'html', 'css', 'script', 'keyMomentMs'],
};

const S3_SYSTEM = [
  'You write one premium motion graphic for a video editor. It plays over a voiceover, on the words given.',
  'Answer with JSON only: { "title", "html", "css", "script", "keyMomentMs" }.',
  '',
  "The graphic fills the whole frame, on the look's paper ground (leave the background transparent unless the picture needs its own). Your three parts:",
  '- html: the elements, inside a root that is position:absolute; inset:0. No <script>, <style>, <iframe>, <link>, inline event handlers or external URLs. Inline <svg> is fine and encouraged for pictures.',
  "- css: plain rules, scoped for you. No @-rules, no animation or transition properties, no url(). Colours: var(--bg) var(--ink) var(--muted) var(--accent) var(--accent2) var(--highlight) var(--paper). Fonts: var(--display) var(--body) var(--mono). Size with calc(var(--u) * N): --u is 1 % of the frame's short side. Don't hide or move animated elements in css; the timeline does that.",
  '- script: the body of a function called once with (root, ctx, mp). It builds things, declares the motion on a timeline and must end by returning the timeline (or { seek(t) { … } }).',
  '  seek(t) is called with any time t in ms from 0 to ctx.durationMs, in any order. The same t must always give the same frame.',
  '  ctx = { width, height, format ("16:9" | "9:16" | "1:1"), durationMs, keyMomentMs, seed, colors, fonts, words: [{ text, startMs, endMs }] }.',
  '  Not available: Date, performance, Math.random, timers, requestAnimationFrame, fetch, window, document, globalThis, eval, Function, addEventListener, element.animate, GSAP or any library. Find elements with root.querySelector.',
  '',
  KIT_DOC,
  '',
  CRAFT_RULES,
  '',
  'Also:',
  "- Build from the spoken words and numbers; never invent facts the brief and words don't give. Place names, labels and units that support the picture are fine.",
  "- keyMomentMs: when the hero lands (a spoken word's time). title: 2 to 5 words naming the graphic.",
  '- Keep text inside mp.safe. For 9:16 stack vertically.',
].join('\n');

function systemFor(): string {
  if (setup === 's1') return CUSTOM_COMPOSE_SYSTEM_V1;
  if (setup === 's2') return [CUSTOM_COMPOSE_SYSTEM_V1, '', CRAFT_RULES].join('\n');
  return S3_SYSTEM;
}

function promptFor(b: FixedBeat): string {
  const durationMs = b.endMs - b.startMs;
  const text = b.words.map((w) => w.text).join(' ');
  if (setup !== 's3') {
    const ex = customExample();
    return customComposePromptV1({
      brief: b.brief,
      words: text,
      durationMs,
      format: '16:9',
      look: { name: LOOK_NAME[lookId] ?? lookId },
      example: { html: ex.html, css: ex.css, script: ex.script },
    });
  }
  const ex = kitExample();
  const spoken = b.words.map((w, i) => [i, ':', w.text, '@', w.startMs].join('')).join(' ');
  return [
    'Brief: ' + b.brief,
    'Spoken words (index:word@ms): ' + spoken,
    'Duration: ' +
      durationMs +
      ' ms · Format: 16:9 · Look: ' +
      (LOOK_NAME[lookId] ?? lookId) +
      ' (newsprint collage: warm paper ground, serif display, red accent, yellow highlighter, torn paper)',
    '',
    'A complete example of the contract (a different graphic; do not copy its idea or layout):',
    'html: ' + ex.html,
    'css: ' + ex.css,
    'script:\n' + ex.script,
  ].join('\n');
}

interface BeatRun {
  id: string;
  ok: boolean;
  attempts: number;
  firstProblems: string[];
  finalProblems: string[];
  latencyMs: number;
  outTokens: number;
  params?: Record<string, unknown>;
}

async function generateBeat(b: FixedBeat, dir: string): Promise<BeatRun> {
  const file = join(dir, b.id + '.json');
  if (flag('reuse') && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as BeatRun;
  const durationMs = b.endMs - b.startMs;
  const system = systemFor();
  const run: BeatRun = {
    id: b.id,
    ok: false,
    attempts: 0,
    firstProblems: [],
    finalProblems: [],
    latencyMs: 0,
    outTokens: 0,
  };
  const history: { role: 'user' | 'model'; text: string }[] = [];
  let ask = promptFor(b);
  // One repair, as in the product (maxRepairs: 1).
  for (let attempt = 0; attempt < 2; attempt++) {
    run.attempts++;
    let problems: string[] = [];
    let text = '';
    try {
      const res = await generate({
        model,
        system,
        prompt: ask,
        jsonSchema: ANSWER_SCHEMA,
        thinking: 'MEDIUM',
        history,
      });
      text = res.text;
      run.latencyMs += res.latencyMs;
      run.outTokens += res.outTokens;
      const parsed = customParams.safeParse({ ...(parseJson(text) as object), brief: b.brief });
      if (!parsed.success)
        problems = parsed.error.issues.map((x) => x.path.join('.') + ': ' + x.message);
      else {
        problems = lintCustom(parsed.data);
        if ((parsed.data.keyMomentMs ?? 0) > durationMs)
          problems.push('keyMomentMs is after the end');
        if (problems.length === 0) {
          run.ok = true;
          run.params = parsed.data as unknown as Record<string, unknown>;
        }
      }
    } catch (e) {
      problems = [String(e instanceof Error ? e.message : e).slice(0, 300)];
    }
    if (attempt === 0) run.firstProblems = problems;
    run.finalProblems = problems;
    if (run.ok) break;
    history.push({ role: 'user', text: ask }, { role: 'model', text: text || '{}' });
    ask = 'fix these problems: ' + problems.join('; ');
  }
  writeFileSync(file, JSON.stringify(run, null, 1));
  return run;
}

async function pool<T, R>(items: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

const vo = loadVoiceover();
const beats = loadBeats(vo).filter((b) => !only || only.includes(b.id));
const name = setup + '-' + model;
const outDir = join(pkgDir, '.check', 'film-lab', name);
mkdirSync(join(outDir, 'beats'), { recursive: true });
setLedger(join(pkgDir, '.check', 'film-lab', 'ledger.jsonl'));
console.log(name + ': ' + beats.length + ' beats');
const runs = await pool(beats, 3, (b) => generateBeat(b, join(outDir, 'beats')));
const slots: CompileSlot[] = [];
for (const b of beats) {
  const r = runs.find((x) => x.id === b.id);
  if (!r?.ok || !r.params) continue;
  slots.push({
    id: b.id,
    componentId: 'custom',
    startMs: b.startMs,
    endMs: b.endMs,
    params: r.params,
    words: b.words,
  });
}
const shot = await shoot({
  outDir,
  format: '16:9',
  lookId,
  durationMs: vo.durationMs,
  slots,
  voice: join(FIXTURES, vo.audio),
  video: flag('video'),
  label: name,
});
const summary = {
  setup,
  model,
  beats: beats.map((b) => {
    const r = runs.find((x) => x.id === b.id) as BeatRun;
    const c = shot.critic[b.id];
    return {
      id: b.id,
      valid: r.ok,
      attempts: r.attempts,
      firstProblems: r.firstProblems,
      latencyMs: r.latencyMs,
      outTokens: r.outTokens,
      runtimeErrors: shot.errors
        .filter((e) => e.slotId === b.id)
        .map((e) => e.phase + ': ' + e.message),
      critic: c?.reports ?? [],
      stats: c?.stats ?? null,
    };
  }),
  usage: { ...usage },
};
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
for (const b of summary.beats) {
  const fixes = b.critic.filter((c) => c.level === 'fix').map((c) => c.rule);
  console.log(
    [
      b.id,
      b.valid ? 'ok ' : 'BAD',
      'tries=' + b.attempts,
      Math.round(b.latencyMs / 1000) + 's',
      'shapes=' + (b.stats?.shapes ?? '-'),
      'words=' + (b.stats?.textWords ?? '-'),
      'frames=' + (b.stats?.distinctFrames ?? '-'),
      b.runtimeErrors.length ? 'ERR ' + (b.runtimeErrors[0] ?? '').slice(0, 90) : '',
      fixes.length ? 'fix:' + fixes.join(',') : '',
    ].join(' '),
  );
}
console.log('sheet → ' + shot.sheet + (shot.video ? '\nvideo → ' + shot.video : ''));
console.log('cost so far: $' + usage.usd.toFixed(4) + ' over ' + usage.calls + ' calls');
