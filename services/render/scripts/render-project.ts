// Renders a project JSON to an MP4 on this machine, with no Firebase (spec 08 R7.5): the same
// `runRender` as the cloud job, over the in-memory store and a folder as the bucket. For debugging
// and CI.
//
// Usage: pnpm --filter @motionpop/render render:project <project.json> <voice> <out.mp4>
//          [--resolution 720p|1080p] [--format 16:9|9:16|1:1] [--video <source.mp4>] [--no-sandbox]
// The project JSON is an `EditorProject` (what the editor saves). The voice is any audio file.
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { isRenderable } from '@motionpop/motion/compiler';
import {
  EditorProjectSchema,
  FormatSchema,
  RenderDocSchema,
  ResolutionSchema,
  isSafeId,
  renderPaths,
} from '@motionpop/schemas';
import { jsonLogger, systemClock } from '../src/clock';
import { loadCompileAssets } from '../src/compile-assets';
import { createProcessFfmpeg } from '../src/ffmpeg';
import { FsBlobStore } from '../src/fs-blobs';
import { createChromePreflight } from '../src/preflight';
import { createHyperframesProducer } from '../src/producer';
import { runRender } from '../src/run-render';
import { MemoryRenderStore } from '../src/store/memory';

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const args = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i]!;
  if (a === '--no-sandbox') flags.set('no-sandbox', '1');
  else if (a === '--resolution' || a === '--format' || a === '--video')
    flags.set(a.slice(2), args[++i] ?? '');
  else if (a.startsWith('--')) fail(`unknown flag ${a}`);
  else positional.push(a);
}
const [projectFile, voiceFile, outFile] = positional;
if (!projectFile || !voiceFile || !outFile) {
  fail(
    'usage: render-project.ts <project.json> <voice> <out.mp4> [--resolution 720p|1080p] [--format 16:9|9:16|1:1] [--no-sandbox]',
  );
}

const project = EditorProjectSchema.parse(JSON.parse(await readFile(projectFile, 'utf8')));
if (!isSafeId(project.id)) fail(`the project id ${JSON.stringify(project.id)} is not a safe id`);
const format = FormatSchema.parse(flags.get('format') ?? project.format);
const resolution = ResolutionSchema.parse(flags.get('resolution') ?? '1080p');

const OWNER = 'local-user';
const renderId = 'local-render';
const voiceBytes = await readFile(voiceFile);
const ext = extname(voiceFile).slice(1).toLowerCase();
if (!['wav', 'mp3', 'm4a', 'webm', 'ogg'].includes(ext)) {
  fail(`the voice must be .wav, .mp3, .m4a, .webm or .ogg, got .${ext}`);
}
const hash = createHash('sha256').update(voiceBytes).digest('hex').slice(0, 16);
const voicePath = `users/${OWNER}/audio/${project.id}/voice-${hash}.${ext}`;
const paths = renderPaths(OWNER, project.id, renderId);

const root = await mkdtemp(join(tmpdir(), 'motionpop-render-project-'));
const blobs = new FsBlobStore(join(root, 'bucket'));
await blobs.put(paths.input, JSON.stringify(project));
await blobs.put(voicePath, voiceBytes);

// Video projects (spec 18, spec 25 reels): the source video goes where uploads go.
let videoPath: string | undefined;
const videoFile = flags.get('video');
if (videoFile) {
  const bytes = await readFile(videoFile);
  const vext = extname(videoFile).slice(1).toLowerCase();
  if (!['mp4', 'mov', 'webm'].includes(vext)) fail(`the video must be .mp4, .mov or .webm`);
  const vhash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  videoPath = `users/${OWNER}/video/${project.id}/source-${vhash}.${vext}`;
  await blobs.put(videoPath, bytes);
}

const store = new MemoryRenderStore();
store.create(
  renderId,
  RenderDocSchema.parse({
    schemaVersion: 1,
    ownerId: OWNER,
    projectId: project.id,
    requestId: randomUUID(),
    title: project.title || basename(outFile, extname(outFile)),
    format,
    resolution,
    captions: false,
    music: false,
    durationMs: project.durationMs,
    slotCount: project.slots.filter((s) => isRenderable(s, format)).length,
    status: 'queued',
    progress: 0,
    costCredits: 0,
    mode: 'offline',
    inputPath: paths.input,
    voicePath,
    ...(videoPath ? { videoPath } : {}),
    createdAt: new Date(),
  }),
);

const started = performance.now();
const outcome = await runRender(renderId, {
  store,
  blobs,
  preflight: createChromePreflight({ noSandbox: flags.has('no-sandbox') }),
  producer: createHyperframesProducer(),
  ffmpeg: createProcessFfmpeg(),
  assets: await loadCompileAssets(),
  clock: systemClock,
  workDir: join(root, 'work'),
  log: jsonLogger,
});
const doc = await store.get(renderId);
const seconds = ((performance.now() - started) / 1000).toFixed(1);

if (outcome === 'done' && doc?.outputPath) {
  await mkdir(resolve(outFile, '..'), { recursive: true });
  await copyFile(blobs.localPath(doc.outputPath), outFile);
  if (doc.thumbPath) await copyFile(blobs.localPath(doc.thumbPath), `${outFile}.jpg`);
  console.log(
    `done: ${outFile} (${doc.sizeBytes ?? 0} bytes, ${format} ${resolution}) in ${seconds}s`,
  );
  await rm(root, { recursive: true, force: true });
  process.exit(0);
}
console.error(
  `${outcome}: ${doc?.error ?? 'unknown'}: ${doc?.errorMessage ?? ''} (after ${seconds}s)`,
);
await rm(root, { recursive: true, force: true });
process.exit(1);
