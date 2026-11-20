import { RenderDocSchema } from '@motionpop/schemas';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareNotFound, ShareVideo } from '@/components/share/share-view';

const state = vi.hoisted(() => ({
  mode: 'cloud' as 'cloud' | 'emulator' | 'offline',
  found: true,
  throws: false,
}));

vi.mock('@/lib/renders/mode.server', () => ({ renderMode: () => state.mode }));
vi.mock('@/lib/renders/share-deps.server', () => ({
  sharePageDeps: () => ({
    load: async () => {
      if (state.throws) throw new Error('firestore down');
      if (!state.found) return null;
      return {
        shareId: 'A'.repeat(22),
        renderId: 'r1',
        render: RenderDocSchema.parse({
          schemaVersion: 1,
          ownerId: 'u1',
          projectId: 'p1',
          requestId: '3f2b1a52-0c1d-4d6e-9f6a-1b2c3d4e5f60',
          title: 'Shared',
          format: '16:9',
          resolution: '720p',
          captions: false,
          music: false,
          durationMs: 5000,
          slotCount: 1,
          status: 'done',
          progress: 100,
          costCredits: 3,
          mode: 'cloud',
          inputPath: 'a',
          voicePath: 'b',
          outputPath: 'users/u1/projects/p1/renders/r1/video.mp4',
          createdAt: new Date(0),
        }),
      };
    },
    videoUrl: async () => 'https://signed.example/v.mp4',
  }),
}));

import SharePage, { metadata } from './page';

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.mode = 'cloud';
  state.found = true;
  state.throws = false;
});

describe('/share/[id] page (R5.4)', () => {
  it('is never indexed', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('shows the video with the URL from the server read', async () => {
    const el = await SharePage(params('A'.repeat(22)));
    expect(el.type).toBe(ShareVideo);
    expect(el.props).toMatchObject({
      title: 'Shared',
      videoUrl: 'https://signed.example/v.mp4',
      format: '16:9',
    });
  });

  it('shows the not-found state for a missing or revoked share', async () => {
    state.found = false;
    expect((await SharePage(params('B'.repeat(22)))).type).toBe(ShareNotFound);
  });

  it('shows the not-found state when the read fails, and in offline mode', async () => {
    state.throws = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await SharePage(params('A'.repeat(22)))).type).toBe(ShareNotFound);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
    state.throws = false;
    state.mode = 'offline';
    expect((await SharePage(params('A'.repeat(22)))).type).toBe(ShareNotFound);
  });
});
