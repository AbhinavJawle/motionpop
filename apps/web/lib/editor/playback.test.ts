import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoProject } from '../projects/fixture';
import { createEditorStore, type EditorStore } from '../stores/editor';
import { PlaybackClock } from './playback';
import { seekPreview } from './preview-bridge';

vi.mock('./preview-bridge', () => ({ seekPreview: vi.fn() }));

/** Env advanced by hand: `step(dt)` moves time forward and runs the one pending frame. */
function makeEnv() {
  let t = 0;
  let nextId = 1;
  const pending = new Map<number, () => void>();
  return {
    env: {
      now: () => t,
      requestFrame: (cb: () => void) => {
        const id = nextId++;
        pending.set(id, cb);
        return id;
      },
      cancelFrame: (id: number) => void pending.delete(id),
    },
    pendingCount: () => pending.size,
    step(dt = 33): void {
      t += dt;
      const cbs = [...pending.values()];
      pending.clear();
      for (const cb of cbs) cb();
    },
  };
}

type Listener = () => void;

function makeAudio(playImpl: () => Promise<void> = () => Promise.resolve()) {
  const listeners = new Map<string, Set<Listener>>();
  const audio = {
    currentTime: 0,
    playbackRate: 1,
    play: vi.fn(playImpl),
    pause: vi.fn(),
    addEventListener: (type: string, l: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(l);
    },
    removeEventListener: (type: string, l: Listener) => void listeners.get(type)?.delete(l),
  };
  return {
    // Minimal stand-in: PlaybackClock only touches these members. Cast through unknown on purpose.
    element: audio as unknown as HTMLAudioElement,
    audio,
    fire: (type: string) => listeners.get(type)?.forEach((l) => l()),
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

let store: EditorStore;
let duration: number;
let sim: ReturnType<typeof makeEnv>;
let clock: PlaybackClock;

beforeEach(() => {
  vi.mocked(seekPreview).mockClear();
  store = createEditorStore(() => 0);
  const project = demoProject(0);
  store.getState().load(project);
  duration = project.durationMs;
  sim = makeEnv();
  clock = new PlaybackClock(store, sim.env);
});

describe('PlaybackClock.seek', () => {
  it('clamps to [0, duration] and rounds to an integer', () => {
    clock.seek(-50);
    expect(clock.currentMs).toBe(0);
    clock.seek(duration + 5000);
    expect(clock.currentMs).toBe(duration);
    clock.seek(1234.6);
    expect(clock.currentMs).toBe(1235);
  });

  it('property: always lands in [0, duration] as an integer, in clock and store', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e7, max: 1e7, noNaN: true }), (ms) => {
        clock.seek(ms);
        const v = clock.currentMs;
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(duration);
        expect(store.getState().playheadMs).toBe(v);
      }),
    );
  });

  it('commits to the store unless transient', () => {
    clock.seek(2000, { transient: true });
    expect(clock.currentMs).toBe(2000);
    expect(store.getState().playheadMs).toBe(0);
    clock.seek(3000);
    expect(store.getState().playheadMs).toBe(3000);
  });

  it('sets the audio element time and the preview', () => {
    const a = makeAudio();
    clock.attachAudio(a.element);
    clock.seek(1500);
    expect(a.audio.currentTime).toBe(1.5);
    expect(seekPreview).toHaveBeenLastCalledWith(1500);
  });
});

describe('PlaybackClock play and pause with audio', () => {
  it('commits playheadMs only on pause, not per frame', async () => {
    const a = makeAudio();
    clock.attachAudio(a.element);
    await clock.play();
    expect(store.getState().playing).toBe(true);
    expect(a.audio.play).toHaveBeenCalledTimes(1);

    for (let i = 1; i <= 5; i++) {
      a.audio.currentTime = i * 0.1;
      sim.step();
      expect(clock.currentMs).toBe(i * 100);
      expect(store.getState().playheadMs).toBe(0);
    }
    clock.pause();
    expect(store.getState().playing).toBe(false);
    expect(store.getState().playheadMs).toBe(500);
    expect(a.audio.pause).toHaveBeenCalled();
    expect(sim.pendingCount()).toBe(0);
  });

  it('applies the playback rate to the audio element', async () => {
    const a = makeAudio();
    clock.attachAudio(a.element);
    await clock.play(2);
    expect(a.audio.playbackRate).toBe(2);
  });

  it('pause is a no-op when not playing', () => {
    clock.pause();
    expect(store.getState().playing).toBe(false);
  });

  it('toggle starts and stops', async () => {
    clock.toggle();
    await Promise.resolve();
    expect(clock.isPlaying).toBe(true);
    clock.toggle();
    expect(clock.isPlaying).toBe(false);
  });

  it('pausing before audio.play() resolves never starts the loop', async () => {
    const a = makeAudio();
    clock.attachAudio(a.element);
    const p = clock.play();
    clock.pause();
    await p;
    expect(sim.pendingCount()).toBe(0);
  });

  it('play at the end restarts from 0 without committing the seek', async () => {
    clock.seek(duration);
    const a = makeAudio();
    clock.attachAudio(a.element);
    await clock.play();
    expect(clock.currentMs).toBe(0);
    expect(a.audio.currentTime).toBe(0);
    expect(store.getState().playheadMs).toBe(duration);
  });
});

