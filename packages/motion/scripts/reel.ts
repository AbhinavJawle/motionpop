// Reel: a whole voiceover through the free path (tagger → local detection → post-pass → drafts
// from the spoken words → the scene engine), compiled like the editor compiles it and shot every
// `--every` ms into one contact sheet. For judging a video by eye, not single slots (spec 07c).
// Bundled and run by scripts/run-reel.ts. Never calls a model or the network.
// Usage: node scripts/run-reel.ts <words.json> [--look id] [--format 16:9] [--every 600]
//        [--from 0] [--to ms] [--out name] [--images dir] [--cols 6]
// words.json: { "words": [{ "text", "startMs", "endMs" }], "durationMs"? }
// --images dir: pictures named <slot-index>.webp|jpg|png are attached to image-capable slots, the
// way first-load pictures attach them in the app.
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import puppeteer from 'puppeteer';
import { Window } from 'happy-dom';
import { scenes, safeScoreFromWords, type Scene } from '../src/scenes';
import { compileProject, sceneTiming, type CompileSlot } from '../src/compiler';
import { editorialExplainer, looks as craftLooks } from '../src/styles';
import type { Format, ImageRef } from '../src/contract';
import { mapStyleFor } from '../src/scenes/map-zoom';
// Dev-only: the app's own free detection, so the reel matches what a first load shows.
import { detectLocal, postPass, tagSpans } from '../../ai/src/slots';

const looks = { [editorialExplainer.id]: editorialExplainer, ...craftLooks };
const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args[0];
if (!file || file.startsWith('--')) throw new Error('usage: run-reel.ts <words.json> [options]');
const lookId = opt('look') ?? editorialExplainer.id;
const style = looks[lookId];
if (!style) throw new Error(`no look ${lookId}`);
const format = (opt('format') ?? '16:9') as Format;
const every = Number(opt('every') ?? 600);
const cols = Number(opt('cols') ?? 6);
const noPlan = args.includes('--no-plan');

const raw = JSON.parse(await readFile(file, 'utf8')) as {
  words: { text: string; startMs: number; endMs: number }[];
  durationMs?: number;
};
const words = raw.words.map((w) => ({ ...w, filler: false }));
const durationMs = raw.durationMs ?? (words[words.length - 1]?.endMs ?? 0) + 600;
const spans = tagSpans(words);
const placed = postPass({ words, suggestions: detectLocal(words, spans) });

// The gates build slots off-screen; happy-dom stands in for the page (as in the unit tests).
const gateDoc = new Window().document as unknown as Document;
const sceneMap = scenes as unknown as Record<string, Scene<unknown>>;
const slots: CompileSlot[] = [];
for (const [i, s] of placed.entries()) {
  const scene = sceneMap[s.componentId];
  if (!scene) continue;
  const { text, ...timing } = sceneTiming(s, { words });
  const opts = {
    slot: s.id,
    format,
    style,
    look: style,
    durationMs: s.endMs - s.startMs,
    doc: gateDoc,
    ...timing,
  };
  const drafted = scene.params.safeParse(s.params);
  const params = drafted.success
    ? drafted.data
    : safeScoreFromWords(scene, text, opts as never, []);
  if (!params) continue;
  slots.push({
    id: s.id || `s${i}`,
    componentId: s.componentId,
    startMs: s.startMs,
    endMs: s.endMs,
    params,
    ...timing,
  });
}

// Pictures for image-capable slots, by slot index (what first-load pictures would attach).
const images: Record<string, ImageRef> = {};
const imageDir = opt('images');
if (imageDir) {
  const files = (await readdir(imageDir)).filter((f) => /\.(webp|jpe?g|png)$/i.test(f));
  for (const f of files) {
    const k = Number(basename(f, extname(f)));
    const slot = slots[k];
    const role = slot ? sceneMap[slot.componentId]?.imageRoles[0]?.id : undefined;
    if (!slot || !role) continue;
    const buf = await readFile(join(imageDir, f));
    const type = /png$/i.test(f) ? 'png' : /webp$/i.test(f) ? 'webp' : 'jpeg';
    const id = `pic-${k}`;
    images[id] = {
      src: `data:image/${type};base64,${buf.toString('base64')}`,
      width: 1024,
      height: 768,
      keyed: false,
    };
    const p = slot.params as { images?: unknown[] };
    slot.params = { ...p, images: [{ role, subject: f, assetId: id }] };
  }
}

// The whole-video plan (spec 07c) runs inside the runtime, as in the app; --no-plan turns it off.
const planned = slots;

