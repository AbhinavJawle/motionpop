import 'server-only';
import { projectIdFrom, storageBucketFrom } from '@/lib/firebase/project-env';
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { isSafeId } from '@motionpop/schemas';
import { adminApp } from '@/lib/firebase/admin.server';
import type { RenderMode } from './mode';

// The three ways to start a render job (spec 08 design §9): a Cloud Run job execution (production),
// a child process running the job's entry point (emulator mode) and an in-process call (offline).
// Each takes its collaborators as arguments, so the request shapes and the failures are unit tested
// with fakes.

export interface RenderLauncher {
  /** Starts the job for `renderId`. The execution name is optional on the doc, so it may be absent. */
  launch(renderId: string): Promise<{ executionName?: string }>;
}

/** The job could not be started. The route turns it into `failRender(start-failed)` and a 502. */
export class LaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LaunchError';
  }
}

const requireId = (renderId: string): void => {
  if (!isSafeId(renderId)) throw new LaunchError('the render id is not valid');
};

// ---------------------------------------------------------------------------------------------
// Cloud Run

const NAME_RE = /^[A-Za-z0-9_-]{1,100}$/;
export const LAUNCH_TIMEOUT_MS = 15_000;

/** Only `metadata.name` of the long-running Operation is read; it is the Execution's full name. */
const OperationSchema = z.looseObject({
  metadata: z.looseObject({ name: z.string().min(1).max(500).optional() }).optional(),
});

export interface CloudRunLauncherOptions {
  projectId: string;
  region: string;
  job: string;
  /** An OAuth access token with the cloud-platform scope for the web backend's service account. */
  getToken: () => Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * `POST https://run.googleapis.com/v2/projects/{p}/locations/{r}/jobs/{job}:run` with a
 * `RENDER_ID` environment override (`run.jobs.runWithOverrides`). Any timeout, token failure or
 * non-2xx answer is a `LaunchError`; the answer's body is not copied into the message.
 */
export function cloudRunLauncher(opts: CloudRunLauncherOptions): RenderLauncher {
  for (const [what, value] of [
    ['project', opts.projectId],
    ['region', opts.region],
    ['job', opts.job],
  ] as const) {
    if (!NAME_RE.test(value)) throw new LaunchError(`the Cloud Run ${what} name is not valid`);
  }
  const doFetch = opts.fetch ?? fetch;
  const url =
    `https://run.googleapis.com/v2/projects/${opts.projectId}` +
    `/locations/${opts.region}/jobs/${opts.job}:run`;
  return {
    async launch(renderId) {
      requireId(renderId);
      let token: string;
      try {
        token = await opts.getToken();
      } catch {
        throw new LaunchError('could not get an access token for Cloud Run');
      }
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            overrides: { containerOverrides: [{ env: [{ name: 'RENDER_ID', value: renderId }] }] },
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? LAUNCH_TIMEOUT_MS),
        });
      } catch (e) {
        const timedOut =
          e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
        throw new LaunchError(
          timedOut ? 'Cloud Run did not answer in time' : 'Cloud Run is unreachable',
        );
      }
      if (!res.ok) throw new LaunchError(`Cloud Run answered ${res.status}`);
      // A body we can't read is not a failed launch: the job is running, the name is optional.
      const body = OperationSchema.safeParse(await res.json().catch(() => null));
      const name = body.success ? body.data.metadata?.name : undefined;
      return name ? { executionName: name } : {};
    },
  };
}

const MetadataTokenSchema = z.looseObject({ access_token: z.string().min(1) });

/** The fallback token source: the metadata server of the container the web backend runs in. */
export async function metadataToken(doFetch: typeof fetch = fetch): Promise<string> {
  const res = await doFetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-account/token',
    { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5_000) },
  );
  if (!res.ok) throw new Error(`the metadata server answered ${res.status}`);
  return MetadataTokenSchema.parse(await res.json()).access_token;
}

/**
 * An access token for `run.googleapis.com`: the Admin SDK's credential first (the App Hosting
 * service account carries the cloud-platform scope), the metadata server when that fails.
 * Not yet checked against a real Cloud Run job: spec 08 task 6a step 5 does that.
 */
export async function adminAccessToken(): Promise<string> {
  const credential = adminApp().options.credential;
  if (credential) {
    try {
      const t = await credential.getAccessToken();
      if (t.access_token) return t.access_token;
    } catch {
      // Fall through to the metadata server.
    }
  }
  return metadataToken();
}

// ---------------------------------------------------------------------------------------------
// Emulator mode: a child process

/** What the child process may see of the parent's environment: no secrets, only what the job needs. */
const CHILD_ENV_KEYS = [
  'PATH',
  'HOME',
  'TMPDIR',
  'LANG',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'STORAGE_BUCKET',
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'CHROME_NO_SANDBOX',
  'RENDER_WORK_ROOT',
  'FFMPEG_PATH',
  'FFPROBE_PATH',
  'PUPPETEER_CACHE_DIR',
  'PUPPETEER_EXECUTABLE_PATH',
] as const;

