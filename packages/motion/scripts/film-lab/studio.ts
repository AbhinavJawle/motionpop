// Film lab, STUDIO: an agentic pipeline for the best film we can make (founder ask 2026-11-18:
// "do whatever it takes"). Director (storyboard + art direction) → builders in parallel (one raw
// HTML page each, real libraries injected) → inspector (contract + layout) → vision critic on the
// rendered stills → fixer edits → inspect + critique again, keeping the best version.
// Usage: node scripts/run-film-lab.ts studio --vo coffee [--director gemini-4-carbon]
//   [--builders gemini-4-carbon,gemini-4-hydrogen] [--critic gemini-4-carbon] [--rounds 2] [--name x]
//   [--resume]  (reuse storyboard.json and candidate films already in the run folder; a cut-off
//   film is continued) [--extra round-1]  (earlier revisions join as candidates)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadVoiceover, type Voiceover } from './data';
import { generate, parseJson, setLedger, usage } from './gemini';
import {
  BUILDER_SYSTEM,
  CRITIC_SCHEMA,
  CRITIC_SYSTEM,
  DIRECTOR_SYSTEM,
  FIXER_SYSTEM,
  STORYBOARD_SCHEMA,
} from './studio/brief';
import { inspect, type Inspection } from './studio/inspect';
import { injectLibs, installLibs } from './studio/libs';

const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const voId = opt('vo') ?? 'coffee';
const directorModel = opt('director') ?? 'gemini-4-carbon';
const builders = (opt('builders') ?? 'gemini-4-carbon').split(',');
const criticModel = opt('critic') ?? 'gemini-4-carbon';
const rounds = Number(opt('rounds') ?? 2);
const resume = args.includes('--resume');

interface Beat {
  startMs: number;
  endMs: number;
  narration: string;
  picture: string;
  hero: string;
  landsOn: string;
}
interface Storyboard {
  title: string;
  beats: Beat[];
  [k: string]: unknown;
}
interface Critique {
  score: number;
  verdict: string;
  issues: { beat: number; atMs: number; severity: string; problem: string; fix: string }[];
}
interface Version {
  label: string;
  dir: string;
  html: string;
  insp: Inspection;
  crit: Critique | null;
}

const vo = loadVoiceover(voId);
const runName = opt('name') ?? `studio-${voId}`;
const outDir = join(pkgDir, '.check', 'film-lab', runName);
mkdirSync(outDir, { recursive: true });
setLedger(join(pkgDir, '.check', 'film-lab', 'ledger.jsonl'));
const wall = Date.now();
const log = (s: string) => console.log(`[${Math.round((Date.now() - wall) / 1000)}s $${usage.usd.toFixed(2)}] ${s}`);
const report: Record<string, unknown> = { vo: voId, directorModel, builders, criticModel, rounds, steps: [] };
const step = (s: Record<string, unknown>) => (report['steps'] as unknown[]).push(s);

function voicePrompt(v: Voiceover): string {
  return [
    `Voiceover script:\n"${v.words.map((w) => w.text).join(' ')}"`,
    '',
    `Duration: ${v.durationMs} ms.`,
    'Word timings (word@startMs-endMs), measured from the audio:',
    v.words.map((w) => `${w.text}@${w.startMs}-${w.endMs}`).join(' '),
  ].join('\n');
}

function extractHtml(text: string): string | null {
  const m = text.match(/```html\s*([\s\S]*?)```/i) ?? text.match(/```\s*(<!doctype[\s\S]*?)```/i);
  if (m?.[1]) return m[1].trim();
  const i = text.search(/<!doctype html|<html/i);
  return i >= 0 ? text.slice(i).trim() : null;
}

/** Beats tile 0..duration in order (code owns the times; the director owns the ideas). */
function tileBeats(sb: Storyboard, durationMs: number): Storyboard {
  const beats = [...sb.beats].sort((a, b) => a.startMs - b.startMs);
  beats.forEach((b, i) => {
    b.startMs = i === 0 ? 0 : beats[i - 1]!.endMs;
    if (i === beats.length - 1) b.endMs = durationMs;
    if (b.endMs <= b.startMs) b.endMs = Math.min(durationMs, b.startMs + 1500);
  });
  return { ...sb, beats };
}

