// Spike (spec 08 task 1): what does @hyperframes/producer do with our compositions at the sizes
// and settings the export modal offers? Local only, no cloud, no cost.
// Usage: pnpm --filter @motionpop/render spike [outDir]
//
// Part A: 1080p native and 720p (`outputResolution`) in 16:9, 9:16 and 1:1 on a short project.
//         Checks the encoded size, frame count and duration with ffprobe.
// Part B: an 18 s 16:9 project with quality high/standard and workers 2/auto: wall time and
//         the peak resident memory of the whole process tree (node + Chrome + ffmpeg).
// Results are printed as a table; copy the numbers into the task note in tasks.md.
import { compileProject } from '@motionpop/motion/compiler';
import { looks } from '@motionpop/motion/styles';
import { createRenderJob, executeRenderJob } from '@hyperframes/producer';
import { FORMATS, msToFrame, type Format } from '@motionpop/schemas';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const FPS = 30;
const outDir = process.argv[2] ?? join(tmpdir(), 'motionpop-spike');
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe';
if (spawnSync(ffmpeg, ['-version']).status !== 0) {
  console.error('spike: ffmpeg not found (set FFMPEG_PATH)');
  process.exit(2);
}

const require = createRequire(import.meta.url);
const dist = join(dirname(require.resolve('@motionpop/motion/package.json')), 'dist');
const [runtimeJs, hyperframesRuntimeJs, fontsJson, texturesJson] = await Promise.all(
  ['runtime.js', 'hyperframe.runtime.iife.js', 'fonts.json', 'textures.json'].map((f) =>
    readFile(join(dist, f), 'utf8'),
  ),
);
const assets = {
  runtimeJs: runtimeJs!,
  hyperframesRuntimeJs: hyperframesRuntimeJs!,
  fonts: JSON.parse(fontsJson!) as Record<string, string>,
  textures: JSON.parse(texturesJson!) as { grain: string; paper: string },
};

const look = looks['field-notes'];
if (!look) throw new Error('look field-notes missing');

const STAT = {
  variant: 'hero',
  content: {
    value: 9,
    prefix: '$',
    suffix: 'bn',
    decimals: 0,
    countFrom: 0,
    label: 'of trade sat still every day',
    context: 'Every single day',
  },
  beats: [],
  images: [],
};
const HOOK = {
  variant: 'center',
  content: {
    eyebrow: 'The problem',
    line: 'Nobody tells you the real reason prices keep going up',
    emphasis: 'real reason',
    subline: 'It starts with one number',
  },
  beats: [],
  images: [],
};
const SLOTS_18S = [
  { id: 'a', startMs: 0, endMs: 4600, componentId: 'stat-punch', params: STAT },
  { id: 'b', startMs: 5000, endMs: 13400, componentId: 'hook-statement', params: HOOK },
  { id: 'c', startMs: 13800, endMs: 18000, componentId: 'stat-punch', params: STAT },
];
const SLOTS_SHORT = [SLOTS_18S[0]!];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const voice = join(outDir, 'voice.wav');
const tone = spawnSync(ffmpeg, [
  '-loglevel',
  'error',
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:duration=18',
  '-ar',
  '48000',
  voice,
]);
if (tone.status !== 0) throw new Error(`ffmpeg tone: ${tone.stderr.toString()}`);

interface Probe {
  width: number;
  height: number;
  frames: number;
  durationS: number;
  audio: boolean;
}
function probe(file: string): Probe {
  const r = spawnSync(ffprobe, [
    '-v',
    'error',
    '-count_frames',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    file,
  ]);
  if (r.status !== 0) throw new Error(`ffprobe: ${r.stderr.toString()}`);
  const j = JSON.parse(r.stdout.toString()) as {
    streams: { codec_type: string; width?: number; height?: number; nb_read_frames?: string }[];
    format: { duration: string };
  };
  const v = j.streams.find((s) => s.codec_type === 'video');
  if (!v) throw new Error('no video stream');
  return {
    width: v.width ?? 0,
    height: v.height ?? 0,
    frames: Number(v.nb_read_frames ?? 0),
    durationS: Number(j.format.duration),
    audio: j.streams.some((s) => s.codec_type === 'audio'),
  };
}

