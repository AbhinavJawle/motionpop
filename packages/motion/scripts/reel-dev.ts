// Reel engine (spec 25) dev tool. Compiles a reel next to its video and either renders it to MP4
// with @hyperframes/producer or takes quick stills (a contact sheet) in headless Chrome.
//
//   npx tsx scripts/reel-dev.ts render <video> <words.json> <plan.json> <out.mp4> [--quality draft|standard|high]
//   npx tsx scripts/reel-dev.ts sheet  <video> <words.json> <plan.json> <out.jpg> [--every 1000] [--from ms] [--to ms]
//   both take [--images images.json] ({ assetId: { file, w, h } }, from reel-media-lab.ts)
//   and [--sfx bed.wav | --sound [--music id]] and [--cuts project.json] (the app's jump cuts)
//
// words.json: [{ text, startMs, endMs }]. plan.json: a ReelPlan.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ReelPlanSchema,
  ReelWordSchema,
  keptSourceSegments,
  tileReelScenes,
} from '@motionpop/schemas';
import { z } from 'zod';
import { compileReel } from '../src/reel/compile.ts';
import { reelBed, reelSfx } from '../src/reel/sound.ts';
import { decodeWavStereo16, encodeWavStereo16, mixReelMusic } from '../src/reel/music.ts';
import { SFX_SAMPLE_RATE, encodeWav16, voiceLevelDb } from '../src/sfx/index.ts';

const [cmd, videoArg, wordsArg, planArg, outArg, ...rest] = process.argv.slice(2);
if (!cmd || !videoArg || !wordsArg || !planArg || !outArg) {
  console.error('usage: reel.ts render|sheet <video> <words.json> <plan.json> <out> [flags]');
  process.exit(2);
}
const flag = (name: string, dflt: string): string => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? (rest[i + 1] ?? dflt) : dflt;
};

const dist = resolve(import.meta.dirname, '../dist');
// Always bundle the latest runtime so stills never show a stale build.
execFileSync('node', [resolve(import.meta.dirname, 'build-runtime.ts')], { stdio: 'ignore' });
const assets = {
  reelRuntimeJs: readFileSync(join(dist, 'reel-runtime.js'), 'utf8'),
  hyperframesRuntimeJs: readFileSync(join(dist, 'hyperframe.runtime.iife.js'), 'utf8'),
  fonts: JSON.parse(readFileSync(join(dist, 'reel-fonts.json'), 'utf8')) as Record<string, string>,
};

const probe = JSON.parse(
  execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height:stream_side_data=rotation:format=duration',
      '-of',
      'json',
      videoArg,
    ],
    { encoding: 'utf8' },
  ),
) as { streams: { width: number; height: number }[]; format: { duration: string } };
const vw = probe.streams[0]!.width;
const vh = probe.streams[0]!.height;
const sourceMs = Math.floor(Number(probe.format.duration) * 1000);
// --cuts project.json: the jump cuts the app made (its `video.cuts`), so the reel plays the kept
// segments exactly like the export (pass the project's re-timed words as <words.json>).
const cutsArg = flag('cuts', '');
const segments = cutsArg
  ? keptSourceSegments(
      sourceMs,
      (
        JSON.parse(readFileSync(cutsArg, 'utf8')) as {
          video: { cuts: { startMs: number; endMs: number; enabled: boolean }[] };
        }
      ).video.cuts,
    ).map((k) => ({ srcStartMs: k.startMs, srcEndMs: k.endMs }))
  : undefined;
const durationMs = segments
  ? segments.reduce((a, k) => a + (k.srcEndMs - k.srcStartMs), 0)
  : sourceMs;

const words = z.array(ReelWordSchema).parse(JSON.parse(readFileSync(wordsArg, 'utf8')));
const rawPlan = ReelPlanSchema.parse(JSON.parse(readFileSync(planArg, 'utf8')));
const plan = { ...rawPlan, scenes: tileReelScenes(rawPlan.scenes, durationMs) };