function wordsAround(ms: number): string {
  return vo.words
    .filter((w) => w.endMs >= ms - 1200 && w.startMs <= ms + 600)
    .map((w) => w.text)
    .join(' ');
}

function sampleTimes(sb: Storyboard) {
  return sb.beats.flatMap((b, i) =>
    [0.45, 0.88].map((k) => {
      const ms = Math.round(b.startMs + (b.endMs - b.startMs) * k);
      return { ms, beat: i, words: wordsAround(ms) };
    }),
  );
}

async function direct(): Promise<Storyboard> {
  const file = join(outDir, 'storyboard.json');
  if (resume && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as Storyboard;
  log(`director ${directorModel}…`);
  const res = await generate({
    model: directorModel,
    system: DIRECTOR_SYSTEM,
    prompt: voicePrompt(vo),
    jsonSchema: STORYBOARD_SCHEMA,
    thinking: 'HIGH',
    maxOutputTokens: 65_536,
    temperature: 1,
  });
  const sb = tileBeats(parseJson(res.text) as Storyboard, vo.durationMs);
  writeFileSync(file, JSON.stringify(sb, null, 1));
  step({ step: 'direct', model: directorModel, ms: res.latencyMs, beats: sb.beats.length, outTokens: res.outTokens });
  log(`storyboard "${sb.title}", ${sb.beats.length} beats`);
  return sb;
}

function save(dir: string, html: string): string {
  mkdirSync(dir, { recursive: true });
  installLibs(dir);
  const file = join(dir, 'film.html');
  writeFileSync(file, injectLibs(html));
  return file;
}

async function check(label: string, dir: string, html: string, sb: Storyboard): Promise<Version> {
  const file = save(dir, html);
  rmSync(join(dir, 'stills'), { recursive: true, force: true });
  const insp = await inspect(file, vo.durationMs, sampleTimes(sb), join(dir, 'stills'));
  log(`${label}: ${insp.blocking.length} blocking, ${insp.layout.length} layout findings`);
  return { label, dir, html: readFileSync(file, 'utf8'), insp, crit: null };
}

const buildPrompt = (sb: Storyboard) =>
  `${voicePrompt(vo)}\n\nYour creative director's storyboard:\n${JSON.stringify(sb, null, 1)}`;

/** Junk end markers a long decode can emit when it degenerates. */
const stripJunk = (t: string) => t.replace(/<end_of_\w+>/g, '').replace(/\s*```\s*$/, '');

/**
 * A long answer can stop mid-document (a degenerate last hop). Ask the same model to continue
 * exactly where it stopped, up to twice, and join the parts.
 */
async function complete(model: string, prompt: string, html: string): Promise<string> {
  let doc = stripJunk(html);
  for (let i = 0; i < 2 && !/<\/html>\s*$/i.test(doc); i++) {
    log(`${model}: the film stops mid-document (${doc.length} chars); asking it to continue…`);
    const res = await generate({
      model,
      system: BUILDER_SYSTEM,
      prompt: 'Your answer was cut off. Continue EXACTLY from the last character of your previous answer: no repetition, no explanation, no new code fence. Finish the whole document, ending with </html>.',
      history: [
        { role: 'user', text: prompt },
        { role: 'model', text: '```html\n' + doc },
      ],
      thinking: 'LOW',
      maxOutputTokens: 65_536,
      temperature: 0.7,
    });
    const more = stripJunk(res.text.replace(/^\s*```html\s*/i, ''));
    step({ step: 'continue', model, ms: res.latencyMs, outTokens: res.outTokens, chars: more.length });
    doc += more;
  }
  return doc;
}

async function build(model: string, sb: Storyboard): Promise<Version | null> {
  const dir = join(outDir, `cand-${model}`);
  const existing = join(dir, 'film.html');
  let html: string | null = null;
  if (resume && existsSync(existing)) html = await complete(model, buildPrompt(sb), readFileSync(existing, 'utf8'));
  else {
    log(`builder ${model}…`);
    try {
      const res = await generate({
        model,
        system: BUILDER_SYSTEM,
        prompt: buildPrompt(sb),
        thinking: 'HIGH',
        maxOutputTokens: 131_072,
        temperature: 1,
      });
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'answer.txt'), res.text);
      html = extractHtml(res.text);
      if (html) html = await complete(model, buildPrompt(sb), html);
      step({ step: 'build', model, ms: res.latencyMs, outTokens: res.outTokens, ok: !!html });
    } catch (e) {
      log(`builder ${model} failed: ${String(e).slice(0, 200)}`);
      step({ step: 'build', model, error: String(e).slice(0, 300) });
      return null;
    }
  }
  if (!html) return null;
  return check(`cand ${model}`, dir, html, sb);
}

async function critique(v: Version, sb: Storyboard): Promise<Critique | null> {
  const labels = v.insp.samples.map(
    (s, i) => `Image ${i + 1}: ${(s.ms / 1000).toFixed(1)} s, beat ${s.beat} (${sb.beats[s.beat]?.picture.slice(0, 140) ?? ''}). Spoken: "${s.words}"`,
  );
  const prompt = [
    `Storyboard (what the film is meant to show):\n${JSON.stringify(sb, null, 1)}`,
    '',
    `Automatic findings:\n${[...v.insp.blocking, ...v.insp.layout].map((x) => '- ' + x).join('\n') || '- none'}`,
    '',
    'The stills, in order:',
    ...labels,
  ].join('\n');
  try {
    const res = await generate({
      model: criticModel,
      system: CRITIC_SYSTEM,
      prompt,
      jsonSchema: CRITIC_SCHEMA,
      thinking: 'MEDIUM',
      maxOutputTokens: 32_768,
      temperature: 0.3,
      media: v.insp.samples.map((s) => ({ mimeType: 'image/jpeg', base64: readFileSync(s.file).toString('base64') })),
    });
    const c = parseJson(res.text) as Critique;
    writeFileSync(join(v.dir, 'critique.json'), JSON.stringify(c, null, 1));
    step({ step: 'critique', of: v.label, ms: res.latencyMs, score: c.score, issues: c.issues.length });
    log(`critic on ${v.label}: ${c.score}/10 — ${c.verdict.slice(0, 160)}`);
    return c;
  } catch (e) {
    log(`critic failed: ${String(e).slice(0, 200)}`);
    return null;
  }
}

/** Applies SEARCH/REPLACE blocks; exact match first, then a whitespace-insensitive line match. */
function applyEdits(html: string, text: string): { html: string; applied: number; failed: number } {
  const re = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n?>>>>>>> REPLACE/g;
  let out = html;
  let applied = 0;
  let failed = 0;
  for (const m of text.matchAll(re)) {
    const search = m[1] ?? '';
    const repl = m[2] ?? '';
    if (search && out.includes(search)) {
      out = out.replace(search, () => repl);
      applied++;
      continue;
    }
    const lines = out.split('\n');
    const want = search.split('\n').map((l) => l.trim()).filter(Boolean);
    let hit = -1;
    let end = -1;
    for (let i = 0; i < lines.length && hit < 0; i++) {
      let j = i;
      let k = 0;
      while (j < lines.length && k < want.length) {
        const t = lines[j]!.trim();
        if (!t) {
          j++;
          continue;
        }
        if (t !== want[k]) break;
        j++;
        k++;
      }
      if (want.length && k === want.length) {
        hit = i;
        end = j;
      }
    }
    if (hit >= 0) {
      lines.splice(hit, end - hit, repl);
      out = lines.join('\n');
      applied++;
    } else failed++;
  }
  return { html: out, applied, failed };
}

async function fix(v: Version, sb: Storyboard, round: number): Promise<Version | null> {
  const issues = [
    ...v.insp.blocking.map((x) => `BLOCKER (contract): ${x}`),
    ...(v.crit?.issues ?? []).map(
      (i) => `${i.severity.toUpperCase()} beat ${i.beat} at ${(i.atMs / 1000).toFixed(1)} s: ${i.problem} → FIX: ${i.fix}`,
    ),
    ...v.insp.layout.map((x) => `LAYOUT: ${x}`),
  ];
  log(`fixer round ${round} on ${v.label}: ${issues.length} issues…`);
  try {
    const res = await generate({
      model: builders[0] ?? 'gemini-4-carbon',
      system: FIXER_SYSTEM,
      prompt: [
        voicePrompt(vo),
        '',
        `Storyboard:\n${JSON.stringify(sb, null, 1)}`,
        '',
        `The director's review (score ${v.crit?.score ?? '?'}/10: ${v.crit?.verdict ?? ''}). Fix all of these:`,
        ...issues.map((x) => '- ' + x),
        '',
        'The current file:',
        '```html',
        v.html,
        '```',
      ].join('\n'),
      thinking: 'HIGH',
      maxOutputTokens: 98_304,
      temperature: 0.7,
    });
    const dir = join(outDir, `round-${round}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'edits.txt'), res.text);
    const edited = applyEdits(v.html, res.text);
    let { html, applied } = edited;
    const { failed } = edited;
    // A whole document instead of edits is fine too.
    if (applied === 0) {
      const whole = extractHtml(res.text);
      if (whole && whole.includes('seek')) {
        html = whole;
        applied = 1;
      }
    }
    step({ step: 'fix', round, ms: res.latencyMs, outTokens: res.outTokens, applied, failed });
    log(`round ${round}: ${applied} edits applied, ${failed} didn't match`);
    if (!applied) return null;
    return check(`round ${round}`, dir, html, sb);
  } catch (e) {
    log(`fixer failed: ${String(e).slice(0, 200)}`);
    return null;
  }
}

