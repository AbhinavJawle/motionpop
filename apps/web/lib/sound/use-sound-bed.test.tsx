// @vitest-environment happy-dom
// Spec 39 R7.1: the editor's voiceover sound bed never runs on a reel project (the reel preview
// plays its own bed from `reelBedSound`, so a second one would double the music and effects).
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { EditorProjectSchema, type EditorProject } from '@motionpop/schemas';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackClock } from '@/lib/editor/playback';
import { editorStore } from '@/lib/stores/editor';
import { BED_DEBOUNCE_MS, useSoundBed } from './use-sound-bed';

const mixInWorker = vi.hoisted(() => vi.fn(() => Promise.resolve({ type: 'none', id: 'b1' })));
vi.mock('./bed-client', () => ({ mixInWorker }));

const audios: { pause: ReturnType<typeof vi.fn> }[] = [];
class FakeAudio {
  preload = '';
  src = '';
  pause = vi.fn();
  removeAttribute = vi.fn();
  addEventListener = vi.fn();
  constructor() {
    audios.push(this);
  }
}

const reel = {
  v: 1,
  look: 'mono',
  scenes: [{ id: 'r1', startMs: 0, endMs: 6000, layout: 'speaker', content: { template: 'none' } }],
};

const voiceover = (): EditorProject =>
  EditorProjectSchema.parse(fixtureProject({ slots: [], durationMs: 6000 }));
const reelProject = (): EditorProject => EditorProjectSchema.parse({ ...voiceover(), reel });

const makeClock = () => ({ attachFollower: vi.fn() }) as unknown as PlaybackClock;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Audio', FakeAudio);
  mixInWorker.mockClear();
  audios.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useSoundBed on reels (spec 39 R7.1)', () => {
  it('a voiceover project mixes a bed (the control case)', async () => {
    editorStore.getState().load(voiceover());
    const { unmount } = renderHook(() => useSoundBed(makeClock(), -20));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BED_DEBOUNCE_MS + 50);
    });
    expect(mixInWorker).toHaveBeenCalledTimes(1);
    expect(audios).toHaveLength(1);
    unmount();
  });

  it('a reel project makes no audio element, mixes nothing and attaches no follower', async () => {
    editorStore.getState().load(reelProject());
    const clock = makeClock();
    const { unmount } = renderHook(() => useSoundBed(clock, -20));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BED_DEBOUNCE_MS * 3);
    });
    expect(mixInWorker).not.toHaveBeenCalled();
    expect(audios).toHaveLength(0);
    expect(clock.attachFollower).not.toHaveBeenCalled();
    unmount();
  });

  it('opening a reel after a voiceover detaches the follower and pauses the bed element', async () => {
    editorStore.getState().load(voiceover());
    const clock = makeClock();
    const { unmount } = renderHook(() => useSoundBed(clock, -20));
    expect(audios).toHaveLength(1);
    const before = mixInWorker.mock.calls.length;
    act(() => editorStore.getState().load(reelProject()));
    expect(clock.attachFollower).toHaveBeenCalledWith(null);
    expect(audios[0]!.pause).toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BED_DEBOUNCE_MS * 3);
    });
    expect(mixInWorker.mock.calls.length).toBe(before);
    expect(audios).toHaveLength(1);
    unmount();
  });
});