describe('PlaybackClock fallback clock', () => {
  it('uses env.now deltas when audio.play() rejects', async () => {
    const a = makeAudio(() => Promise.reject(new Error('NotAllowedError')));
    clock.attachAudio(a.element);
    clock.seek(1000);
    await clock.play();
    expect(clock.isPlaying).toBe(true);
    sim.step(500);
    expect(clock.currentMs).toBe(1500);
    sim.step(250);
    expect(clock.currentMs).toBe(1750);
  });

  it('uses env.now deltas with no audio, scaled by rate', async () => {
    await clock.play(2);
    sim.step(100);
    expect(clock.currentMs).toBe(200);
  });

  it('a seek while on the fallback clock re-bases it', async () => {
    await clock.play();
    sim.step(1000);
    clock.seek(5000);
    sim.step(200);
    expect(clock.currentMs).toBe(5200);
  });
});

describe('PlaybackClock end of media', () => {
  it('stops at the duration on the fallback clock and commits it', async () => {
    clock.seek(duration - 100);
    await clock.play();
    sim.step(500);
    expect(clock.currentMs).toBe(duration);
    expect(clock.isPlaying).toBe(false);
    expect(store.getState().playing).toBe(false);
    expect(store.getState().playheadMs).toBe(duration);
    expect(sim.pendingCount()).toBe(0);
  });

  it('stops when the audio clock passes the duration', async () => {
    const a = makeAudio();
    clock.attachAudio(a.element);
    await clock.play();
    a.audio.currentTime = duration / 1000 + 1;
    sim.step();
    expect(clock.currentMs).toBe(duration);
    expect(clock.isPlaying).toBe(false);
  });

  it('stops on the audio ended event', async () => {
    const a = makeAudio();
    clock.attachAudio(a.element);
    await clock.play();
    a.fire('ended');
    expect(clock.currentMs).toBe(duration);
    expect(clock.isPlaying).toBe(false);
    expect(store.getState().playheadMs).toBe(duration);
  });

  it('detaches the ended listener when audio is replaced or disposed', () => {
    const a = makeAudio();
    const b = makeAudio();
    clock.attachAudio(a.element);
    expect(a.count('ended')).toBe(1);
    clock.attachAudio(b.element);
    expect(a.count('ended')).toBe(0);
    expect(b.count('ended')).toBe(1);
    clock.dispose();
    expect(b.count('ended')).toBe(0);
  });
});

describe('PlaybackClock subscribers', () => {
  it('calls a new subscriber immediately and then on every frame', async () => {
    const seen: number[] = [];
    clock.subscribe((ms) => seen.push(ms));
    expect(seen).toEqual([0]);
    await clock.play();
    sim.step(100);
    sim.step(100);
    sim.step(100);
    // subscribe() emits once, play() emits the starting frame, then one per rAF step.
    expect(seen).toEqual([0, 0, 100, 200, 300]);
  });

  it('unsubscribe stops notifications', () => {
    const seen: number[] = [];
    const off = clock.subscribe((ms) => seen.push(ms));
    off();
    clock.seek(1000);
    expect(seen).toEqual([0]);
  });

  it('every emitted frame is forwarded to the preview', async () => {
    await clock.play();
    sim.step(100);
    sim.step(100);
    expect(vi.mocked(seekPreview).mock.calls.map((c) => c[0])).toEqual([0, 100, 200]);
  });
});

describe('PlaybackClock rate change while playing', () => {
  // Regression (found by Kiro run 17): changing the rate while playing used to start a second
  // frame loop, so every frame was emitted twice. Fixed in playback.ts `play`.
  it('keeps a single frame loop running', async () => {
    await clock.play(1);
    await clock.play(2);
    expect(sim.pendingCount()).toBe(1);
  });
});
