// Scene sheet: renders one scene at several moments for several looks into a PNG contact sheet,
// for eyeballing motion between real checks. Bundled and run by scripts/run-sheet.ts.
// Usage: node scripts/run-sheet.ts <scene-id> [--times 0.1,0.4,0.7,1] [--content '{"place":"Japan"}']
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { scenes } from '../src/scenes';
import { compileProject, type CompileSlot } from '../src/compiler';
import { editorialExplainer, looks as craftLooks } from '../src/styles';
const looks = { [editorialExplainer.id]: editorialExplainer, ...craftLooks };
import type { Format } from '../src/contract';

const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
const args = process.argv.slice(2);
const id = args[0] ?? 'map-zoom';
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const times = (opt('times') ?? '0.05,0.3,0.45,0.6,0.85').split(',').map(Number);
const format = (opt('format') ?? '16:9') as Format;
const extra = JSON.parse(opt('content') ?? '{}') as Record<string, unknown>;
const variants = (opt('variants') ?? '').split(',').filter(Boolean);
const lookIds = (opt('looks') ?? Object.keys(looks).join(',')).split(',');
const scene = (
  scenes as unknown as Record<
    string,
    { defaultContent: unknown; durationMs: { ideal: number }; variants: readonly { id: string }[] }
  >
)[id];
if (!scene) throw new Error(`no scene ${id}`);

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
// Map imagery over local HTTP with CORS (WebGL needs it; about:blank can't read file URLs).
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
// --image path[,keyed]: a picture for scenes with an image role (data URL, like the preview).
const imageArg = opt('image');
const picture = imageArg
  ? await (async () => {
      const [path, keyed] = imageArg.split(',');
      const buf = await readFile(path!);
      return {
        src: `data:image/webp;base64,${buf.toString('base64')}`,
        width: 1024,
        height: 1024,
        keyed: keyed === 'keyed',
      };
    })()
  : null;
const images: Record<string, unknown> = Object.fromEntries(
  Object.entries(MAP_FILES).map(([style, f]) => [
    mapImageId(style as keyof typeof MAP_FILES),
    { src: `http://127.0.0.1:${port}/${f}`, width: 8192, height: 4096, keyed: false },
  ]),
);
if (picture) images['pic'] = picture;
const role = (scene as unknown as { imageRoles?: { id: string }[] }).imageRoles?.[0]?.id;

const [w, h] = format === '16:9' ? [1920, 1080] : format === '9:16' ? [1080, 1920] : [1080, 1080];
const out = join(pkgDir, '.check', 'sheet');
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const files: string[] = [];
const rows = variants.length ? variants : [scene.variants[0]?.id ?? 'default'];
for (const lookId of lookIds) {
  for (const variant of rows) {
    const dur = scene.durationMs.ideal;
    const slot: CompileSlot = {
      id: 's1',
      componentId: id,
      startMs: 0,
      endMs: dur,
      params: {
        content: { ...(scene.defaultContent as object), ...extra },
        variant,
        beats: [],
        images: picture && role ? [{ role, subject: 'test picture', assetId: 'pic' }] : [],
      },
    } as unknown as CompileSlot;
    const html = compileProject(
      {
        format,
        durationMs: dur,
        style: looks[lookId]!,
        slots: [slot],
        images: images as never,
      },
      assets,
    );
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
    page.on(
      'console',
      (m) => m.type() === 'error' && console.log('console', m.text().slice(0, 200)),
    );
    await page.setContent(html, { waitUntil: 'load' });
    await page
      .waitForFunction('window.__motionpop && window.__motionpop.ready', { timeout: 30000 })
      .catch(() => {});
    await page.evaluate('window.__motionpop.ready');
    for (const t of times) {
      await page.evaluate(`window.__motionpop.seek(${Math.round(t * dur)})`);
      const f = join(out, `${lookId}-${variant}-${t}.png`);
      await page.screenshot({ path: f as `${string}.png` });
      files.push(f);
    }
    await page.close();
  }
}
await browser.close();
server.close();
await writeFile(join(out, 'list.txt'), files.join('\n'));
console.log(`sheet: ${files.length} frames → ${out} (${times.length} per row)`);
