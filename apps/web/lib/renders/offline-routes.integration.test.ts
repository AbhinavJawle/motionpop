// The offline routes end to end, in this process (spec 08 task 12, R7.3): the route handlers are
// called directly with real `Request`s, and the render behind them is real (Chrome, the producer
// and ffmpeg over the in-memory store and a temp folder). Skipped when a tool is missing; in CI
// (`CI` set) a missing tool is a failure.
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bigNumberSlot, fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { missingRenderTools } from '@motionpop/render/offline';
import { GET as getFile } from '@/app/api/local-renders/[id]/file/route';
import { GET as getStatus } from '@/app/api/local-renders/[id]/route';
import { POST as postLocal } from '@/app/api/local-renders/route';
import { POST as postRenders } from '@/app/api/renders/route';

const missing = await missingRenderTools();
const mustRun = Boolean(process.env['CI']);
if (mustRun && missing.length > 0) throw new Error(`these tests need ${missing.join(', ')} in CI`);

const TIMEOUT = 240_000;
const project = (() => {
  const p = fixtureProject({ durationMs: 2000, slots: [bigNumberSlot('a', 0, 700)] });
  return {
    ...p,
    transcript: { ...p.transcript, words: p.transcript.words.slice(0, 3) },
    voiceover: { src: 'synth:demo', durationMs: 2000 },
  };
})();

function requestJson(extraOptions: Record<string, unknown> = {}): string {
  return JSON.stringify({
    requestId: crypto.randomUUID(),
    options: {
      format: '9:16',
      resolution: '720p',
      captions: false,
      music: false,
      ...extraOptions,
    },
    expectedCost: 0,
    project,
  });
}