const dist = join(pkgDir, 'dist');
const assets = {
  runtimeJs: await readFile(join(dist, 'runtime.js'), 'utf8'),
  hyperframesRuntimeJs: await readFile(join(dist, 'hyperframe.runtime.iife.js'), 'utf8'),
  fonts: JSON.parse(await readFile(join(dist, 'fonts.json'), 'utf8')) as Record<string, string>,
  textures: JSON.parse(await readFile(join(dist, 'textures.json'), 'utf8')) as {
    grain: string;
    paper: string;
  },
};
const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(dist, 'maps', (req.url ?? '').replace(/^\/+/, '')));
    res.writeHead(200, { 'Content-Type': 'image/webp', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const { MAP_FILES, mapImageId } = await import('../src/scenes/map-zoom/globe');
// Only the look's map style, as the app sends it (decoding all four 8K images stalls SwiftShader).
// --no-globe draws maps as vectors, which is quicker to shoot.
if (!args.includes('--no-globe') && planned.some((s) => s.componentId === 'map-zoom')) {
  const k = mapStyleFor(undefined, style as Parameters<typeof mapStyleFor>[1]);
  images[mapImageId(k)] = {
    src: `http://127.0.0.1:${port}/${MAP_FILES[k]}`,
    width: k === 'night' ? 4096 : 8192,
    height: k === 'night' ? 2048 : 4096,
    keyed: false,
  };
}

const html = compileProject(
  { format, durationMs, style, slots: planned, images, ...(noPlan ? { staging: false } : {}) },
  assets,
);
const [w, h] = format === '16:9' ? [1920, 1080] : format === '9:16' ? [1080, 1920] : [1080, 1080];
const outName =
  opt('out') ?? `${basename(file, extname(file))}-${lookId}-${format.replace(':', 'x')}`;
const out = join(pkgDir, '.check', 'reel', outName);
await mkdir(out, { recursive: true });
await writeFile(join(out, 'composition.html'), html);
await writeFile(
  join(out, 'slots.json'),
  JSON.stringify(
    planned.map((s) => ({
      id: s.id,
      scene: s.componentId,
      startMs: s.startMs,
      endMs: s.endMs,
      params: s.params,
    })),
    null,
    1,
  ),
);
const browser = await puppeteer.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: w, height: h });
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text().slice(0, 300)));
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate('window.__motionpop.ready');
const errs = (await page.evaluate('window.__motionpop.errors')) as unknown[];
if (errs.length) console.log('errors', JSON.stringify(errs).slice(0, 800));
const from = Number(opt('from') ?? 0);
const to = Math.min(durationMs, Number(opt('to') ?? durationMs));
const shots: { t: number; data: string }[] = [];
for (let t = from; t <= to; t += every) {
  // HyperFrames shows and hides the clips; its player seek drives our runtime through hf-seek.
  await page.evaluate(
    `(async () => { const p = window.__player; if (p && p.seek) await p.seek(${t / 1000}); else window.__motionpop.seek(${t}); })()`,
  );
  const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
  shots.push({ t, data: Buffer.from(buf).toString('base64') });
}
// One contact sheet: every frame with its time and the slot that is on.
const active = (t: number) =>
  planned.find((s) => t >= s.startMs && t <= s.endMs)?.componentId ?? '·';
const tw = format === '9:16' ? 216 : 384;
const th = Math.round((tw * h) / w);
const sheet = `<!doctype html><html><body style="margin:0;background:#111;font:12px/1.2 monospace;color:#ddd">
<div style="display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:6px;padding:6px">
${shots
  .map(
    (s) =>
      `<div><img src="data:image/jpeg;base64,${s.data}" style="width:${tw}px;height:${th}px;display:block"/><div>${(s.t / 1000).toFixed(1)}s ${active(s.t)}</div></div>`,
  )
  .join('')}
</div></body></html>`;
const sp = await browser.newPage();
await sp.setViewport({ width: cols * (tw + 6) + 6, height: 400 });
await sp.setContent(sheet, { waitUntil: 'load' });
const sheetPath = join(out, 'sheet.jpg');
await sp.screenshot({
  path: sheetPath as `${string}.jpg`,
  fullPage: true,
  type: 'jpeg',
  quality: 82,
});
for (const s of shots.filter((_, i) => i % 1 === 0)) {
  await writeFile(
    join(out, `f-${String(s.t).padStart(6, '0')}.jpg`),
    Buffer.from(s.data, 'base64'),
  );
}
await browser.close();
server.close();
console.log(
  `reel: ${planned.length} slots (${planned.map((s) => s.componentId).join(', ')}), ${shots.length} frames → ${sheetPath}`,
);