/** Sum of resident memory (MB) of this process and every descendant, sampled while `fn` runs. */
async function withPeakMemory<T>(fn: () => Promise<T>): Promise<{ value: T; peakMb: number }> {
  let peakKb = 0;
  const sample = (): void => {
    const r = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,rss=']);
    const rows = r.stdout
      .toString()
      .trim()
      .split('\n')
      .map((l) => l.trim().split(/\s+/).map(Number) as [number, number, number]);
    const kids = new Map<number, number[]>();
    const rss = new Map<number, number>();
    for (const [pid, ppid, kb] of rows) {
      rss.set(pid, kb);
      kids.set(ppid, [...(kids.get(ppid) ?? []), pid]);
    }
    let sum = 0;
    const walk = (pid: number): void => {
      sum += rss.get(pid) ?? 0;
      for (const k of kids.get(pid) ?? []) walk(k);
    };
    walk(process.pid);
    peakKb = Math.max(peakKb, sum);
  };
  const timer = setInterval(sample, 400);
  try {
    return { value: await fn(), peakMb: peakKb / 1024 };
  } finally {
    clearInterval(timer);
    sample();
  }
}

async function render(opts: {
  name: string;
  format: Format;
  durationMs: number;
  slots: typeof SLOTS_18S;
  quality: 'standard' | 'high';
  workers?: number;
  outputResolution?: 'landscape-720p' | 'portrait-720p' | 'square-720p';
}): Promise<void> {
  const dir = join(outDir, opts.name);
  const comp = join(dir, 'composition');
  await mkdir(join(comp, 'assets'), { recursive: true });
  const html = compileProject(
    {
      format: opts.format,
      durationMs: opts.durationMs,
      style: look!,
      mode: 'render',
      voiceSrc: 'assets/voice.wav',
      slots: opts.slots,
    },
    assets,
  );
  await writeFile(join(comp, 'index.html'), html);
  await writeFile(join(comp, 'assets/voice.wav'), await readFile(voice));
  const out = join(dir, 'out.mp4');
  const t0 = performance.now();
  let error = '';
  const { peakMb } = await withPeakMemory(async () => {
    try {
      await executeRenderJob(
        createRenderJob({
          fps: FPS,
          quality: opts.quality,
          format: 'mp4',
          ...(opts.workers !== undefined ? { workers: opts.workers } : {}),
          ...(opts.outputResolution ? { outputResolution: opts.outputResolution } : {}),
        }),
        comp,
        out,
        () => {},
      );
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  });
  const wallS = (performance.now() - t0) / 1000;
  const want = FORMATS[opts.format];
  if (error) {
    console.log(`${opts.name}\tFAILED\t${wallS.toFixed(1)} s\t${error.slice(0, 160)}`);
    return;
  }
  const p = probe(out);
  const bytes = (await stat(out)).size;
  console.log(
    [
      opts.name,
      `${p.width}x${p.height} (composition ${want.width}x${want.height})`,
      `${p.frames} frames (want ${msToFrame(opts.durationMs, FPS)})`,
      `${p.durationS.toFixed(2)} s`,
      `audio ${p.audio}`,
      `${(bytes / 1024 / 1024).toFixed(2)} MB`,
      `wall ${wallS.toFixed(1)} s`,
      `peak ${peakMb.toFixed(0)} MB`,
    ].join('\t'),
  );
}

console.log('--- Part A: sizes and frame counts (4.6 s project, quality high) ---');
const presets: Record<Format, 'landscape-720p' | 'portrait-720p' | 'square-720p'> = {
  '16:9': 'landscape-720p',
  '9:16': 'portrait-720p',
  '1:1': 'square-720p',
};
for (const format of Object.keys(FORMATS) as Format[]) {
  const tag = format.replace(':', 'x');
  await render({
    name: `a-${tag}-1080p`,
    format,
    durationMs: 4600,
    slots: SLOTS_SHORT,
    quality: 'high',
  });
  await render({
    name: `a-${tag}-720p`,
    format,
    durationMs: 4600,
    slots: SLOTS_SHORT,
    quality: 'high',
    outputResolution: presets[format],
  });
}

console.log('--- Part B: 18 s, 16:9, 1080p: quality and workers ---');
for (const quality of ['high', 'standard'] as const) {
  for (const workers of [2, undefined]) {
    await render({
      name: `b-${quality}-w${workers ?? 'auto'}`,
      format: '16:9',
      durationMs: 18000,
      slots: SLOTS_18S,
      quality,
      ...(workers !== undefined ? { workers } : {}),
    });
  }
}
console.log(`outputs in ${outDir}`);
