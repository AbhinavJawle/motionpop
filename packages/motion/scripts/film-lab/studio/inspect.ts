// Studio inspector: loads a film page headless and measures it. Contract problems (errors,
// network, missing seek, non-determinism) block; layout findings (text off the safe frame, tiny,
// overlapping; blank frames; frozen stretches) go to the critic and the fixer with the stills.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer, { type Page } from 'puppeteer';

export interface Sample {
  ms: number;
  beat: number;
  file: string;
  words: string;
}
export interface Inspection {
  blocking: string[];
  layout: string[];
  samples: Sample[];
}

interface TextBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  px: number;
}

/** Visible text boxes on the page (HTML and SVG text), with effective font size in px. */
const MEASURE = `(() => {
  const out = [];
  const vis = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      o *= parseFloat(cs.opacity || '1');
    }
    return o;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode;
    const s = (t.textContent || '').trim();
    if (s.length < 2) continue;
    const el = t.parentElement;
    if (!el || seen.has(el) || el.closest('script,style,title,defs')) continue;
    seen.add(el);
    if (vis(el) < 0.35) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right < 0 || r.bottom < 0 || r.left > 1080 || r.top > 1920) continue;
    let px;
    if (el instanceof SVGElement) px = r.height * 0.72;
    else {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
      const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
      px = fs * k;
    }
    out.push({ text: s.slice(0, 40), x: r.left, y: r.top, w: r.width, h: r.height, px });
  }
  return out;
})()`;

function layoutIssues(boxes: TextBox[], ms: number): string[] {
  const t = `${(ms / 1000).toFixed(1)}s`;
  const out: string[] = [];
  for (const b of boxes) {
    if (b.x < 30 || b.y < 60 || b.x + b.w > 1050 || b.y + b.h > 1880)
      out.push(`${t}: text "${b.text}" runs off the safe frame (box ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)})`);
    else if (b.px < 30) out.push(`${t}: text "${b.text}" is ${Math.round(b.px)} px, too small for a phone (min 40)`);
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      // The same text twice is a deliberate shadow / print-offset layer, not a collision.
      if (ox <= 0 || oy <= 0 || a.text === b.text) continue;
      const small = Math.min(a.w * a.h, b.w * b.h);
      // Nested boxes (a span inside its line) aren't collisions.
      const nested = ox * oy >= small * 0.98;
      if (!nested && ox * oy > small * 0.25) out.push(`${t}: texts "${a.text}" and "${b.text}" overlap`);
    }
  return out;
}

async function open(htmlPath: string, scale: number, problems: string[]) {
  const browser = await puppeteer.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'],
    protocolTimeout: 600_000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: scale });
  page.on('pageerror', (e) => problems.push(`page error: ${String(e).slice(0, 300)}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url().slice(0, 120)}`));
  page.on('request', (r) => {
    const u = r.url();
    if (/^https?:/.test(u) && !/fonts\.(googleapis|gstatic)\.com/.test(u))
      problems.push(`network request not allowed: ${u.slice(0, 120)}`);
  });
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0', timeout: 90_000 });
  return { browser, page };
}

