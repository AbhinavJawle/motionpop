import { describe, expect, it, vi } from 'vitest';
import {
  LaunchError,
  childProcessLauncher,
  cloudRunLauncher,
  inProcessLauncher,
  launcherFor,
  metadataToken,
  type ChildLike,
  type SpawnFn,
} from './launcher.server';

const ID = 'r-test-render-0000000001';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function cloud(
  fetchImpl: typeof fetch,
  extra: Partial<Parameters<typeof cloudRunLauncher>[0]> = {},
) {
  return cloudRunLauncher({
    projectId: 'motionpop-48409',
    region: 'us-central1',
    job: 'motionpop-render',
    getToken: async () => 'tok-123',
    fetch: fetchImpl,
    ...extra,
  });
}

describe('cloudRunLauncher', () => {
  it('posts jobs:run with the RENDER_ID override and reads the execution name', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return json({
        name: 'projects/p/locations/us-central1/operations/op-1',
        metadata: { name: 'projects/p/locations/us-central1/jobs/motionpop-render/executions/e1' },
      });
    }) as unknown as typeof fetch;
    const r = await cloud(f).launch(ID);
    expect(r).toEqual({
      executionName: 'projects/p/locations/us-central1/jobs/motionpop-render/executions/e1',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'https://run.googleapis.com/v2/projects/motionpop-48409/locations/us-central1/jobs/motionpop-render:run',
    );
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({ authorization: 'Bearer tok-123' });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      overrides: { containerOverrides: [{ env: [{ name: 'RENDER_ID', value: ID }] }] },
    });
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('a body without a name, or no body at all, is still a launch', async () => {
    expect(
      await cloud((async () => json({ metadata: {} })) as unknown as typeof fetch).launch(ID),
    ).toEqual({});
    expect(
      await cloud(
        (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch,
      ).launch(ID),
    ).toEqual({});
  });

  it('turns a non-2xx answer into a LaunchError without copying the body', async () => {
    for (const status of [400, 403, 404, 429, 500, 503]) {
      const f = (async () =>
        json(
          { error: { message: 'secret detail about the project' } },
          status,
        )) as unknown as typeof fetch;
      const e = await cloud(f)
        .launch(ID)
        .catch((x: unknown) => x);
      expect(e).toBeInstanceOf(LaunchError);
      expect((e as Error).message).toBe(`Cloud Run answered ${status}`);
      expect((e as Error).message).not.toContain('secret');
    }
  });

  it('turns a network failure and a timeout into a LaunchError', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(cloud(down).launch(ID)).rejects.toThrow('Cloud Run is unreachable');
    const slow = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'TimeoutError';
          reject(e);
        });
      })) as unknown as typeof fetch;
    await expect(cloud(slow, { timeoutMs: 20 }).launch(ID)).rejects.toThrow(
      'did not answer in time',
    );
  });

  it('a token failure never reaches fetch', async () => {
    const f = vi.fn();
    const l = cloud(f as unknown as typeof fetch, {
      getToken: async () => {
        throw new Error('no credentials: super secret path');
      },
    });
    const e = await l.launch(ID).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LaunchError);
    expect((e as Error).message).toBe('could not get an access token for Cloud Run');
    expect(f).not.toHaveBeenCalled();
  });

  it('refuses a bad render id or bad names before any request', async () => {
    const f = vi.fn();
    await expect(cloud(f as unknown as typeof fetch).launch('../x')).rejects.toBeInstanceOf(
      LaunchError,
    );
    expect(() => cloud(f as unknown as typeof fetch, { job: 'a/../b' })).toThrow(LaunchError);
    expect(() => cloud(f as unknown as typeof fetch, { projectId: 'p?x=1' })).toThrow(LaunchError);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('metadataToken', () => {
  it('asks the metadata server with its header and reads the token', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return json({ access_token: 'meta-tok', expires_in: 3000, token_type: 'Bearer' });
    }) as unknown as typeof fetch;
    expect(await metadataToken(f)).toBe('meta-tok');
    expect(seen?.url).toContain(
      'metadata.google.internal/computeMetadata/v1/instance/service-account/token',
    );
    expect(seen?.init.headers).toEqual({ 'Metadata-Flavor': 'Google' });
  });

  it('throws on an error answer or a body without a token', async () => {
    await expect(
      metadataToken((async () => json({}, 404)) as unknown as typeof fetch),
    ).rejects.toThrow('404');
    await expect(
      metadataToken((async () => json({ nope: 1 })) as unknown as typeof fetch),
    ).rejects.toThrow();
  });
});

