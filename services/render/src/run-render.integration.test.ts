// Integration tests with the real producer (spec 08 task 9): real Chrome, the real HyperFrames
// producer and real ffmpeg, over the in-memory store and a folder as the bucket. They are skipped
// on a machine that lacks ffmpeg, Chrome or the built motion runtime, and they must run in CI:
// when `CI` is set a missing tool is a failure, not a skip.
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileProject, projectCompileInput } from '@motionpop/motion/compiler';
import { bigNumberSlot, fixtureProject } from '@motionpop/motion/testing/project-fixture';
import {
  FORMATS,
  RenderDocSchema,
  frameToMs,
  msToFrame,
  renderPaths,
  type EditorProject,
  type Format,
  type Resolution,
} from '@motionpop/schemas';
import { loadCompileAssets, motionDistDir } from './compile-assets';
import { createProcessFfmpeg } from './ffmpeg';
import { FsBlobStore } from './fs-blobs';
import { expectedSize } from './output';
import type { CompileAssets } from './ports';
import { createChromePreflight } from './preflight';
import { preflightSamples } from './preflight-samples';
import { createHyperframesProducer } from './producer';
import { runRender } from './run-render';
import { MemoryRenderStore } from './store/memory';

const ffmpegBin = process.env['FFMPEG_PATH'] ?? 'ffmpeg';
const ffprobeBin = process.env['FFPROBE_PATH'] ?? 'ffprobe';
const missing: string[] = [];
if (spawnSync(ffmpegBin, ['-version']).status !== 0) missing.push('ffmpeg');
if (spawnSync(ffprobeBin, ['-version']).status !== 0) missing.push('ffprobe');
try {
  if (!existsSync(await puppeteer.executablePath())) missing.push('Chrome');
} catch {
  missing.push('Chrome');
}
if (!existsSync(join(motionDistDir(), 'runtime.js'))) missing.push('packages/motion/dist');
const mustRun = Boolean(process.env['CI']);
if (mustRun && missing.length > 0) {
  throw new Error(`the integration tests need ${missing.join(', ')} in CI`);
}

const OWNER = 'it-user';
const DURATION_MS = 2000;
/** One 1 kHz beep 200 ms long, starting here in the voice (P10). */
const BEEP_AT_MS = 1000;
const TIMEOUT = 240_000;

/**
 * A 2 s project with two slots on whole words (word i spans i × 700 ms). The fixture's transcript
 * runs 24 words, so only the first three are kept.
 */
function twoSlotProject(): EditorProject {
  const project = fixtureProject({
    durationMs: DURATION_MS,
    slots: [bigNumberSlot('a', 0, 700), bigNumberSlot('b', 1400, 2000)],
  });
  return {
    ...project,
    transcript: { ...project.transcript, words: project.transcript.words.slice(0, 3) },
    voiceover: { src: 'synth:demo', durationMs: DURATION_MS },
  };
}

