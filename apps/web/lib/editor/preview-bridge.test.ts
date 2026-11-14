import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Bridge = typeof import('./preview-bridge');

let bridge: Bridge;

/** Fresh module state (player, lastFrame, wantedMs) for every test. */
beforeEach(async () => {
  vi.resetModules();
  bridge = await import('./preview-bridge');
});

function fakePlayer() {
  return { seek: vi.fn<(s: number) => void>() };
}

describe('seekPreview', () => {
  it('seeks with frame / 30 exactly', () => {
    const p = fakePlayer();
    bridge.attachPreview(p);
    bridge.seekPreview(1000);
    expect(p.seek).toHaveBeenCalledWith(1);
    bridge.seekPreview(1234);
    // 1234 ms * 30 / 1000 = 37.02 -> frame 37
    expect(p.seek).toHaveBeenLastCalledWith(37 / 30);
  });

  it('only seeks when the 30 fps frame changes', () => {
    const p = fakePlayer();
    bridge.attachPreview(p);
    bridge.seekPreview(1000);
    bridge.seekPreview(1005);
    bridge.seekPreview(1010);
    expect(p.seek).toHaveBeenCalledTimes(1);
    bridge.seekPreview(1034);
    expect(p.seek).toHaveBeenCalledTimes(2);
  });

  it('property: every seek is a whole frame and consecutive seeks never repeat a frame', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 60_000 }), { minLength: 1, maxLength: 60 }),
        (times) => {
          const p = fakePlayer();
          bridge.attachPreview(p);
          for (const t of times) bridge.seekPreview(t);
          const frames = p.seek.mock.calls.map(([s]) => Math.round(s * 30));
          for (const [i, [s]] of p.seek.mock.calls.entries()) {
            expect(s * 30).toBeCloseTo(frames[i] ?? NaN, 9);
            if (i > 0) expect(frames[i]).not.toBe(frames[i - 1]);
          }
        },
      ),
    );
  });

  it('ignores a missing or un-upgraded element without throwing', () => {
    expect(() => bridge.seekPreview(500)).not.toThrow();
    // An element whose class is not defined yet has no seek method.
    // Cast through unknown: the bridge must tolerate this shape at runtime.
    bridge.attachPreview({} as unknown as Parameters<Bridge['attachPreview']>[0]);
    expect(() => bridge.seekPreview(500)).not.toThrow();
  });

  it('does not mark the frame as sent while the element is un-upgraded', () => {
    const el: { seek?: (s: number) => void } = {};
    // Cast through unknown: simulates an element upgraded later in place.
    bridge.attachPreview(el as unknown as Parameters<Bridge['attachPreview']>[0]);
    bridge.seekPreview(1000);
    const seek = vi.fn();
    el.seek = seek;
    bridge.seekPreview(1000);
    expect(seek).toHaveBeenCalledWith(1);
  });
});

describe('attachPreview and resyncPreview', () => {
  it('attaching a new player re-arms seeking for the same frame', () => {
    const a = fakePlayer();
    const b = fakePlayer();
    bridge.attachPreview(a);
    bridge.seekPreview(2000);
    bridge.attachPreview(b);
    bridge.seekPreview(2000);
    expect(b.seek).toHaveBeenCalledWith(2);
  });

  it('attaching null detaches', () => {
    const p = fakePlayer();
    bridge.attachPreview(p);
    bridge.attachPreview(null);
    bridge.seekPreview(1000);
    expect(p.seek).not.toHaveBeenCalled();
  });

  it('resyncPreview re-seeks the latest wanted time even on the same frame', () => {
    const p = fakePlayer();
    bridge.attachPreview(p);
    bridge.seekPreview(3000);
    bridge.resyncPreview();
    expect(p.seek).toHaveBeenCalledTimes(2);
    expect(p.seek).toHaveBeenLastCalledWith(3);
  });

  it('resyncPreview uses the time wanted while no player was attached', () => {
    bridge.seekPreview(4000);
    const p = fakePlayer();
    bridge.attachPreview(p);
    bridge.resyncPreview();
    expect(p.seek).toHaveBeenCalledWith(4000 / 1000);
  });
});
