import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { LedgerError, renderIdFor, type StartExportResult } from '@motionpop/render/store';
import { bigNumberSlot, fixtureProject } from '@motionpop/motion/testing/project-fixture';
import {
  APP_CONFIG_DEFAULTS,
  RENDER_API_ERROR_STATUS,
  RenderApiErrorSchema,
  RenderDocSchema,
  renderPaths,
  type AppConfig,
  type RenderDoc,
  type RenderOptions,
} from '@motionpop/schemas';
import {
  MAX_BODY_BYTES,
  MAX_VOICE_BYTES,
  apiError,
  checkRender,
  createRender,
  createShareLink,
  downloadRender,
  type CreateDeps,
  type HandlerResult,
} from './handlers.server';

const UID = 'user-1';
const REQUEST_ID = '3b241101-e2bb-4255-8caf-4136c566a962';
const RENDER_ID = renderIdFor(UID, REQUEST_ID);
const PROJECT = fixtureProject({
  durationMs: 18_000,
  slots: [bigNumberSlot('a', 0, 700), bigNumberSlot('b', 1400, 2100)],
});
const VOICE = `users/${UID}/audio/${PROJECT.id}/voice-0123456789abcdef.wav`;
const OPTIONS: RenderOptions = {
  format: '16:9',
  resolution: '1080p',
  captions: false,
  music: false,
};

function body(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    requestId: REQUEST_ID,
    options: OPTIONS,
    expectedCost: 5,
    project: PROJECT,
    voicePath: VOICE,
    ...over,
  });
}

interface Fakes {
  deps: CreateDeps;
  calls: string[];
  config: AppConfig;
  start: StartExportResult;
  voice: { size: number; contentType: string | undefined } | null;
  logs: Record<string, unknown>[];
  snapshots: { path: string; json: string }[];
}

function fakes(over: Partial<Pick<Fakes, 'config' | 'start' | 'voice'>> = {}): Fakes {
  const f: Fakes = {
    calls: [],
    config: APP_CONFIG_DEFAULTS,
    start: { kind: 'created', renderId: RENDER_ID, costCredits: 5, balanceAfter: 15 },
    voice: { size: 1000, contentType: 'audio/wav' },
    logs: [],
    snapshots: [],
    ...over,
    deps: undefined as unknown as CreateDeps,
  };
  f.deps = {
    mode: 'emulator',
    config: async () => f.config,
    now: () => 1_700_000_000_000,
    voiceObject: async () => f.voice,
    isRenderable: () => true,
    sweepStalled: async () => void f.calls.push('sweep'),
    startExport: async () => (f.calls.push('start'), f.start),
    balanceOf: async () => 15,
    writeSnapshot: async (path, json) => {
      f.calls.push('snapshot');
      f.snapshots.push({ path, json });
    },
    launch: async () => (f.calls.push('launch'), { executionName: 'local-1' }),
    recordExecution: async () => void f.calls.push('record'),
    failRender: async () => void f.calls.push('fail'),
    log: (fields) => f.logs.push(fields),
  };
  return f;
}

const err = (r: HandlerResult) => RenderApiErrorSchema.parse(r.body);

