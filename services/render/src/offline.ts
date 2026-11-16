// Offline mode (spec 08 design §2, R7.3): the render job runs inside the Next server, over an
// in-memory render store and a folder in the OS temp directory as the bucket. Development only:
// `renderMode()` never gives `offline` in production. The singletons live on `globalThis`, so they
// survive Next's hot reload. Heavy modules (Chrome, the producer) are imported on first use.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsBlobStore } from './fs-blobs';
import { jsonLogger, systemClock } from './clock';
import type { Producer, RenderDeps } from './ports';
import { MemoryRenderStore } from './store/memory';

export interface OfflineRuntime {
  store: MemoryRenderStore;
  blobs: FsBlobStore;
  /** Parent of the object folder and of each render's working folder. */
  root: string;
}

const KEY = Symbol.for('motionpop.offlineRuntime');
type Holder = { [KEY]?: OfflineRuntime };

/** The one store and bucket of this server process. */
export function offlineRuntime(root: string = join(tmpdir(), 'motionpop-renders')): OfflineRuntime {
  const holder = globalThis as unknown as Holder;
  holder[KEY] ??= {
    store: new MemoryRenderStore(),
    blobs: new FsBlobStore(join(root, 'blobs')),
    root,
  };
  return holder[KEY];
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Test hook of the end-to-end tests (spec 08 task 19): `MP_RENDER_FAKE_FAIL=producer` makes the
 * producer step throw. Only this function reads it, so the cloud and emulator deps cannot be told
 * to fail by an environment variable (P11); `offline.test.ts` checks that.
 */
export function withFakeFailure(producer: Producer, env: Env): Producer {
  if (env['MP_RENDER_FAKE_FAIL'] !== 'producer') return producer;
  return {
    async render() {
      throw new Error('injected producer failure (MP_RENDER_FAKE_FAIL)');
    },
  };
}

export async function offlineDeps(
  renderId: string,
  env: Env = process.env,
  runtime: OfflineRuntime = offlineRuntime(),
): Promise<RenderDeps> {
  const [{ loadCompileAssets }, { createChromePreflight }, { createHyperframesProducer }, ff] =
    await Promise.all([
      import('./compile-assets'),
      import('./preflight'),
      import('./producer'),
      import('./ffmpeg'),
    ]);
  return {
    store: runtime.store,
    blobs: runtime.blobs,
    preflight: createChromePreflight({ noSandbox: env['CHROME_NO_SANDBOX'] === '1' }),
    producer: withFakeFailure(createHyperframesProducer(), env),
    ffmpeg: ff.createProcessFfmpeg(),
    assets: await loadCompileAssets(),
    clock: systemClock,
    workDir: join(runtime.root, 'work', `render-${renderId}`),
    log: jsonLogger,
  };
}

/** Runs one offline render to its end (the launcher does not wait for it). */
export async function runOffline(renderId: string, env: Env = process.env): Promise<void> {
  const { runRender } = await import('./run-render');
  await runRender(renderId, await offlineDeps(renderId, env));
}

/**
 * The tools a real render needs that this machine lacks: `ffmpeg`, `ffprobe`, a Chrome that
 * puppeteer can launch and the built motion runtime. Empty when a render can run. Integration
 * tests use it to skip (locally) or fail (in CI) instead of failing mysteriously.
 */
export async function missingRenderTools(env: Env = process.env): Promise<string[]> {
  const missing: string[] = [];
  const ffmpeg = env['FFMPEG_PATH'] ?? 'ffmpeg';
  const ffprobe = env['FFPROBE_PATH'] ?? 'ffprobe';
  if (spawnSync(ffmpeg, ['-version']).status !== 0) missing.push('ffmpeg');
  if (spawnSync(ffprobe, ['-version']).status !== 0) missing.push('ffprobe');
  try {
    const { default: puppeteer } = await import('puppeteer');
    if (!existsSync(await puppeteer.executablePath())) missing.push('Chrome');
  } catch {
    missing.push('Chrome');
  }
  const { motionDistDir } = await import('./compile-assets');
  if (!existsSync(join(motionDistDir(), 'runtime.js'))) missing.push('packages/motion/dist');
  return missing;
}