/** The part of a child process the launcher uses. */
export interface ChildLike {
  pid?: number | undefined;
  unref(): void;
  once(event: 'spawn', cb: () => void): unknown;
  once(event: 'error', cb: (e: Error) => void): unknown;
}

export interface ChildSpawnOptions {
  cwd: string;
  env: Record<string, string>;
  detached: true;
  stdio: ['ignore', number, number];
}

export type SpawnFn = (command: string, args: string[], options: ChildSpawnOptions) => ChildLike;

export interface ChildProcessLauncherOptions {
  /** The `services/render` folder: the job runs from there so `tsx` resolves. */
  renderDir: string;
  env: Readonly<Record<string, string | undefined>>;
  /** Where each render's log goes: `{logDir}/{renderId}.log`. */
  logDir: string;
  spawn?: SpawnFn;
  /** Opens (creating the folder) the log file and returns its descriptor. */
  openLog?: (file: string) => number;
  nodePath?: string;
}

const defaultOpenLog = (file: string): number => {
  mkdirSync(resolve(file, '..'), { recursive: true });
  return openSync(file, 'a');
};

/** `node --import tsx src/job.ts` with `RENDER_ID`, detached, with its output in a log file. */
export function childProcessLauncher(opts: ChildProcessLauncherOptions): RenderLauncher {
  const doSpawn: SpawnFn =
    opts.spawn ??
    // Next's types make `NODE_ENV` a required key of `ProcessEnv`; the child's env is a plain map.
    ((c, a, o) => spawn(c, a, { ...o, env: o.env as NodeJS.ProcessEnv }));
  const openLog = opts.openLog ?? defaultOpenLog;
  return {
    async launch(renderId) {
      requireId(renderId);
      const env: Record<string, string> = {};
      for (const key of CHILD_ENV_KEYS) {
        const v = opts.env[key];
        if (v !== undefined) env[key] = v;
      }
      env['RENDER_ID'] = renderId;
      const fd = openLog(join(opts.logDir, `${renderId}.log`));
      const child = doSpawn(opts.nodePath ?? process.execPath, ['--import', 'tsx', 'src/job.ts'], {
        cwd: opts.renderDir,
        env,
        detached: true,
        stdio: ['ignore', fd, fd],
      });
      // A missing executable or folder is reported by an `error` event, not by an exception.
      await new Promise<void>((done, fail) => {
        child.once('spawn', done);
        child.once('error', (e) => fail(new LaunchError(`could not start the job: ${e.message}`)));
      });
      child.unref();
      return { executionName: `local-${child.pid ?? 'unknown'}` };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Offline mode: in this process

export interface InProcessLauncherOptions {
  /** Runs the render to its end; the offline deps are wired by the offline routes (task 12). */
  run: (renderId: string) => Promise<unknown>;
  onError?: (renderId: string, error: unknown) => void;
}

/** Starts `runRender` without waiting for it: the route answers while the render runs. */
export function inProcessLauncher(opts: InProcessLauncherOptions): RenderLauncher {
  return {
    async launch(renderId) {
      requireId(renderId);
      void Promise.resolve()
        .then(() => opts.run(renderId))
        .catch((e: unknown) => opts.onError?.(renderId, e));
      return { executionName: 'local-in-process' };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Choosing one

/** An environment: `process.env` or a test's own object. */
export type Env = Readonly<Record<string, string | undefined>>;

export interface LauncherSources {
  env?: Env;
  /** Offline mode only: how to run a render in this process. */
  runOffline?: (renderId: string) => Promise<unknown>;
}

/** The launcher of a render mode, configured from the environment (`RENDER_JOB`, `RENDER_REGION`). */
export function launcherFor(mode: RenderMode, sources: LauncherSources = {}): RenderLauncher {
  const env = sources.env ?? process.env;
  const projectId = projectIdFrom(env);
  switch (mode) {
    case 'cloud':
      if (!projectId) throw new LaunchError('the Google Cloud project is not configured');
      return cloudRunLauncher({
        projectId,
        region: env['RENDER_REGION'] ?? 'us-central1',
        job: env['RENDER_JOB'] ?? 'motionpop-render',
        getToken: adminAccessToken,
      });
    case 'emulator':
      return childProcessLauncher({
        renderDir: resolve(process.cwd(), '../../services/render'),
        env: {
          ...env,
          ...(projectId ? { GOOGLE_CLOUD_PROJECT: projectId } : {}),
          ...(storageBucketFrom(env) ? { STORAGE_BUCKET: storageBucketFrom(env) } : {}),
        },
        logDir: join(tmpdir(), 'motionpop-renders'),
      });
    case 'offline': {
      const run = sources.runOffline;
      if (!run) throw new LaunchError('offline renders are not wired in this server');
      return inProcessLauncher({
        run,
        onError: (renderId, e) =>
          console.error(JSON.stringify({ event: 'offline-render', renderId, error: String(e) })),
      });
    }
  }
}