describe('createRender: the happy path', () => {
  it('sweeps, charges, writes the snapshot, launches, records the execution and answers 201', async () => {
    const f = fakes();
    const r = await createRender(f.deps, UID, body());
    expect(r).toEqual({
      status: 201,
      body: { renderId: RENDER_ID, costCredits: 5, balanceAfter: 15 },
    });
    expect(f.calls).toEqual(['sweep', 'start', 'snapshot', 'launch', 'record']);
    // The snapshot goes to the render's own input path and is the validated project.
    expect(f.snapshots[0]?.path).toBe(renderPaths(UID, PROJECT.id, RENDER_ID).input);
    expect(JSON.parse(f.snapshots[0]!.json).id).toBe(PROJECT.id);
  });

  it('passes the right render to the transaction', async () => {
    const f = fakes();
    const spy = vi.spyOn(f.deps, 'startExport');
    await createRender(
      f.deps,
      UID,
      body({ options: { ...OPTIONS, format: '9:16', resolution: '720p' }, expectedCost: 3 }),
    );
    const [id, render, cost, , now] = spy.mock.calls[0]!;
    expect(id).toBe(RENDER_ID);
    expect(cost).toBe(3);
    expect(now).toBe(1_700_000_000_000);
    expect(render).toMatchObject({
      ownerId: UID,
      projectId: PROJECT.id,
      requestId: REQUEST_ID,
      format: '9:16',
      resolution: '720p',
      captions: false,
      music: false,
      durationMs: 18_000,
      slotCount: 2,
      mode: 'emulator',
      voicePath: VOICE,
    });
  });

  it('a repeated request answers 200 with the existing render and starts nothing', async () => {
    const doc = RenderDocSchema.parse({
      schemaVersion: 1,
      ownerId: UID,
      projectId: PROJECT.id,
      requestId: REQUEST_ID,
      title: 'x',
      format: '16:9',
      resolution: '1080p',
      captions: false,
      music: false,
      durationMs: 18000,
      slotCount: 2,
      status: 'rendering',
      progress: 30,
      costCredits: 5,
      mode: 'emulator',
      inputPath: 'a',
      voicePath: VOICE,
      createdAt: new Date(),
    });
    const f = fakes({ start: { kind: 'existing', renderId: RENDER_ID, doc } });
    const r = await createRender(f.deps, UID, body());
    expect(r).toEqual({
      status: 200,
      body: { renderId: RENDER_ID, costCredits: 5, balanceAfter: 15 },
    });
    expect(f.calls).toEqual(['sweep', 'start']);
  });
});