const better = (a: Version, b: Version | null) => {
  if (!b) return a;
  // A revision the critic couldn't score is neither better nor worse: keep the scored one.
  if (!b.crit && !b.insp.blocking.length) return a;
  if (a.insp.blocking.length !== b.insp.blocking.length) return a.insp.blocking.length < b.insp.blocking.length ? a : b;
  return (a.crit?.score ?? 0) >= (b.crit?.score ?? 0) ? a : b;
};

function sheet(v: Version, to: string) {
  const list = join(v.dir, 'stills', 's%03d.jpg');
  const cols = 8;
  const rows = Math.ceil(v.insp.samples.length / cols);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', list, '-vf', `scale=270:-1,tile=${cols}x${rows}:padding=4`, '-frames:v', '1', to]);
}

const sb = await direct();
const cands = (await Promise.all(builders.map((m) => build(m, sb)))).filter((x): x is Version => !!x);
// --extra round-1,round-2: earlier revisions in the run folder join as candidates.
for (const name of (opt('extra') ?? '').split(',').filter(Boolean)) {
  const f = join(outDir, name, 'film.html');
  if (existsSync(f)) cands.push(await check(name, join(outDir, name), readFileSync(f, 'utf8'), sb));
}
if (!cands.length) throw new Error('no builder produced a film');
for (const c of cands) c.crit = c.insp.samples.length ? await critique(c, sb) : null;
let best = cands.reduce((a, b) => better(a, b));
log(`best candidate: ${best.label} (${best.crit?.score ?? '?'}/10)`);
for (let r = 1; r <= rounds; r++) {
  const next = await fix(best, sb, r);
  if (next) {
    next.crit = next.insp.blocking.length ? null : await critique(next, sb);
    // The critic's score varies about ±0.5 on the same film, and a revision fixes concrete bugs,
    // so keep it unless it scores clearly worse.
    const winner =
      !next.insp.blocking.length && next.crit && next.crit.score >= (best.crit?.score ?? 0) - 0.3 ? next : better(best, next);
    log(`round ${r}: ${winner === next ? 'kept the revision' : 'revision was worse; kept ' + best.label}`);
    best = winner;
  }
}
save(outDir, best.html);
copyFileSync(join(best.dir, 'film.html'), join(outDir, 'film.html'));
try {
  sheet(best, join(outDir, 'sheet.jpg'));
} catch {
  /* no stills */
}
report['best'] = { label: best.label, score: best.crit?.score, blocking: best.insp.blocking, layout: best.insp.layout.length };
report['wallMs'] = Date.now() - wall;
report['usage'] = { ...usage };
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(report, null, 1));
log(`done: ${join(outDir, 'film.html')} (${best.label}, ${best.crit?.score ?? '?'}/10)`);
console.log(`cost: $${usage.usd.toFixed(4)} over ${usage.calls} calls, wall ${Math.round((Date.now() - wall) / 1000)} s`);
