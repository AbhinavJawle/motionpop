// Test harness for the render job: every port is a fake the test can change, the blob store is a
// real folder in the temp directory, the store is the in-memory one. Used by run-render tests.
import {
  bigNumberSlot,
  fixtureProject,
  statPunchSlot,
} from '@motionpop/motion/testing/project-fixture';
import {
  RenderDocSchema,
  msToFrame,
  renderPaths,
  type EditorProject,
  type Format,
  type RenderDoc,
  type RenderPaths,
  type Resolution,
} from '@motionpop/schemas';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsBlobStore } from '../fs-blobs';
import { expectedSize } from '../output';
import type {
  Clock,
  CompileAssets,
  Ffmpeg,
  MediaProbe,
  Preflight,
  Producer,
  ProducerProgress,
  RenderDeps,
  SlotIssue,
} from '../ports';
import { MemoryRenderStore } from '../store/memory';

export const OWNER = 'user-1';
export const RENDER_ID = 'r-test-render-0000000001';
export const VOICE_PATH = `users/${OWNER}/audio/fixture/voice-0123456789abcdef.wav`;

/** A clock the test moves by hand; `every` callbacks fire when the test calls `tick`. */
export class FakeClock implements Clock {
  t = 1_000_000;
  readonly timers = new Set<{ ms: number; fn: () => void }>();
  now(): number {
    return this.t;
  }
  every(ms: number, fn: () => void): () => void {
    const timer = { ms, fn };
    this.timers.add(timer);
    return () => this.timers.delete(timer);
  }
  /** Moves time forward and fires each heartbeat timer once per `ms` elapsed. */
  tick(ms: number): void {
    this.t += ms;
    for (const timer of [...this.timers]) {
      for (let i = 0; i < Math.floor(ms / timer.ms); i++) timer.fn();
    }
  }
}

/** Compiler assets that pass `compileProject`'s checks without the built runtime. */
export const FAKE_ASSETS: CompileAssets = {
  runtimeJs: '/* runtime */',
  hyperframesRuntimeJs: '/* hyperframes */',
  fonts: new Proxy({}, { get: () => 'AAAA' }) as Record<string, string>,
  textures: { grain: 'data:image/png;base64,AAAA', paper: 'data:image/png;base64,AAAA' },
};

export interface Fakes {
  /** What the voice probes as at each stage. */
  voiceProbe: (file: string) => MediaProbe;
  outputProbe: (file: string) => MediaProbe;
  preflight: (compDir: string) => Promise<SlotIssue[]>;
  produce: (args: Parameters<Producer['render']>[0]) => Promise<{ perf?: Record<string, unknown> }>;
  toWav: () => Promise<void>;
  frame: () => Promise<void>;
  upload: (path: string) => Promise<void>;
}

export interface Harness {
  deps: RenderDeps;
  store: MemoryRenderStore;
  blobs: FsBlobStore;
  clock: FakeClock;
  fakes: Fakes;
  project: EditorProject;
  doc: RenderDoc;
  paths: RenderPaths;
  renderId: string;
  /** Names of port calls in order, for example `producer.render`. */
  calls: string[];
  logs: { level: 'info' | 'error'; fields: Record<string, unknown> }[];
  workDir: string;
  /** Everything that could still be on disk or in the store after the render. */
  leftovers: () => Promise<{ blobs: string[] }>;
}

export interface HarnessOptions {
  format?: Format;
  resolution?: Resolution;
  project?: EditorProject;
  cost?: number;
  title?: string;
  /** Overrides for the render doc, for example another `voicePath`. */
  doc?: Partial<RenderDoc>;
  /** Skips writing the snapshot or the voice into the blob store. */
  skipSnapshot?: boolean;
  skipVoice?: boolean;
}

export function defaultProject(): EditorProject {
  return fixtureProject({
    slots: [statPunchSlot('a', 0, 4600), bigNumberSlot('b', 5600, 9800)],
    durationMs: 12_000,
  });
}