describe('createRender: every error of design §10', () => {
  async function expectError(
    code: keyof typeof RENDER_API_ERROR_STATUS,
    text: string,
    f = fakes(),
    uid = UID,
  ) {
    const r = await createRender(f.deps, uid, text);
    expect(r.status).toBe(RENDER_API_ERROR_STATUS[code]);
    expect(err(r).error).toBe(code);
    return { r, f };
  }

  it('invalid: not JSON, wrong shape, extra keys, music asked for (captions are accepted, spec 12a)', async () => {
    for (const text of [
      'not json',
      '{}',
      '[]',
      body({ extra: 1 }),
      body({ requestId: 'nope' }),
      body({ expectedCost: -1 }),
      body({ expectedCost: 1.5 }),
      body({ options: { ...OPTIONS, music: true } }),
      body({ options: { ...OPTIONS, resolution: '4k' } }),
      body({ project: { ...PROJECT, slots: 'x' } }),
    ]) {
      const { f } = await expectError('invalid', text);
      expect(f.calls, text.slice(0, 40)).toEqual([]);
    }
  });

  it('invalid: a voice path that is not this caller’s or this project’s', async () => {
    for (const voicePath of [
      `users/other/audio/${PROJECT.id}/voice-0123456789abcdef.wav`,
      `users/${UID}/audio/other-project/voice-0123456789abcdef.wav`,
      `users/${UID}/audio/${PROJECT.id}/voice-0123456789abcdef.exe`,
      `users/${UID}/audio/${PROJECT.id}/../x/voice-0123456789abcdef.wav`,
      `users/${UID}/media/${PROJECT.id}/voice-0123456789abcdef.wav`,
    ]) {
      const { f } = await expectError('invalid', body({ voicePath }));
      expect(f.calls).toEqual([]);
    }
  });

  it('invalid, not a 500: ids that fail the id regex', async () => {
    await expectError('invalid', body(), fakes(), 'bad/uid');
    await expectError('invalid', body({ project: { ...PROJECT, id: 'a/b' } }));
  });

  it('too-large: a body over 2 MB, before any parsing', async () => {
    const f = fakes();
    const r = await createRender(f.deps, UID, ' '.repeat(MAX_BODY_BYTES + 1));
    expect(err(r).error).toBe('too-large');
    expect(r.status).toBe(413);
    expect(f.calls).toEqual([]);
  });

  it('too-large: a voice over 50 MB', async () => {
    await expectError(
      'too-large',
      body(),
      fakes({ voice: { size: MAX_VOICE_BYTES + 1, contentType: 'audio/wav' } }),
    );
  });

  it('disabled: exports off or the kill switch, before anything is read', async () => {
    for (const config of [
      { ...APP_CONFIG_DEFAULTS, exportsEnabled: false },
      { ...APP_CONFIG_DEFAULTS, killSwitch: true },
    ]) {
      const { f } = await expectError('disabled', body(), fakes({ config }));
      expect(f.calls).toEqual([]);
    }
  });

  it('too-long and nothing-to-render', async () => {
    await expectError(
      'too-long',
      body(),
      fakes({ config: { ...APP_CONFIG_DEFAULTS, exportMaxMs: 17_999 } }),
    );
    const none = fakes();
    none.deps.isRenderable = () => false;
    const { f } = await expectError('nothing-to-render', body(), none);
    expect(f.calls).toEqual([]);
    // The format reaches the component check.
    const seen: string[] = [];
    const g = fakes();
    g.deps.isRenderable = (_s, fmt) => (seen.push(fmt), true);
    await createRender(g.deps, UID, body({ options: { ...OPTIONS, format: '1:1' } }));
    expect(new Set(seen)).toEqual(new Set(['1:1']));
  });

  it('cost-changed: carries the server cost and charges nothing', async () => {
    const { r, f } = await expectError('cost-changed', body({ expectedCost: 3 }));
    expect(err(r).cost).toBe(5);
    expect(f.calls).toEqual([]);
    // The table from config is honoured.
    const g = fakes({
      config: { ...APP_CONFIG_DEFAULTS, exportCredits: { '720p': 2, '1080p': 9 } },
    });
    expect(err((await createRender(g.deps, UID, body())) as HandlerResult).cost).toBe(9);
  });

  it('voice-missing: no object, empty, or not audio', async () => {
    for (const voice of [
      null,
      { size: 0, contentType: 'audio/wav' },
      { size: 10, contentType: 'video/mp4' },
      { size: 10, contentType: undefined },
    ]) {
      const { f } = await expectError('voice-missing', body(), fakes({ voice }));
      expect(f.calls).toEqual([]);
    }
  });

  it('insufficient-credits (402 with the balance), render-active (409 with the id), daily-limit (429), disabled (503)', async () => {
    const a = await expectError(
      'insufficient-credits',
      body(),
      fakes({ start: { kind: 'reject', reason: 'insufficient-credits', balance: 4 } }),
    );
    expect(err(a.r).balance).toBe(4);
    const b = await expectError(
      'render-active',
      body(),
      fakes({
        start: { kind: 'reject', reason: 'render-active', balance: 20, renderId: 'rActive' },
      }),
    );
    expect(err(b.r).renderId).toBe('rActive');
    await expectError(
      'daily-limit',
      body(),
      fakes({ start: { kind: 'reject', reason: 'daily-limit', balance: 20 } }),
    );
    await expectError(
      'disabled',
      body(),
      fakes({ start: { kind: 'reject', reason: 'disabled', balance: 20 } }),
    );
    // A rejection writes and launches nothing.
    expect(a.f.calls).toEqual(['sweep', 'start']);
  });

  it('start-failed (502): a snapshot or launch failure fails and refunds the render first', async () => {
    for (const broken of ['writeSnapshot', 'launch'] as const) {
      const f = fakes();
      f.deps[broken] = (async () => {
        throw new Error('storage said: secret detail');
      }) as never;
      const failSpy = vi.spyOn(f.deps, 'failRender');
      const r = await createRender(f.deps, UID, body());
      expect(r.status).toBe(502);
      expect(err(r).error).toBe('start-failed');
      expect(failSpy).toHaveBeenCalledTimes(1);
      expect(failSpy.mock.calls[0]?.[0]).toBe(RENDER_ID);
      expect(failSpy.mock.calls[0]?.[1]).toBe('start-failed');
      // The job never starts for a render with no snapshot.
      if (broken === 'writeSnapshot') expect(f.calls).not.toContain('launch');
      // The answer carries nothing from the error.
      expect(JSON.stringify(r.body)).not.toContain('secret');
    }
  });

  it('start-failed still answers when recording the failure fails too, and logs both', async () => {
    const f = fakes();
    f.deps.launch = async () => {
      throw new Error('boom');
    };
    f.deps.failRender = async () => {
      throw new Error('db down');
    };
    const r = await createRender(f.deps, UID, body());
    expect(r.status).toBe(502);
    expect(f.logs.map((l) => l['event'])).toEqual(['start-failed', 'start-failed-not-recorded']);
  });

  it('a failure to store the execution name does not fail the render', async () => {
    const f = fakes();
    f.deps.recordExecution = async () => {
      throw new Error('write failed');
    };
    const r = await createRender(f.deps, UID, body());
    expect(r.status).toBe(201);
    expect(f.logs.map((l) => l['event'])).toEqual(['record-execution-failed']);
  });

  it('a missing user doc (LedgerError) reaches the route, which answers 409', async () => {
    const f = fakes();
    f.deps.startExport = async () => {
      throw new LedgerError('not-bootstrapped', 'no user doc');
    };
    await expect(createRender(f.deps, UID, body())).rejects.toBeInstanceOf(LedgerError);
  });

  it('every API error code has a status, a body that parses and no extra keys', () => {
    for (const code of Object.keys(
      RENDER_API_ERROR_STATUS,
    ) as (keyof typeof RENDER_API_ERROR_STATUS)[]) {
      const r = apiError(code, { cost: 3, renderId: 'r', balance: 2 });
      expect(r.status).toBe(RENDER_API_ERROR_STATUS[code]);
      expect(RenderApiErrorSchema.parse(r.body).error).toBe(code);
    }
  });
});