describe.skipIf(!mustRun && missing.length > 0)(
  `the real render pipeline (${missing.length ? `missing: ${missing.join(', ')}` : 'ffmpeg, Chrome and the runtime are present'})`,
  () => {
    let root: string;
    let assets: CompileAssets;
    let voice: Buffer;
    const ffmpeg = createProcessFfmpeg();

    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), 'mp-render-it-'));
      assets = await loadCompileAssets();
      const wav = join(root, 'beep.wav');
      const made = spawnSync(
        ffmpegBin,
        [
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=1000:sample_rate=48000:duration=0.2',
          '-af',
          `volume=0.5,adelay=${BEEP_AT_MS}:all=1,apad=whole_dur=${DURATION_MS / 1000}`,
          '-ac',
          '1',
          wav,
        ],
        { encoding: 'utf8' },
      );
      if (made.status !== 0) throw new Error(`could not make the beep: ${made.stderr}`);
      voice = await readFile(wav);
    }, TIMEOUT);

    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    });

    /** Runs `runRender` for real and returns the output file and the render doc. */
    async function render(format: Format, resolution: Resolution) {
      const project = twoSlotProject();
      const renderId = `it-${randomUUID().replaceAll('-', '').slice(0, 20)}`;
      const dir = await mkdtemp(join(root, 'run-'));
      const blobs = new FsBlobStore(join(dir, 'bucket'));
      const paths = renderPaths(OWNER, project.id, renderId);
      const hash = createHash('sha256').update(voice).digest('hex').slice(0, 16);
      const voicePath = `users/${OWNER}/audio/${project.id}/voice-${hash}.wav`;
      await blobs.put(paths.input, JSON.stringify(project));
      await blobs.put(voicePath, voice);
      const store = new MemoryRenderStore();
      store.create(
        renderId,
        RenderDocSchema.parse({
          schemaVersion: 1,
          ownerId: OWNER,
          projectId: project.id,
          requestId: randomUUID(),
          title: 'Integration',
          format,
          resolution,
          captions: false,
          music: false,
          durationMs: DURATION_MS,
          slotCount: 2,
          status: 'queued',
          progress: 0,
          costCredits: 0,
          mode: 'offline',
          inputPath: paths.input,
          voicePath,
          createdAt: new Date(),
        }),
      );
      const logs: Record<string, unknown>[] = [];
      const outcome = await runRender(renderId, {
        store,
        blobs,
        preflight: createChromePreflight({ noSandbox: process.env['CHROME_NO_SANDBOX'] === '1' }),
        producer: createHyperframesProducer(),
        ffmpeg,
        assets,
        clock: { now: () => Date.now(), every: (ms, fn) => cancel(setInterval(fn, ms)) },
        workDir: join(dir, 'work'),
        log: { info: (f) => logs.push(f), error: (f) => logs.push(f) },
      });
      const doc = await store.get(renderId);
      return { outcome, doc, blobs, logs, paths };
    }

    const cancel = (t: ReturnType<typeof setInterval>) => () => clearInterval(t);

    const cases: [Format, Resolution][] = [
      ['16:9', '1080p'],
      ['9:16', '1080p'],
      ['1:1', '1080p'],
      ['16:9', '720p'],
    ];

    for (const [format, resolution] of cases) {
      it(
        `renders ${format} at ${resolution}: size, frame count and duration`,
        async () => {
          const { outcome, doc, blobs, logs, paths } = await render(format, resolution);
          expect(outcome, JSON.stringify(logs.filter((l) => l['event'] !== 'render'))).toBe('done');
          expect(doc).toMatchObject({ status: 'done', progress: 100 });
          const file = blobs.localPath(doc!.outputPath!);
          const probe = await ffmpeg.probe(file, { countFrames: true });
          const size = expectedSize(format, resolution);
          expect([probe.width, probe.height]).toEqual([size.width, size.height]);
          if (resolution === '1080p') {
            expect([probe.width, probe.height]).toEqual([
              FORMATS[format].width,
              FORMATS[format].height,
            ]);
          }
          const frames = msToFrame(DURATION_MS);
          expect(Math.abs((probe.frames ?? 0) - frames)).toBeLessThanOrEqual(1);
          // Duration is within one frame of the project's.
          expect(Math.abs(probe.durationMs - DURATION_MS)).toBeLessThanOrEqual(frameToMs(1) + 1);
          expect(probe.audioStreams).toBe(1);
          expect(probe.videoStreams).toBe(1);
          // The thumbnail and the snapshot cleanup (R3.5, R6.1).
          expect((await blobs.paths()).filter((p) => p.startsWith(paths.inputDir))).toEqual([]);
          expect(existsSync(blobs.localPath(doc!.thumbPath!))).toBe(true);
        },
        TIMEOUT,
      );
    }

    it(
      'P10: the voice beep lands within one frame of where it was in the voice',
      async () => {
        const { outcome, doc, blobs } = await render('16:9', '720p');
        expect(outcome).toBe('done');
        const file = blobs.localPath(doc!.outputPath!);
        const pcm = spawnSync(
          ffmpegBin,
          ['-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'],
          { maxBuffer: 64 * 1024 * 1024 },
        );
        expect(pcm.status).toBe(0);
        const samples = new Float32Array(
          pcm.stdout.buffer,
          pcm.stdout.byteOffset,
          Math.floor(pcm.stdout.byteLength / 4),
        );
        // The lavfi sine is 0.125 at full scale and the beep is made at volume 0.5, so the level
        // should come through unchanged (0.0625). The onset is the first sample at half the peak.
        let peak = 0;
        for (const s of samples) peak = Math.max(peak, Math.abs(s));
        expect(peak, 'the voice level is kept').toBeGreaterThan(0.05);
        expect(peak).toBeLessThan(0.08);
        const first = samples.findIndex((s) => Math.abs(s) > peak / 2);
        const onsetMs = (first / 48000) * 1000;
        expect(Math.abs(onsetMs - BEEP_AT_MS)).toBeLessThanOrEqual(frameToMs(1));
      },
      TIMEOUT,
    );

    it(
      'the preflight catches a slot whose build throws and names it',
      async () => {
        const project = twoSlotProject();
        const input = projectCompileInput(project, {
          mode: 'render',
          format: '16:9',
          background: 'style',
          voiceSrc: 'assets/voice.wav',
        });
        // `compileProject` does not parse params; the component's build does, and throws.
        const slots = input.slots.map((s) =>
          s.id === 'b' ? { ...s, params: { value: 'not a number', label: 5 } } : s,
        );
        const dir = await mkdtemp(join(root, 'pre-'));
        await mkdir(join(dir, 'assets'), { recursive: true });
        await writeFile(join(dir, 'assets', 'voice.wav'), voice);
        await writeFile(join(dir, 'index.html'), compileProject({ ...input, slots }, assets));
        const preflight = createChromePreflight({
          noSandbox: process.env['CHROME_NO_SANDBOX'] === '1',
        });
        const issues = await preflight.check({
          compDir: dir,
          format: '16:9',
          samplesMs: preflightSamples(slots),
          signal: new AbortController().signal,
        });
        expect(issues.map((i) => i.slotId)).toEqual(['b']);

        // The good slot alone passes.
        const goodDir = await mkdtemp(join(root, 'pre-good-'));
        await mkdir(join(goodDir, 'assets'), { recursive: true });
        await writeFile(join(goodDir, 'assets', 'voice.wav'), voice);
        await writeFile(join(goodDir, 'index.html'), compileProject(input, assets));
        expect(
          await preflight.check({
            compDir: goodDir,
            format: '16:9',
            samplesMs: preflightSamples(input.slots),
            signal: new AbortController().signal,
          }),
        ).toEqual([]);
      },
      TIMEOUT,
    );
  },
);
