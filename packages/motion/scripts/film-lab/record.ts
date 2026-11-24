// Film lab: records a compiled composition (index.html from shoot.ts or composition.html from the
// reel) frame by frame at 30 fps, full resolution, and muxes the voice. One recorder for every
// video in a comparison, so they differ only in what the composition draws.
// Usage: node scripts/run-film-lab.ts record <composition.html> <voice> <out.mp4> --format 9:16 --ms <durationMs>
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const args = process.argv.slice(2);
const [htmlPath, voice, out] = args;
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!htmlPath || !voice || !out) throw new Error('usage: record <html> <voice> <out.mp4> --format 9:16 --ms N');
const format = opt('format') ?? '9:16';
const durationMs = Number(opt('ms'));
if (!durationMs) throw new Error('--ms required');
const [w, h] = format === '16:9' ? [1920, 1080] : format === '9:16' ? [1080, 1920] : [1080, 1080];
const scale = Number(opt('scale') ?? 1);
const started = Date.now();
const launch = () =>
  puppeteer.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    protocolTimeout: 900_000, // map frames can take minutes under SwiftShader
  });
let browser = await launch();
const frames = mkdtempSync(join(tmpdir(), 'mp-rec-'));
const html = readFileSync(htmlPath, 'utf8');
// --raw: a page from film-lab/raw.ts, whose only contract is window.seek(ms) (+ optional window.ready).
const raw = args.includes('--raw');
async function openPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: scale });
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
  if (raw) {
    await page.goto('file://' + resolve(htmlPath ?? ''), { waitUntil: 'networkidle0', timeout: 60_000 });
    await page.waitForFunction('typeof window.seek === "function"', { timeout: 30_000 });
    await page.evaluate('window.ready ? Promise.resolve(window.ready) : null');
    // Warm every web font (glyph subsets load on first use) so no frame renders a fallback font.
    for (let ms = 0; ms <= durationMs; ms += 250) await page.evaluate(`Promise.resolve(window.seek(${ms}))`);
    await page.evaluate('document.fonts.ready.then(() => null)');
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 30_000 }).catch(() => {});
    return page;
  }
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__motionpop', { timeout: 30_000 });
  await page.evaluate('window.__motionpop.ready');
  return page;
}
try {
  let page = await openPage();
  const total = Math.floor((durationMs * 30) / 1000);
  let restarts = 0;
  for (let f = 0; f < total; f++) {
    try {
      await page.evaluate(
        async (sec: number, tMs: number, isRaw: boolean) => {
          const win = window as unknown as {
            seek?: (ms: number) => unknown;
            __player?: { seek?: (s: number) => unknown };
            __motionpop: { seek: (ms: number) => void };
          };
          if (isRaw && win.seek) await win.seek(tMs);
          else if (win.__player?.seek) await win.__player.seek(sec);
          else win.__motionpop.seek(tMs);
        },
        f / 30,
        Math.round((f * 1000) / 30),
        raw,
      );
      await page.screenshot({ path: join(frames, `f${String(f).padStart(5, '0')}.jpg`) as `${string}.jpg`, quality: 88 });
    } catch (e) {
      // A crashed page or browser (memory on heavy map frames): reopen and redo this frame.
      if (++restarts > 8) throw e;
      console.log(`frame ${f}: ${String(e).slice(0, 120)}; reopening (${restarts})`);
      await browser.close().catch(() => {});
      browser = await launch();
      page = await openPage();
      f--;
    }
  }
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-framerate', '30', '-i', join(frames, 'f%05d.jpg'), '-i', voice,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'aac', '-b:a', '128k', '-shortest', out,
  ]);
  console.log(`${out}: ${total} frames in ${Math.round((Date.now() - started) / 1000)} s`);
} finally {
  await browser.close();
  rmSync(frames, { recursive: true, force: true });
}