describe('P5: never more than shown', () => {
  it('the charge equals expectedCost or the request is refused cost-changed with nothing charged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 20 }),
        fc.constantFrom('720p' as const, '1080p' as const),
        fc.integer({ min: 1000, max: 180_000 }),
        async (expectedCost, resolution, durationMs) => {
          const project = fixtureProject({ durationMs, slots: [bigNumberSlot('a', 0, 700)] });
          const f = fakes();
          const spy = vi.spyOn(f.deps, 'startExport');
          const r = await createRender(
            f.deps,
            UID,
            JSON.stringify({
              requestId: REQUEST_ID,
              options: { ...OPTIONS, resolution },
              expectedCost,
              project,
              voicePath: `users/${UID}/audio/${project.id}/voice-0123456789abcdef.wav`,
            }),
          );
          if (r.status === 201 || r.status === 200) {
            expect(spy.mock.calls[0]?.[2]).toBe(expectedCost);
          } else {
            expect(err(r).error).toBe('cost-changed');
            expect(spy).not.toHaveBeenCalled();
            expect(err(r).cost).not.toBe(expectedCost);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------------------------

function doc(over: Partial<RenderDoc> = {}): RenderDoc {
  return RenderDocSchema.parse({
    schemaVersion: 1,
    ownerId: UID,
    projectId: PROJECT.id,
    requestId: REQUEST_ID,
    title: 'Launch film',
    format: '16:9',
    resolution: '1080p',
    captions: false,
    music: false,
    durationMs: 18_000,
    slotCount: 2,
    status: 'done',
    progress: 100,
    costCredits: 5,
    mode: 'cloud',
    inputPath: 'in',
    voicePath: VOICE,
    outputPath: 'users/user-1/projects/p/renders/r/video.mp4',
    thumbPath: 'users/user-1/projects/p/renders/r/thumb.jpg',
    createdAt: new Date(),
    ...over,
  });
}

describe('checkRender', () => {
  const make = (d: RenderDoc | null, after: RenderDoc | null = d) => ({
    getRender: async () => d,
    now: () => 1000,
    sweep: vi.fn(async () => after),
  });

  it('sweeps and answers the public state of the owner’s render', async () => {
    const stalled = doc({ status: 'error', progress: 40, error: 'stalled', outputPath: undefined });
    const deps = make(doc({ status: 'queued', progress: 0, outputPath: undefined }), stalled);
    const r = await checkRender(deps, UID, 'r1');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ renderId: 'r1', status: 'error', error: 'stalled' });
    expect(JSON.stringify(r.body)).not.toContain('users/');
    expect(deps.sweep).toHaveBeenCalledWith('r1', 1000);
  });

  it('404 for a missing render, someone else’s render and a bad id, without sweeping', async () => {
    for (const [d, id] of [
      [null, 'r1'],
      [doc({ ownerId: 'other' }), 'r1'],
      [doc(), '../x'],
    ] as const) {
      const deps = make(d);
      expect((await checkRender(deps, UID, id)).status).toBe(404);
      expect(deps.sweep).not.toHaveBeenCalled();
    }
  });
});

describe('downloadRender', () => {
  const make = (d: RenderDoc | null, mode: 'cloud' | 'emulator' = 'cloud') => ({
    mode,
    getRender: async () => d,
    disposition: (t: string) => `attachment; filename="${t}.mp4"`,
    signedUrl: vi.fn(
      async (_p: string, _d: string, ttl: number) => `https://signed.example/x?ttl=${ttl}`,
    ),
  });

  it('cloud: a signed URL valid 10 minutes with the title as the filename', async () => {
    const deps = make(doc());
    const r = await downloadRender(deps, UID, 'r1', { stream: false });
    expect(r).toEqual({ status: 200, body: { url: 'https://signed.example/x?ttl=600000' } });
    expect(deps.signedUrl).toHaveBeenCalledWith(
      'users/user-1/projects/p/renders/r/video.mp4',
      'attachment; filename="Launch film.mp4"',
      600_000,
    );
  });

  it('emulator: a route to stream from, then the stream itself', async () => {
    const deps = make(doc(), 'emulator');
    expect(await downloadRender(deps, UID, 'r1', { stream: false })).toEqual({
      status: 200,
      body: { url: '/api/renders/r1/download?stream=1' },
    });
    expect(await downloadRender(deps, UID, 'r1', { stream: true })).toEqual({
      status: 200,
      stream: {
        path: 'users/user-1/projects/p/renders/r/video.mp4',
        disposition: 'attachment; filename="Launch film.mp4"',
      },
    });
    expect(deps.signedUrl).not.toHaveBeenCalled();
  });

  it('409 until the render is done, 404 for someone else’s or a missing one', async () => {
    const running = make(doc({ status: 'rendering', progress: 50, outputPath: undefined }));
    expect((await downloadRender(running, UID, 'r1', { stream: false })).status).toBe(409);
    expect(
      (await downloadRender(make(doc({ ownerId: 'x' })), UID, 'r1', { stream: false })).status,
    ).toBe(404);
    expect((await downloadRender(make(null), UID, 'r1', { stream: false })).status).toBe(404);
    expect((await downloadRender(make(doc()), UID, '../r', { stream: false })).status).toBe(404);
    expect(running.signedUrl).not.toHaveBeenCalled();
  });
});

describe('createShareLink', () => {
  const make = (
    result: Awaited<ReturnType<Parameters<typeof createShareLink>[0]['createShare']>>,
  ) => ({
    createShare: vi.fn(async () => result),
  });

  it('201 for a new share and 200 for a repeat, with the link on the caller’s origin', async () => {
    const created = await createShareLink(
      make({ kind: 'ok', shareId: 'abc', created: true }),
      UID,
      'r1',
      'https://motionpop.app',
    );
    expect(created).toEqual({
      status: 201,
      body: { shareId: 'abc', url: 'https://motionpop.app/share/abc' },
    });
    const again = await createShareLink(
      make({ kind: 'ok', shareId: 'abc', created: false }),
      UID,
      'r1',
      'https://motionpop.app',
    );
    expect(again.status).toBe(200);
  });

  it('404 when not found (or not the caller’s), 409 when not done, 404 for a bad id without a call', async () => {
    expect((await createShareLink(make({ kind: 'not-found' }), UID, 'r1', 'o')).status).toBe(404);
    expect((await createShareLink(make({ kind: 'not-done' }), UID, 'r1', 'o')).status).toBe(409);
    const deps = make({ kind: 'not-found' });
    expect((await createShareLink(deps, UID, 'a/b', 'o')).status).toBe(404);
    expect(deps.createShare).not.toHaveBeenCalled();
  });
});
