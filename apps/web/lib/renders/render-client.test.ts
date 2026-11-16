// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { offlineRenderClient, parseStartResponse, toView } from './render-client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('parseStartResponse', () => {
  it('reads a created render (201) and a replay (200)', async () => {
    const body = { renderId: 'r1', costCredits: 5, balanceAfter: 115 };
    expect(await parseStartResponse(json(201, body))).toEqual({ ok: true, replay: false, ...body });
    expect(await parseStartResponse(json(200, body))).toMatchObject({ ok: true, replay: true });
  });
  it('reads every API error with its details', async () => {
    const r = await parseStartResponse(json(409, { error: 'render-active', renderId: 'r9' }));
    expect(r).toMatchObject({ ok: false, error: 'render-active', detail: { renderId: 'r9' } });
    const c = await parseStartResponse(json(409, { error: 'cost-changed', cost: 3 }));
    expect(c).toMatchObject({ ok: false, error: 'cost-changed', detail: { cost: 3 } });
    const b = await parseStartResponse(json(402, { error: 'insufficient-credits', balance: 2 }));
    expect(b).toMatchObject({ ok: false, error: 'insufficient-credits' });
  });
  it('never throws on junk', async () => {
    expect(await parseStartResponse(new Response('<html>', { status: 500 }))).toEqual({
      ok: false,
      error: 'start-failed',
    });
    expect(await parseStartResponse(json(201, { nope: 1 }))).toEqual({
      ok: false,
      error: 'start-failed',
    });
    expect(await parseStartResponse(new Response('', { status: 401 }))).toEqual({
      ok: false,
      error: 'unauthorized',
    });
  });
});

describe('toView', () => {
  const doc = {
    status: 'rendering',
    progress: 40,
    costCredits: 5,
    title: 'Hi',
    format: '9:16',
    resolution: '720p',
    durationMs: 18_000,
    ownerId: 'someone',
    outputPath: 'users/x/y',
    thumbPath: 'users/x/thumb.jpg',
  };
  it('keeps only the public fields and the thumbnail path', () => {
    const v = toView('r1', doc);
    expect(v).toEqual({
      renderId: 'r1',
      status: 'rendering',
      progress: 40,
      costCredits: 5,
      title: 'Hi',
      format: '9:16',
      resolution: '720p',
      durationMs: 18_000,
      thumbPath: 'users/x/thumb.jpg',
    });
  });
  it('ignores an unknown error code and rejects junk', () => {
    expect(toView('r1', { ...doc, status: 'error', error: 'bogus' })).toMatchObject({
      status: 'error',
    });
    expect(toView('r1', { ...doc, status: 'error', error: 'bogus' })?.error).toBeUndefined();
    expect(toView('r1', { ...doc, progress: 'x' })).toBeNull();
    expect(toView('r1', null)).toBeNull();
    expect(toView('r1', 'x')).toBeNull();
  });
});

describe('offline client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('polls until the render is done, then stops', async () => {
    vi.useFakeTimers();
    const answers = [
      { status: 'queued', progress: 0 },
      { status: 'rendering', progress: 50 },
      { status: 'done', progress: 100 },
    ];
    let n = 0;
    const fetchMock = vi.fn(async () =>
      json(200, {
        ...answers[Math.min(n++, 2)],
        costCredits: 0,
        title: 'T',
        format: '16:9',
        resolution: '1080p',
        durationMs: 1000,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    offlineRenderClient().watch('r1', (v) => seen.push(v.status));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(seen).toEqual(['queued', 'rendering', 'done']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('stop() ends the polling', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => json(200, { status: 'queued' }));
    vi.stubGlobal('fetch', fetchMock);
    const stop = offlineRenderClient().watch('r1', () => {});
    await vi.advanceTimersByTimeAsync(10);
    stop();
    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
    vi.useRealTimers();
  });

  it('start posts multipart and reports a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      }),
    );
    const r = await offlineRenderClient().start({
      requestId: '3f2b1a52-0c1d-4d6e-9f6a-1b2c3d4e5f60',
      options: { format: '16:9', resolution: '1080p', captions: false, music: false },
      expectedCost: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the body is never inspected here
      project: {} as any,
      voice: new Blob(['x'], { type: 'audio/wav' }),
    });
    expect(r).toEqual({ ok: false, error: 'network' });
  });

  it('offline mode has no share link and points the download at the local route', async () => {
    const c = offlineRenderClient();
    expect(await c.share('r1')).toBeNull();
    expect(await c.downloadUrl('r1')).toBe('/api/local-renders/r1/file');
  });
});
