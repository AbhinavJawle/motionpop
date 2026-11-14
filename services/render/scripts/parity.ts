// Parity (spec 03 R6): the same composition must look the same in the preview runtime (Chrome,
// HyperFrames clock) and in the producer's MP4. Compares 5 frame-aligned timestamps.
// Usage: pnpm --filter @motionpop/render parity [outDir]
//
// Metric: mean absolute difference over RGB, globally (≤ 2 %) and per 64×64 tile (≤ 10 %).
// The tolerance absorbs H.264 compression and the YUV 4:2:0 colour round trip; a missing or
// shifted line of text blows a tile well past 10 %. Change the thresholds deliberately.
import { compileProject } from '@motionpop/motion/compiler';
import { editorialExplainer } from '@motionpop/motion/styles';
import { createRenderJob, executeRenderJob } from '@hyperframes/producer';
import { FORMATS, frameToMs, msToFrame } from '@motionpop/schemas';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import puppeteer from 'puppeteer';

const GLOBAL_MAX = 0.02;
const TILE_MAX = 0.1;
const TILE = 64;
const FPS = 30;

const outDir = process.argv[2] ?? join(tmpdir(), 'motionpop-parity');
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
if (spawnSync(ffmpeg, ['-version']).status !== 0) {
  console.error(
    `parity: ffmpeg not found (set FFMPEG_PATH or install ffmpeg; the producer needs it too)`,
  );
  process.exit(2);
}

const require = createRequire(import.meta.url);
const dist = join(dirname(require.resolve('@motionpop/motion/package.json')), 'dist');
const [runtimeJs, hyperframesRuntimeJs, fontsJson, texturesJson] = await Promise.all(
  ['runtime.js', 'hyperframe.runtime.iife.js', 'fonts.json', 'textures.json'].map((f) =>
    readFile(join(dist, f), 'utf8'),
  ),
);

const format = '16:9' as const;
const { width, height } = FORMATS[format];
const durationMs = 8000;
const html = compileProject(
  {
    format,
    durationMs,
    style: editorialExplainer,
    mode: 'render',
    slots: [
      {
        id: 'a',
        startMs: 0,
        endMs: 3600,
        componentId: 'big-number',
        params: {
          value: 40,
          suffix: '%',
          label: 'Revenue growth since 2020',
          context: 'The bigger picture',
        },
      },
      {
        id: 'b',
        startMs: 4000,
        endMs: 8000,
        componentId: 'big-number',
        keyMomentMs: 1500,
        params: {
          value: 987654321.99,
          prefix: '$',
          suffix: 'bn',
          decimals: 2,
          label: 'Nine digits with decimals',
        },
      },
    ],
  },
  {
    runtimeJs: runtimeJs!,
    hyperframesRuntimeJs: hyperframesRuntimeJs!,
    fonts: JSON.parse(fontsJson!) as Record<string, string>,
    textures: JSON.parse(texturesJson!) as { grain: string; paper: string },
  },
);

// Mid-count, key moment, hold, exit, second slot's key moment: frame-aligned.
const frames = [600, 1200, 2600, 3500, 5500].map((ms) => msToFrame(ms, FPS));

await rm(outDir, { recursive: true, force: true });
const compDir = join(outDir, 'composition');
await mkdir(compDir, { recursive: true });
await writeFile(join(compDir, 'index.html'), html);

// (a) Preview stills: the runtime in Chrome, driven through HyperFrames' clock.
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(
    () => (window as unknown as { __motionpop: { ready: Promise<void> } }).__motionpop.ready,
  );
  for (const f of frames) {
    await page.evaluate(async (sec) => {
      const w = window as unknown as { __player?: { seek: (s: number) => unknown } };
      if (!w.__player) throw new Error('no HyperFrames player API');
      await w.__player.seek(sec);
    }, f / FPS);
    await page.screenshot({ path: join(outDir, `preview-${f}.png`) as `${string}.png` });
  }
} finally {
  await browser.close();
}

// (b) Producer render, then the same frames out of the MP4.
const mp4 = join(outDir, 'parity.mp4');
const t0 = performance.now();
await executeRenderJob(createRenderJob({ fps: FPS, quality: 'high' }), compDir, mp4, () => {});
const renderS = ((performance.now() - t0) / 1000).toFixed(1);
for (const f of frames) {
  const r = spawnSync(ffmpeg, [
    '-loglevel',
    'error',
    '-y',
    '-i',
    mp4,
    '-vf',
    `select=eq(n\\,${f})`,
    '-frames:v',
    '1',
    join(outDir, `render-${f}.png`),
  ]);
  if (r.status !== 0) throw new Error(`ffmpeg frame ${f}: ${r.stderr.toString()}`);
}

// (c) Compare.
const rgb = (png: string): Buffer => {
  const r = spawnSync(
    ffmpeg,
    ['-loglevel', 'error', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: width * height * 4 },
  );
  if (r.status !== 0 || r.stdout.length !== width * height * 3)
    throw new Error(`decode ${png}: ${r.stderr.toString()}`);
  return r.stdout;
};

let failed = false;
for (const f of frames) {
  const a = rgb(join(outDir, `preview-${f}.png`));
  const b = rgb(join(outDir, `render-${f}.png`));
  let total = 0;
  let worst = 0;
  let worstAt = '';
  for (let ty = 0; ty < height; ty += TILE) {
    for (let tx = 0; tx < width; tx += TILE) {
      let sum = 0;
      let n = 0;
      for (let y = ty; y < Math.min(ty + TILE, height); y++) {
        for (let x = tx; x < Math.min(tx + TILE, width); x++) {
          const i = (y * width + x) * 3;
          sum +=
            Math.abs(a[i]! - b[i]!) +
            Math.abs(a[i + 1]! - b[i + 1]!) +
            Math.abs(a[i + 2]! - b[i + 2]!);
          n += 3;
        }
      }
      total += sum;
      const mad = sum / n / 255;
      if (mad > worst) {
        worst = mad;
        worstAt = `${tx},${ty}`;
      }
    }
  }
  const global = total / (width * height * 3) / 255;
  const ok = global <= GLOBAL_MAX && worst <= TILE_MAX;
  failed ||= !ok;
  console.log(
    `${ok ? '✓' : '✗'} frame ${f} (${frameToMs(f, FPS)} ms): global ${(global * 100).toFixed(2)} %, worst tile ${(worst * 100).toFixed(2)} % at ${worstAt}`,
  );
}
console.log(`render ${renderS} s · stills in ${outDir}`);
process.exit(failed ? 1 : 0);
