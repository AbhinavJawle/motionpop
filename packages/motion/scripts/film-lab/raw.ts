// Film lab, RAW one-shot (docs/research/film-mode-test.md): the founder's ask: "no context of
// ours, just the script and instructions to make it amazing". No film kit, no looks, no craft
// rules, no compiler. The model writes ONE self-contained HTML page; the only contract is
// window.seek(ms), so the recorder can capture it frame by frame. One repair if the page throws.
// Usage: node scripts/run-film-lab.ts raw --vo coffee --model gemini-4-hydrogen [--thinking HIGH] [--max-out 131072]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { loadVoiceover } from './data';
import { generate, setLedger, usage } from './gemini';

const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const voId = opt('vo') ?? 'coffee';
const model = opt('model') ?? 'gemini-4-hydrogen';
const thinking = (opt('thinking') ?? 'HIGH') as 'LOW' | 'MEDIUM' | 'HIGH';
const maxOut = Number(opt('max-out') ?? 131_072);

const SYSTEM = `You are a world-class motion designer and creative coder. Studios hire you for explainer films that people share because they look incredible: a strong visual concept, confident art direction, illustration with character, and motion that feels choreographed to the voice.

Make a complete vertical motion-graphics film (1080 × 1920, 9:16) that plays over the voiceover below, from its first word to its last. It will be watched on a phone.

How to make it amazing:
- Find the film's concept before anything else: one visual world and one idea that ties the whole thing together. Every line of narration should be SHOWN, not captioned: a picture, a metaphor, a transformation. Text on screen is a supporting actor.
- Choose your own art direction (palette, typography, illustration style, texture) and commit to it. Avoid the generic corporate look, centred text cards, slide decks and stock-infographic clichés.
- Draw everything yourself: inline SVG, canvas or CSS. Illustrate the real subjects of the narration.
- Use the whole vertical frame. Big, legible type on a phone. Keep important things away from the edges.
- Choreograph to the voice: things arrive exactly on the words that name them. Vary the motion; give the camera intent; make transitions carry the eye from one idea to the next. Leave breathing room before the big moments.
- Respect the facts: show the numbers and names the narration says; don't invent statistics.

Before the code, think through a storyboard: beats, the visual for each, and how each hands off to the next. Put that storyboard in an HTML comment at the top of the file.

Technical contract (required so the film can be rendered frame by frame):
- Answer with ONE complete HTML document in a single \`\`\`html code block, and nothing else.
- Self-contained: inline all CSS and JS. You may load fonts from Google Fonts (fonts.googleapis.com / fonts.gstatic.com) and nothing else from the network. No images from the web.
- The page is exactly 1080 × 1920 CSS px (no scrolling, overflow hidden).
- Define window.seek = function (ms) { ... } that puts the page into the exact state of the film at time ms (0 ≤ ms ≤ duration). It may be called for any ms in any order, many times; the same ms must always produce the same frame. It may return a Promise.
- Nothing may move on its own: no CSS animations or transitions, no requestAnimationFrame loops, no timers, no Date or performance clocks, no Math.random (use a seeded generator if you want randomness). All motion is computed from ms inside seek.
- If you need to wait for fonts, set window.ready to a Promise that resolves when the page can render.
- No audio: the voiceover is added afterwards.`;

function prompt(vo: ReturnType<typeof loadVoiceover>): string {
  return [
    `Voiceover script:\n"${vo.words.map((w) => w.text).join(' ')}"`,
    '',
    `Duration: ${vo.durationMs} ms.`,
    'Word timings (word@startMs-endMs), measured from the audio:',
    vo.words.map((w) => `${w.text}@${w.startMs}-${w.endMs}`).join(' '),
  ].join('\n');
}

function extractHtml(text: string): string | null {
  const m = text.match(/```html\s*([\s\S]*?)```/i) ?? text.match(/```\s*(<!doctype[\s\S]*?)```/i);
  if (m?.[1]) return m[1].trim();
  const i = text.search(/<!doctype html|<html/i);
  return i >= 0 ? text.slice(i).trim() : null;
}