const dir = mkdtempSync(join(tmpdir(), 'mp-reel-'));
copyFileSync(videoArg, join(dir, 'speaker.mp4'));
const imagesArg = flag('images', '');
const images: Record<string, { src: string; w: number; h: number }> = {};
if (imagesArg) {
  mkdirSync(join(dir, 'assets'), { recursive: true });
  const map = JSON.parse(readFileSync(imagesArg, 'utf8')) as Record<
    string,
    { file: string; w: number; h: number }
  >;
  for (const [id, m] of Object.entries(map)) {
    const rel = `assets/${id}.png`;
    copyFileSync(m.file, join(dir, rel));
    images[id] = { src: rel, w: m.w, h: m.h };
  }
}
// --musicwav file.wav: a generated soundtrack (packages/ai reel-music-lab.ts), levelled and
// ducked under the video's voice like the export does it.
const musicWav = flag('musicwav', '');
let musicSrc = '';
if (musicWav) {
  const pcm = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', videoArg, '-ac', '1', '-ar', String(SFX_SAMPLE_RATE), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 30 },
  );
  const voice = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  const music = decodeWavStereo16(readFileSync(musicWav));
  if (!music) throw new Error('--musicwav is not a 16-bit WAV');
  const mixed = mixReelMusic(music, {
    voiceLevelDb: voiceLevelDb(voice, SFX_SAMPLE_RATE, words),
    words,
  });
  writeFileSync(join(dir, 'music.wav'), encodeWavStereo16(mixed));
  musicSrc = 'music.wav';
}
let sfxArg = flag('sfx', '');
if (sfxArg) copyFileSync(sfxArg, join(dir, 'bed.wav'));
else if (rest.includes('--sound')) {
  // The reel's own sound design (spec 26 R4), measured against the video's voice.
  const pcm = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', videoArg, '-ac', '1', '-ar', String(SFX_SAMPLE_RATE), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 30 },
  );
  const voice = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  const music = flag('music', '');
  const bed = reelBed(plan, durationMs, {
    voiceLevelDb: voiceLevelDb(voice, SFX_SAMPLE_RATE, words),
    words,
    music: music ? (music as 'calm-pad' | 'steady-pulse') : null,
  });
  writeFileSync(join(dir, 'bed.wav'), encodeWav16(bed, SFX_SAMPLE_RATE));
  sfxArg = 'bed.wav';
  console.log(`sound: ${reelSfx(plan, durationMs).length} effects${music ? ` + ${music}` : ''}`);
}
const html = compileReel(
  {
    plan,
    words,
    durationMs,
    videoSrc: 'speaker.mp4',
    video: { w: vw, h: vh },
    ...(segments ? { segments } : {}),
    out: cmd === 'sheet' ? { w: 720, h: 1280 } : { w: 1080, h: 1920 },
    ...(imagesArg ? { images } : {}),
    ...(sfxArg ? { sfxSrc: 'bed.wav' } : {}),
    ...(musicSrc ? { musicSrc } : {}),
  },
  assets,
);
writeFileSync(join(dir, 'index.html'), html);
console.log(`composition: ${dir} (${plan.scenes.length} scenes, ${durationMs} ms)`);

if (cmd === 'render') {
  // The producer lives in the render service; its render-dir script does the work.
  const quality = flag('quality', 'standard');
  execFileSync('npx', ['tsx', 'scripts/render-dir.ts', dir, resolve(outArg), quality], {
    cwd: resolve(import.meta.dirname, '../../../services/render'),
    stdio: 'inherit',
  });
} else if (cmd === 'sheet') {
  const puppeteer = await import('puppeteer');
  const every = Number(flag('every', '1500'));
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1280 });
  page.on('pageerror', (e) => console.error('pageerror', e));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('console', m.text());
  });
  await page.goto(`file://${join(dir, 'index.html')}`, { waitUntil: 'load' });
  await page.evaluate('window.__reel && window.__reel.ready');
  const shots = join(dir, 'shots');
  mkdirSync(shots);
  const times: number[] = [];
  const from = Number(flag('from', '400'));
  const to = Math.min(durationMs, Number(flag('to', String(durationMs))));
  for (let t = from; t < to; t += every) times.push(t);
  for (const [i, t] of times.entries()) {
    // A string, not a function: tsx would inject helpers the page doesn't have.
    await page.evaluate(`(async () => {
      const ms = ${t};
      const v = document.querySelector('video');
      if (v) {
        v.style.visibility = 'visible';
        v.removeAttribute('data-hf-clip-hidden');
        await new Promise((res) => {
          v.addEventListener('seeked', () => res(), { once: true });
          v.currentTime = ms / 1000;
          setTimeout(res, 1500);
        });
      }
      window.__reel && window.__reel.seek(ms);
    })()`);
    await page.screenshot({
      path: join(shots, `${String(i).padStart(3, '0')}.jpg`),
      type: 'jpeg',
      quality: 82,
    });
  }
  await browser.close();
  const cols = Number(flag('cols', '8'));
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-framerate',
    '1',
    '-i',
    join(shots, '%03d.jpg'),
    '-vf',
    `scale=270:-1,tile=${cols}x${Math.ceil(times.length / cols)}:padding=4:color=white`,
    '-frames:v',
    '1',
    resolve(outArg),
  ]);
  console.log(`sheet ${outArg} (${times.length} stills, every ${every} ms) — stills in ${shots}`);
}