describe.skipIf(!mustRun && missing.length > 0)('offline routes with a real render', () => {
  let wav: Buffer;

  beforeAll(async () => {
    vi.stubEnv('MP_RENDER_MODE', 'offline');
    // Any emulator host makes the server config use its defaults instead of Remote Config.
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
    const file = join(await mkdtemp(join(tmpdir(), 'mp-offline-it-')), 'voice.wav');
    const made = spawnSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      file,
    ]);
    if (made.status !== 0) throw new Error('could not make the voice');
    wav = await readFile(file);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  const form = (request: string, voice: Buffer | null = wav): FormData => {
    const f = new FormData();
    f.set('request', request);
    if (voice)
      f.set('voice', new File([new Uint8Array(voice)], 'voice.wav', { type: 'audio/wav' }));
    return f;
  };
  const post = (f: FormData) =>
    postLocal(new Request('http://localhost/api/local-renders', { method: 'POST', body: f }));
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  async function untilFinal(id: string) {
    for (let i = 0; i < 1200; i++) {
      const r = await getStatus(new Request('http://localhost/x'), ctx(id));
      const s = (await r.json()) as { status: string; progress: number; error?: string };
      if (s.status === 'done' || s.status === 'error') return s;
      await new Promise((done) => setTimeout(done, 200));
    }
    throw new Error('the render did not finish');
  }

  it(
    'renders a project: 201, polling to done, then the MP4 with a download name',
    async () => {
      const res = await post(form(requestJson()));
      expect(res.status).toBe(201);
      const created = (await res.json()) as { renderId: string; costCredits: number };
      expect(created.costCredits).toBe(0);
      const final = await untilFinal(created.renderId);
      expect(final).toMatchObject({ status: 'done', progress: 100 });

      const file = await getFile(new Request('http://localhost/x'), ctx(created.renderId));
      expect(file.status).toBe(200);
      expect(file.headers.get('content-type')).toBe('video/mp4');
      expect(file.headers.get('accept-ranges')).toBe('bytes');
      expect(file.headers.get('content-disposition')).toMatch(/^attachment; filename="/);
      const bytes = Buffer.from(await file.arrayBuffer());
      expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
      expect(bytes.length).toBeGreaterThan(10_000);

      // Safari/Chrome inline <video> scrubbing uses byte-range requests (206 Partial Content).
      const partial = await getFile(
        new Request('http://localhost/x', { headers: { range: 'bytes=0-15' } }),
        ctx(created.renderId),
      );
      expect(partial.status).toBe(206);
      expect(partial.headers.get('content-range')).toBe(`bytes 0-15/${bytes.length}`);
      expect(Buffer.from(await partial.arrayBuffer())).toEqual(bytes.subarray(0, 16));

      const oob = await getFile(
        new Request('http://localhost/x', { headers: { range: `bytes=${bytes.length}-` } }),
        ctx(created.renderId),
      );
      expect(oob.status).toBe(416);
    },
    TIMEOUT,
  );

  it(
    'renders a transparent alpha WebM end to end: video/webm, .webm filename, and VP9 alpha stream (spec 47)',
    async () => {
      const res = await post(form(requestJson({ transparent: true })));
      expect(res.status).toBe(201);
      const created = (await res.json()) as { renderId: string };
      const final = await untilFinal(created.renderId);
      expect(final).toMatchObject({ status: 'done', progress: 100, transparent: true });

      const file = await getFile(new Request('http://localhost/x'), ctx(created.renderId));
      expect(file.status).toBe(200);
      expect(file.headers.get('content-type')).toBe('video/webm');
      expect(file.headers.get('accept-ranges')).toBe('bytes');
      expect(file.headers.get('content-disposition')).toMatch(/^attachment; filename=".*\.webm"/);
      const bytes = Buffer.from(await file.arrayBuffer());
      // WebM / EBML magic header: 0x1A 0x45 0xDF 0xA3
      expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
      expect(bytes.length).toBeGreaterThan(2_000);

      // Verify the rendered WebM actually carries a VP9 stream with alpha_mode=1 (yuva420p).
      const probePath = join(await mkdtemp(join(tmpdir(), 'mp-webm-probe-')), 'out.webm');
      await writeFile(probePath, bytes);
      const probed = spawnSync('ffprobe', [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_streams',
        probePath,
      ]);
      expect(probed.status).toBe(0);
      const parsed = JSON.parse(probed.stdout.toString('utf8')) as {
        streams: Array<{ codec_type: string; codec_name?: string; tags?: Record<string, string> }>;
      };
      const videoStream = parsed.streams.find((s) => s.codec_type === 'video');
      expect(videoStream?.codec_name).toBe('vp9');
      expect(videoStream?.tags?.['alpha_mode'] ?? videoStream?.tags?.['ALPHA_MODE']).toBe('1');

      // Decode frame 0 corner pixel with libvpx-vp9 to verify true pixel-level transparency (alpha === 0).
      const rgba = spawnSync('ffmpeg', [
        '-loglevel',
        'error',
        '-c:v',
        'libvpx-vp9',
        '-i',
        probePath,
        '-frames:v',
        '1',
        '-vf',
        'format=rgba,crop=1:1:0:0',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        '-',
      ]);
      expect(rgba.status).toBe(0);
      expect(rgba.stdout.length).toBe(4);
      expect(rgba.stdout[3]).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'an injected producer failure ends in error with no file to download',
    async () => {
      vi.stubEnv('MP_RENDER_FAKE_FAIL', 'producer');
      try {
        const res = await post(form(requestJson()));
        expect(res.status).toBe(201);
        const { renderId } = (await res.json()) as { renderId: string };
        expect(await untilFinal(renderId)).toMatchObject({
          status: 'error',
          error: 'render-failed',
        });
        expect((await getFile(new Request('http://localhost/x'), ctx(renderId))).status).toBe(404);
      } finally {
        vi.stubEnv('MP_RENDER_FAKE_FAIL', '');
      }
    },
    TIMEOUT,
  );

  it('answers the cloud route’s errors for bad requests, and writes nothing', async () => {
    expect((await post(form('not json'))).status).toBe(400);
    expect((await post(form(requestJson(), null))).status).toBe(422);
    const noRequest = new FormData();
    noRequest.set('voice', new File([new Uint8Array(wav)], 'v.wav', { type: 'audio/wav' }));
    expect((await post(noRequest)).status).toBe(400);
    expect((await getStatus(new Request('http://localhost/x'), ctx('unknown'))).status).toBe(404);
  });

  it('the cloud route answers 404 in offline mode', async () => {
    const r = await postRenders(
      new Request('http://localhost/api/renders', { method: 'POST', body: '{}' }),
    );
    expect(r.status).toBe(404);
  });

  it('the development-only routes answer 404 in every other mode, and in production', async () => {
    for (const env of [
      { MP_RENDER_MODE: 'emulator' },
      { MP_RENDER_MODE: 'cloud' },
      { MP_RENDER_MODE: 'offline', NODE_ENV: 'production' },
    ]) {
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      try {
        expect((await post(form(requestJson()))).status, JSON.stringify(env)).toBe(404);
        expect((await getStatus(new Request('http://localhost/x'), ctx('abc'))).status).toBe(404);
        expect((await getFile(new Request('http://localhost/x'), ctx('abc'))).status).toBe(404);
      } finally {
        vi.stubEnv('MP_RENDER_MODE', 'offline');
        vi.stubEnv('NODE_ENV', 'test');
      }
    }
  });
});