/** Loads the page headless, seeks 12 points, and returns problems (errors, missing seek, network). */
async function check(htmlPath: string, durationMs: number, stillsDir: string): Promise<string[]> {
  const problems: string[] = [];
  const browser = await puppeteer.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300_000,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 0.5 });
    page.on('pageerror', (e) => problems.push(`page error: ${String(e).slice(0, 300)}`));
    page.on('requestfailed', (r) => problems.push(`request failed: ${r.url().slice(0, 120)}`));
    page.on('request', (r) => {
      const u = r.url();
      if (/^https?:/.test(u) && !/fonts\.(googleapis|gstatic)\.com/.test(u))
        problems.push(`network request not allowed: ${u.slice(0, 120)}`);
    });
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0', timeout: 60_000 });
    const hasSeek = await page.evaluate('typeof window.seek === "function"');
    if (!hasSeek) return [...problems, 'window.seek is not defined as a function'];
    await page.evaluate('window.ready ? Promise.resolve(window.ready) : null');
    mkdirSync(stillsDir, { recursive: true });
    for (let i = 0; i < 16; i++) {
      const ms = Math.round(((i + 0.5) / 16) * durationMs);
      try {
        await page.evaluate(`Promise.resolve(window.seek(${ms}))`);
        await page.screenshot({
          path: join(stillsDir, `f${String(i).padStart(3, '0')}.jpg`) as `${string}.jpg`,
          quality: 82,
        });
      } catch (e) {
        problems.push(`seek(${ms}) threw: ${String(e).slice(0, 200)}`);
      }
    }
  } finally {
    await browser.close();
  }
  return [...new Set(problems)].slice(0, 12);
}

const vo = loadVoiceover(voId);
const name = `raw-${voId}-${model}`;
const outDir = join(pkgDir, '.check', 'film-lab', name);
mkdirSync(outDir, { recursive: true });
setLedger(join(pkgDir, '.check', 'film-lab', 'ledger.jsonl'));
writeFileSync(join(outDir, 'system.txt'), SYSTEM);
const wall = Date.now();
const history: { role: 'user' | 'model'; text: string }[] = [];
let ask = prompt(vo);
const attempts: { problems: string[]; latencyMs: number; outTokens: number }[] = [];
let ok = false;
for (let attempt = 0; attempt < 2; attempt++) {
  let problems: string[] = [];
  let text = '';
  let latencyMs = 0;
  let outTokens = 0;
  try {
    const res = await generate({
      model,
      system: SYSTEM,
      prompt: ask,
      thinking,
      maxOutputTokens: maxOut,
      temperature: 1,
      history,
    });
    text = res.text;
    latencyMs = res.latencyMs;
    outTokens = res.outTokens;
    writeFileSync(join(outDir, `answer-${attempt}.txt`), text);
    const html = extractHtml(text);
    if (!html) problems = ['no ```html code block in the answer'];
    else {
      const file = join(outDir, 'film.html');
      writeFileSync(file, html);
      problems = await check(file, vo.durationMs, join(outDir, 'stills'));
    }
  } catch (e) {
    problems = [String(e instanceof Error ? e.message : e).slice(0, 400)];
  }
  attempts.push({ problems, latencyMs, outTokens });
  console.log(
    `attempt ${attempt + 1}: ${problems.length ? problems.slice(0, 4).join(' | ') : 'clean'} (${Math.round(latencyMs / 1000)} s, out ${outTokens} tok)`,
  );
  if (problems.length === 0) {
    ok = true;
    break;
  }
  if (!text || attempt === 1) break;
  history.push({ role: 'user', text: ask }, { role: 'model', text });
  ask = `The page has these problems. Answer with the whole corrected HTML document in one \`\`\`html block:\n- ${problems.join('\n- ')}`;
}
writeFileSync(
  join(outDir, 'summary.json'),
  JSON.stringify({ model, thinking, ok, wallMs: Date.now() - wall, attempts, usage: { ...usage } }, null, 1),
);
console.log(`${name}: ${ok ? 'film → ' + join(outDir, 'film.html') : 'NOT CLEAN (see summary.json)'}`);
console.log(`cost: $${usage.usd.toFixed(4)} over ${usage.calls} calls, wall ${Math.round((Date.now() - wall) / 1000)} s`);