/** PSNR in dB between two PNGs (ffmpeg). Sub-pixel rendering noise is ~100 dB; a real change is < 40. */
function psnr(a: Buffer, b: Buffer): number {
  const dir = mkdtempSync(join(tmpdir(), 'mp-psnr-'));
  try {
    writeFileSync(join(dir, 'a.png'), a);
    writeFileSync(join(dir, 'b.png'), b);
    const r = spawnSync('ffmpeg', ['-i', join(dir, 'a.png'), '-i', join(dir, 'b.png'), '-lavfi', 'psnr', '-f', 'null', '-'], {
      encoding: 'utf8',
    });
    const m = /average:(inf|[\d.]+)/.exec(r.stderr ?? '');
    return !m ? 0 : m[1] === 'inf' ? Infinity : Number(m[1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const seekTo = (page: Page, ms: number) => page.evaluate(`Promise.resolve(window.seek(${ms}))`);

/**
 * Chrome downloads a web font's glyph subsets only when they first appear, so the first frame of a
 * beat can render in a fallback font. Seek through the whole film once and wait for every font.
 */
export async function warmFonts(page: Page, durationMs: number): Promise<void> {
  for (let ms = 0; ms <= durationMs; ms += 250) await seekTo(page, ms);
  await page.evaluate('document.fonts.ready.then(() => null)');
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 30_000 }).catch(() => {});
}

export async function inspect(
  htmlPath: string,
  durationMs: number,
  times: { ms: number; beat: number; words: string }[],
  stillsDir: string,
): Promise<Inspection> {
  const blocking: string[] = [];
  const layout: string[] = [];
  const samples: Sample[] = [];
  const { browser, page } = await open(htmlPath, 0.5, blocking);
  try {
    if (!(await page.evaluate('typeof window.seek === "function"'))) {
      blocking.push('window.seek is not defined as a function');
      return { blocking, layout, samples };
    }
    await page.evaluate('window.ready ? Promise.resolve(window.ready) : null');
    await warmFonts(page, durationMs);
    mkdirSync(stillsDir, { recursive: true });
    for (const [i, t] of times.entries()) {
      try {
        await seekTo(page, t.ms);
        const file = join(stillsDir, `s${String(i).padStart(3, '0')}.jpg`);
        const buf = await page.screenshot({ path: file as `${string}.jpg`, quality: 80 });
        samples.push({ ...t, file });
        // A near-uniform frame compresses to almost nothing.
        if (buf.length < 9_000) layout.push(`${(t.ms / 1000).toFixed(1)}s: the frame is (nearly) empty`);
        layout.push(...layoutIssues((await page.evaluate(MEASURE)) as TextBox[], t.ms));
      } catch (e) {
        blocking.push(`seek(${t.ms}) threw: ${String(e).slice(0, 200)}`);
      }
    }
    // Determinism: the same ms after other seeks gives the same pixels.
    for (const ms of [Math.round(durationMs * 0.23), Math.round(durationMs * 0.61)]) {
      await seekTo(page, ms);
      const a = Buffer.from(await page.screenshot({ type: 'png' }));
      await seekTo(page, Math.round(durationMs * 0.9));
      await seekTo(page, 0);
      await seekTo(page, ms);
      const b = Buffer.from(await page.screenshot({ type: 'png' }));
      const db = a.equals(b) ? Infinity : psnr(a, b);
      if (db < 50) blocking.push(`seek(${ms}) is not deterministic: the frame differs after seeking elsewhere and back (PSNR ${db.toFixed(1)} dB)`);
    }
    // Frozen stretches: identical frames 0.5 s apart for 3 s or more.
    let frozenFrom = -1;
    let prev: Buffer | null = null;
    for (let ms = 0; ms <= durationMs; ms += 500) {
      await seekTo(page, ms);
      const shot = Buffer.from(await page.screenshot({ type: 'png' }));
      if (prev && shot.equals(prev)) {
        if (frozenFrom < 0) frozenFrom = ms - 500;
      } else {
        if (frozenFrom >= 0 && ms - 500 - frozenFrom >= 3000)
          layout.push(`${(frozenFrom / 1000).toFixed(1)}–${((ms - 500) / 1000).toFixed(1)}s: nothing moves (idle frame)`);
        frozenFrom = -1;
      }
      prev = shot;
    }
  } finally {
    await browser.close();
  }
  // A failed Google Fonts request is a network hiccup, not a broken film: warn, don't block.
  const flaky = (x: string) => /request failed: https:\/\/fonts\.(googleapis|gstatic)\.com/.test(x);
  layout.unshift(...blocking.filter(flaky).map((x) => `${x} (fonts may fall back)`));
  const hard = blocking.filter((x) => !flaky(x));
  return { blocking: [...new Set(hard)].slice(0, 12), layout: [...new Set(layout)].slice(0, 40), samples };
}
