// @vitest-environment happy-dom
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioElsewhereError } from '@/lib/audio/hybrid-audio-store';
import { editorStore } from '@/lib/stores/editor';

const mocks = vi.hoisted(() => ({
  get: vi.fn<(ref: string) => Promise<Blob | null>>(),
  put: vi.fn<(blob: Blob, place?: { projectId: string; kind: string }) => Promise<string>>(),
}));

vi.mock('@/lib/audio/app-audio-store', () => ({
  appAudioStore: () => ({
    get: mocks.get,
    put: mocks.put,
    syncs: () => true,
  }),
}));

vi.mock('@motionpop/motion/reel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@motionpop/motion/reel')>();
  return {
    ...actual,
    mountReel: () => ({
      ready: Promise.resolve(),
      seek: () => {},
      destroy: () => {},
    }),
  };
});

import { ReelPreview } from './reel-preview';

const origCreateObjectURL = URL.createObjectURL;
const origRevokeObjectURL = URL.revokeObjectURL;

function loadVideoReel(videoSrc: string) {
  const base = fixtureProject();
  editorStore.getState().load({
    ...base,
    id: 'p-reel-1',
    format: '9:16',
    voiceover: {
      ...base.voiceover,
      src: 'storage:users/u1/audio/p-reel-1/voice-1111111111111111.wav',
      originalSrc: videoSrc,
    },
    video: {
      src: videoSrc,
      width: 1080,
      height: 1920,
      originalDurationMs: base.durationMs,
      cuts: [],
      punchIns: [],
      defaultOverlayAnchor: 'top-right',
    },
    reel: {
      v: 1,
      look: 'mono',
      focus: { x: 0.5, y: 0.35 },
      captions: true,
      scenes: [
        {
          id: 'sc-1',
          startMs: 0,
          endMs: base.durationMs,
          layout: 'speaker',
          content: { template: 'none' },
        },
      ],
    },
    slots: [],
    versions: [],
  });
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.put.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:mock-video');
  URL.revokeObjectURL = vi.fn();
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(() => {
  cleanup();
  URL.createObjectURL = origCreateObjectURL;
  URL.revokeObjectURL = origRevokeObjectURL;
});

describe('ReelPreview missing video recovery', () => {
  it('stops showing Loading video… when a local idb: video is missing and lets the user re-attach', async () => {
    mocks.get.mockImplementation(async (ref) => {
      if (ref.startsWith('idb:')) return null;
      return new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' });
    });
    mocks.put.mockResolvedValue('storage:users/u1/video/p-reel-1/source-abcdef0123456789.mp4');

    loadVideoReel('idb:audio-oldlocal');
    render(<ReelPreview />);

    await waitFor(() => {
      expect(screen.getByTestId('missing-video-overlay')).toBeTruthy();
    });
    expect(screen.queryByText('Loading video…')).toBeNull();
    expect(screen.getByText(/Video file is on another browser or device/i)).toBeTruthy();

    const fileInput = screen.getByLabelText('Re-attach source video file') as HTMLInputElement;
    const mp4 = new File([new Uint8Array([0, 0, 0, 24])], 'clip.mp4', { type: 'video/mp4' });
    fireEvent.change(fileInput, { target: { files: [mp4] } });

    await waitFor(() => {
      expect(mocks.put).toHaveBeenCalledWith(mp4, { projectId: 'p-reel-1', kind: 'source' });
      expect(editorStore.getState().project?.video?.src).toBe(
        'storage:users/u1/video/p-reel-1/source-abcdef0123456789.mp4',
      );
      expect(editorStore.getState().project?.voiceover.originalSrc).toBe(
        'storage:users/u1/video/p-reel-1/source-abcdef0123456789.mp4',
      );
    });

    await waitFor(() => {
      expect(screen.queryByTestId('missing-video-overlay')).toBeNull();
    });
  });

  it('shows Retry when a synced storage: video fails to download and recovers on retry', async () => {
    let attempts = 0;
    const storageRef = 'storage:users/u1/video/p-reel-1/source-1111222233334444.mp4';
    mocks.get.mockImplementation(async (ref) => {
      if (ref === storageRef) {
        attempts += 1;
        if (attempts === 1) throw new AudioElsewhereError();
        return new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' });
      }
      return null;
    });

    loadVideoReel(storageRef);
    render(<ReelPreview />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('missing-video-overlay')).toBeNull();
    });
    expect(attempts).toBe(2);
  });
});
