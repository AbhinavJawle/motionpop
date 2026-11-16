import { describe, expect, it, vi } from 'vitest';
import { bigNumberSlot, fixtureProject } from '@motionpop/motion/testing/project-fixture';
import {
  APP_CONFIG_DEFAULTS,
  RenderApiErrorSchema,
  RenderDocSchema,
  voicePathFor,
  type RenderDoc,
} from '@motionpop/schemas';
import { MAX_BODY_BYTES, MAX_VOICE_BYTES } from './handlers.server';
import {
  LOCAL_USER,
  createLocalRender,
  localFile,
  localStatus,
  type LocalDeps,
} from './local-handlers.server';

const PROJECT = fixtureProject({
  durationMs: 4600,
  slots: [bigNumberSlot('a', 0, 700)],
});
const REQUEST = {
  requestId: '3b241101-e2bb-4255-8caf-4136c566a962',
  options: { format: '9:16', resolution: '720p', captions: false, music: false },
  expectedCost: 0,
  project: PROJECT,
};
const text = (over: Record<string, unknown> = {}) => JSON.stringify({ ...REQUEST, ...over });
const voice = (type = 'audio/wav', size = 1000) => ({
  type,
  size,
  bytes: Buffer.alloc(Math.min(size, 1000), 1),
});

function make(over: Partial<LocalDeps> = {}) {
  const docs = new Map<string, RenderDoc>();
  const blobs = new Map<string, Buffer | string>();
  const logs: Record<string, unknown>[] = [];
  const deps: LocalDeps = {
    config: async () => APP_CONFIG_DEFAULTS,
    now: () => new Date(0),
    isRenderable: () => true,
    putBlob: async (p, d) => void blobs.set(p, d),
    createDoc: (id, d) => void docs.set(id, d),
    getRender: async (id) => docs.get(id) ?? null,
    launch: vi.fn(async () => ({})),
    newRenderId: () => 'lRender0000000000000001',
    log: (f) => logs.push(f),
    ...over,
  };
  return { deps, docs, blobs, logs };
}

describe('createLocalRender', () => {
  it('stores the voice and the snapshot, queues a free render and launches it', async () => {
    const m = make();
    const r = await createLocalRender(m.deps, text(), voice());
    expect(r).toEqual({
      status: 201,
      body: { renderId: 'lRender0000000000000001', costCredits: 0, balanceAfter: 0 },
    });
    const doc = m.docs.get('lRender0000000000000001')!;
    expect(RenderDocSchema.parse(doc)).toMatchObject({
      status: 'queued',
      progress: 0,
      costCredits: 0,
      mode: 'offline',
      ownerId: LOCAL_USER,
      slotCount: 1,
      format: '9:16',
      resolution: '720p',
    });
    expect(voicePathFor(LOCAL_USER, PROJECT.id).test(doc.voicePath)).toBe(true);
    expect([...m.blobs.keys()].sort()).toEqual([doc.inputPath, doc.voicePath].sort());
    expect(JSON.parse(m.blobs.get(doc.inputPath) as string).id).toBe(PROJECT.id);
    expect(m.deps.launch).toHaveBeenCalledWith('lRender0000000000000001');
  });

  it('maps the browser’s MIME types to the extensions the job accepts', async () => {
    for (const [type, ext] of [
      ['audio/wav', 'wav'],
      ['audio/x-wav', 'wav'],
      ['audio/mpeg', 'mp3'],
      ['audio/mp4', 'm4a'],
      ['audio/webm;codecs=opus', 'webm'],
      ['audio/ogg', 'ogg'],
    ] as const) {
      const m = make();
      await createLocalRender(m.deps, text(), voice(type));
      expect(m.docs.get('lRender0000000000000001')?.voicePath, type).toMatch(
        new RegExp(`\\.${ext}$`),
      );
    }
  });

  const code = (r: { body: unknown }) => RenderApiErrorSchema.parse(r.body).error;

  it('answers the same errors as the cloud route and writes nothing', async () => {
    const cases: [string, () => Promise<{ status: number; body: unknown }>, string][] = [
      ['not json', () => createLocalRender(make().deps, 'nope', voice()), 'invalid'],
      ['bad shape', () => createLocalRender(make().deps, '{}', voice()), 'invalid'],
      [
        'a voice path in the body',
        () => createLocalRender(make().deps, text({ voicePath: 'x' }), voice()),
        'invalid',
      ],
      ['no voice', () => createLocalRender(make().deps, text(), null), 'voice-missing'],
      [
        'an empty voice',
        () => createLocalRender(make().deps, text(), voice('audio/wav', 0)),
        'voice-missing',
      ],
      [
        'a non-audio type',
        () => createLocalRender(make().deps, text(), voice('video/mp4')),
        'voice-missing',
      ],
      [
        'a voice over 50 MB',
        () =>
          createLocalRender(make().deps, text(), {
            type: 'audio/wav',
            size: MAX_VOICE_BYTES + 1,
            bytes: Buffer.alloc(10),
          }),
        'too-large',
      ],
      [
        'a body over 2 MB',
        () => createLocalRender(make().deps, ' '.repeat(MAX_BODY_BYTES + 1), voice()),
        'too-large',
      ],
      [
        'nothing to render',
        () => createLocalRender(make({ isRenderable: () => false }).deps, text(), voice()),
        'nothing-to-render',
      ],
      [
        'too long',
        () =>
          createLocalRender(
            make({ config: async () => ({ ...APP_CONFIG_DEFAULTS, exportMaxMs: 1000 }) }).deps,
            text(),
            voice(),
          ),
        'too-long',
      ],
    ];
    for (const [name, run, expected] of cases) {
      const r = await run();
      expect(code(r), name).toBe(expected);
    }
    const m = make();
    await createLocalRender(m.deps, text(), null);
    expect(m.blobs.size + m.docs.size).toBe(0);
  });

  it('start-failed when the launch throws, with the cause only in the log', async () => {
    const m = make({
      launch: async () => {
        throw new Error('chrome missing');
      },
    });
    const r = await createLocalRender(m.deps, text(), voice());
    expect(r.status).toBe(502);
    expect(code(r)).toBe('start-failed');
    expect(JSON.stringify(r.body)).not.toContain('chrome');
    expect(m.logs[0]?.['event']).toBe('offline-start-failed');
  });
});

describe('localStatus and localFile', () => {
  it('answers the public state, 404 for unknown and unsafe ids', async () => {
    const m = make();
    await createLocalRender(m.deps, text(), voice());
    const ok = await localStatus(m.deps, 'lRender0000000000000001');
    expect(ok).toMatchObject({ status: 200, body: { status: 'queued', progress: 0 } });
    expect(JSON.stringify(ok.body)).not.toContain('users/');
    expect((await localStatus(m.deps, 'nope')).status).toBe(404);
    expect((await localStatus(m.deps, '../x')).status).toBe(404);
  });

  it('serves a file only for a finished render', async () => {
    const m = make();
    await createLocalRender(m.deps, text(), voice());
    expect(await localFile(m.deps, 'lRender0000000000000001')).toBeNull();
    const d = m.docs.get('lRender0000000000000001')!;
    m.docs.set('lRender0000000000000001', {
      ...d,
      status: 'done',
      progress: 100,
      outputPath: 'users/local-user/x/video.mp4',
    });
    expect((await localFile(m.deps, 'lRender0000000000000001'))?.outputPath).toBe(
      'users/local-user/x/video.mp4',
    );
    expect(await localFile(m.deps, '../x')).toBeNull();
  });
});
