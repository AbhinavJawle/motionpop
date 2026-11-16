import { RenderDocSchema, type RenderDoc } from '@motionpop/schemas';
import { describe, expect, it, vi } from 'vitest';
import { SHARE_URL_TTL_MS, loadShareView, type SharePageDeps } from './share-page.server';

const doc = (over: Partial<RenderDoc> = {}): RenderDoc =>
  RenderDocSchema.parse({
    schemaVersion: 1,
    ownerId: 'u1',
    projectId: 'p1',
    requestId: '3f2b1a52-0c1d-4d6e-9f6a-1b2c3d4e5f60',
    title: 'My video',
    format: '9:16',
    resolution: '1080p',
    captions: false,
    music: false,
    durationMs: 18_000,
    slotCount: 2,
    status: 'done',
    progress: 100,
    costCredits: 5,
    mode: 'cloud',
    inputPath: 'users/u1/projects/p1/renders/r1/input/project.json',
    voicePath: 'users/u1/audio/p1/voice-0123456789abcdef.wav',
    outputPath: 'users/u1/projects/p1/renders/r1/video.mp4',
    createdAt: new Date(0),
    ...over,
  });

const SHARE = 'A'.repeat(22);

function deps(loaded: { render: RenderDoc } | null): SharePageDeps & {
  videoUrl: ReturnType<typeof vi.fn>;
} {
  return {
    load: async () => (loaded ? { shareId: SHARE, renderId: 'r1', render: loaded.render } : null),
    videoUrl: vi.fn(async (_s: string, path: string) => `https://signed.example/${path}?sig=abc`),
  };
}

describe('loadShareView (R5.4)', () => {
  it('returns the title, length, format and a signed URL from the server read', async () => {
    const d = deps({ render: doc() });
    const view = await loadShareView(d, SHARE);
    expect(view).toEqual({
      kind: 'found',
      title: 'My video',
      durationMs: 18_000,
      format: '9:16',
      resolution: '1080p',
      videoUrl: 'https://signed.example/users/u1/projects/p1/renders/r1/video.mp4?sig=abc',
    });
    expect(d.videoUrl).toHaveBeenCalledWith(
      SHARE,
      'users/u1/projects/p1/renders/r1/video.mp4',
      SHARE_URL_TTL_MS,
    );
  });

  it('the URL lives one hour', () => {
    expect(SHARE_URL_TTL_MS).toBe(3_600_000);
  });

  it('a missing or revoked share (the read returns null) is not found, and nothing is signed', async () => {
    const d = deps(null);
    expect(await loadShareView(d, SHARE)).toEqual({ kind: 'not-found' });
    expect(d.videoUrl).not.toHaveBeenCalled();
  });

  it('a render without a video is not found', async () => {
    // A done doc always has a path (the schema says so); the page still defends against one without.
    const d = deps({ render: { ...doc(), outputPath: undefined } });
    expect(await loadShareView(d, SHARE)).toEqual({ kind: 'not-found' });
    expect(d.videoUrl).not.toHaveBeenCalled();
  });

  it('never exposes the owner, the paths or the credits', async () => {
    const view = await loadShareView(deps({ render: doc() }), SHARE);
    const text = JSON.stringify(view);
    expect(text).not.toContain('u1/audio');
    expect(text).not.toContain('"ownerId"');
    expect(text).not.toContain('costCredits');
    expect(text).not.toContain('inputPath');
  });
});