export async function makeHarness(opts: HarnessOptions = {}): Promise<Harness> {
  const project = opts.project ?? defaultProject();
  const format = opts.format ?? '16:9';
  const resolution = opts.resolution ?? '1080p';
  const root = await mkdtemp(join(tmpdir(), 'mp-render-test-'));
  const workDir = join(root, 'work', `render-${RENDER_ID}`);
  const blobs = new FsBlobStore(join(root, 'bucket'));
  const clock = new FakeClock();
  const calls: string[] = [];
  const logs: Harness['logs'] = [];
  const paths = renderPaths(OWNER, project.id, RENDER_ID);

  const store = new MemoryRenderStore(() => new Date(clock.t));
  const doc = RenderDocSchema.parse({
    schemaVersion: 1,
    ownerId: OWNER,
    projectId: project.id,
    requestId: '3b241101-e2bb-4255-8caf-4136c566a962',
    title: opts.title ?? 'Untitled Project',
    format,
    resolution,
    captions: false,
    music: false,
    durationMs: project.durationMs,
    slotCount: project.slots.length,
    status: 'queued',
    progress: 0,
    costCredits: opts.cost ?? 5,
    mode: 'offline',
    inputPath: paths.input,
    voicePath: VOICE_PATH,
    createdAt: new Date(clock.t),
    ...opts.doc,
  });
  store.create(RENDER_ID, doc);
  store.balances.set(OWNER, 15);
  if (!opts.skipSnapshot) await blobs.put(paths.input, JSON.stringify(project));
  if (!opts.skipVoice) await blobs.put(VOICE_PATH, 'not really audio');

  const fakes: Fakes = {
    voiceProbe: () => ({ durationMs: project.durationMs, audioStreams: 1, videoStreams: 0 }),
    outputProbe: () => {
      const size = expectedSize(format, resolution);
      return {
        durationMs: project.durationMs,
        audioStreams: 1,
        videoStreams: 1,
        width: size.width,
        height: size.height,
        frames: msToFrame(project.durationMs),
      };
    },
    preflight: async () => [],
    produce: async ({ outPath, onProgress }) => {
      const steps: ProducerProgress[] = [
        { stage: 'rendering', percent: 0 },
        { stage: 'rendering', percent: 40 },
        { stage: 'rendering', percent: 80 },
        { stage: 'encoding', percent: 20 },
        { stage: 'encoding', percent: 90 },
      ];
      for (const p of steps) {
        clock.t += 1500;
        onProgress(p);
      }
      await mkdir(join(outPath, '..'), { recursive: true });
      await writeFile(outPath, 'fake mp4 bytes');
      return { perf: { totalElapsedMs: 4321 } };
    },
    toWav: async () => undefined,
    frame: async () => undefined,
    upload: async () => undefined,
  };

  const ffmpeg: Ffmpeg = {
    async probe(file) {
      calls.push(`ffmpeg.probe:${file.split('/').pop()}`);
      if (file.endsWith('voice-source')) return fakes.voiceProbe(file);
      if (file.endsWith('voice.wav')) return fakes.voiceProbe(file);
      return fakes.outputProbe(file);
    },
    async toWav(_src, dest) {
      calls.push('ffmpeg.toWav');
      await fakes.toWav();
      await writeFile(dest, 'RIFF fake wav');
    },
    async frame({ destJpg }) {
      calls.push('ffmpeg.frame');
      await fakes.frame();
      await writeFile(destJpg, 'fake jpg');
    },
  };
  const preflight: Preflight = {
    async check({ compDir }) {
      calls.push('preflight.check');
      return fakes.preflight(compDir);
    },
  };
  const producer: Producer = {
    async render(args) {
      calls.push('producer.render');
      return fakes.produce(args);
    },
  };
  // Uploads go through a wrapper so a test can make them fail.
  const realUpload = blobs.upload.bind(blobs);
  blobs.upload = async (path, src, meta) => {
    calls.push(`blobs.upload:${path.split('/').pop()}`);
    await fakes.upload(path);
    return realUpload(path, src, meta);
  };

  const deps: RenderDeps = {
    store,
    blobs,
    preflight,
    producer,
    ffmpeg,
    assets: FAKE_ASSETS,
    clock,
    workDir,
    log: {
      info: (fields) => logs.push({ level: 'info', fields }),
      error: (fields) => logs.push({ level: 'error', fields }),
    },
  };

  return {
    deps,
    store,
    blobs,
    clock,
    fakes,
    project,
    doc,
    paths,
    renderId: RENDER_ID,
    calls,
    logs,
    workDir,
    leftovers: async () => ({ blobs: await blobs.paths() }),
  };
}