describe('childProcessLauncher', () => {
  function fakeSpawn(behaviour: 'ok' | 'error') {
    const calls: { command: string; args: string[]; options: Parameters<SpawnFn>[2] }[] = [];
    let unref = 0;
    const spawn: SpawnFn = (command, args, options) => {
      calls.push({ command, args, options });
      const child: ChildLike = {
        pid: 4242,
        unref: () => void unref++,
        once: ((event: 'spawn' | 'error', cb: (e?: Error) => void) => {
          queueMicrotask(() => {
            if (behaviour === 'ok' && event === 'spawn') cb();
            if (behaviour === 'error' && event === 'error') cb(new Error('spawn ENOENT'));
          });
        }) as ChildLike['once'],
      };
      return child;
    };
    return { spawn, calls, unrefs: () => unref };
  }

  it('runs the job entry point detached, from the render folder, with only the job’s environment', async () => {
    const s = fakeSpawn('ok');
    const opened: string[] = [];
    const l = childProcessLauncher({
      renderDir: '/repo/services/render',
      logDir: '/tmp/motionpop-renders',
      nodePath: '/usr/bin/node',
      env: {
        PATH: '/bin',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
        GOOGLE_CLOUD_PROJECT: 'demo-motionpop',
        CLAUDE_API_KEY: 'sk-secret',
        APP_CHECK_DEBUG_TOKEN: 'secret',
      },
      spawn: s.spawn,
      openLog: (f) => (opened.push(f), 7),
    });
    expect(await l.launch(ID)).toEqual({ executionName: 'local-4242' });
    expect(s.calls).toHaveLength(1);
    const c = s.calls[0]!;
    expect(c.command).toBe('/usr/bin/node');
    expect(c.args).toEqual(['--import', 'tsx', 'src/job.ts']);
    expect(c.options).toMatchObject({ cwd: '/repo/services/render', detached: true });
    expect(c.options.stdio).toEqual(['ignore', 7, 7]);
    expect(c.options.env).toEqual({
      PATH: '/bin',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
      GOOGLE_CLOUD_PROJECT: 'demo-motionpop',
      RENDER_ID: ID,
    });
    expect(opened).toEqual([`/tmp/motionpop-renders/${ID}.log`]);
    expect(s.unrefs()).toBe(1);
  });

  it('a process that cannot start is a LaunchError', async () => {
    const s = fakeSpawn('error');
    const l = childProcessLauncher({
      renderDir: '/nope',
      logDir: '/tmp/x',
      env: {},
      spawn: s.spawn,
      openLog: () => 3,
    });
    await expect(l.launch(ID)).rejects.toThrow('could not start the job: spawn ENOENT');
    expect(s.unrefs()).toBe(0);
  });

  it('refuses a bad id before opening a log or spawning', async () => {
    const s = fakeSpawn('ok');
    const openLog = vi.fn(() => 3);
    const l = childProcessLauncher({
      renderDir: '/r',
      logDir: '/l',
      env: {},
      spawn: s.spawn,
      openLog,
    });
    await expect(l.launch('a b')).rejects.toBeInstanceOf(LaunchError);
    expect(openLog).not.toHaveBeenCalled();
    expect(s.calls).toHaveLength(0);
  });
});

describe('inProcessLauncher', () => {
  it('starts the run without waiting for it', async () => {
    let finish: () => void = () => undefined;
    const run = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const l = inProcessLauncher({ run });
    expect(await l.launch(ID)).toEqual({ executionName: 'local-in-process' });
    await Promise.resolve();
    expect(run).toHaveBeenCalledWith(ID);
    finish();
  });

  it('reports a run that throws through onError and still launched', async () => {
    const errors: unknown[] = [];
    const l = inProcessLauncher({
      run: async () => {
        throw new Error('boom');
      },
      onError: (id, e) => errors.push([id, String(e)]),
    });
    await l.launch(ID);
    await new Promise((r) => setTimeout(r, 5));
    expect(errors).toEqual([[ID, 'Error: boom']]);
  });
});

describe('launcherFor', () => {
  it('needs the project for cloud and a run function for offline', () => {
    expect(() => launcherFor('cloud', { env: {} })).toThrow(LaunchError);
    expect(() => launcherFor('offline', { env: {} })).toThrow('not wired');
    expect(
      launcherFor('cloud', { env: { GOOGLE_CLOUD_PROJECT: 'motionpop-48409' } }),
    ).toBeDefined();
    expect(launcherFor('offline', { env: {}, runOffline: async () => undefined })).toBeDefined();
    expect(launcherFor('emulator', { env: {} })).toBeDefined();
  });
});

describe('childProcessLauncher with a real process', () => {
  it('starts the real job entry point and leaves its output in the log file', async () => {
    const { mkdtemp, readFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join, resolve } = await import('node:path');
    const logDir = await mkdtemp(join(tmpdir(), 'mp-launch-'));
    const l = childProcessLauncher({
      renderDir: resolve(process.cwd(), '../../services/render'),
      logDir,
      // No Firebase variables: the job cannot build its deps, says so in the log and exits 1.
      env: { PATH: process.env['PATH'], HOME: process.env['HOME'] },
    });
    const r = await l.launch(ID);
    expect(r.executionName).toMatch(/^local-\d+$/);
    const file = join(logDir, `${ID}.log`);
    let text = '';
    // Starting tsx and the job takes seconds on a busy machine (all packages test at once).
    for (let i = 0; i < 600 && !text.includes('unrecorded'); i++) {
      await new Promise((done) => setTimeout(done, 100));
      text = await readFile(file, 'utf8').catch(() => '');
    }
    expect(text).toContain('unrecorded');
    expect(text).toContain(ID);
  }, 90_000);
});
