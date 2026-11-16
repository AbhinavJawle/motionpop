// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRenderJob } from './hooks';
import type { RenderClient, RenderView } from './render-client';

const view = (status: RenderView['status'], progress: number): RenderView => ({
  renderId: 'r1',
  status,
  progress,
  costCredits: 5,
  title: 'T',
  format: '16:9',
  resolution: '1080p',
  durationMs: 18_000,
});

function fakeClient() {
  let push: (v: RenderView) => void = () => {};
  const stop = vi.fn();
  const check = vi.fn(async (): Promise<RenderView | null> => null);
  const client = {
    mode: 'cloud',
    watch: (_id: string, on: (v: RenderView) => void) => {
      push = on;
      return stop;
    },
    check,
  } as unknown as RenderClient;
  return { client, push: (v: RenderView) => push(v), stop, check };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useRenderJob', () => {
  it('forwards every change', () => {
    const f = fakeClient();
    const seen: string[] = [];
    renderHook(() => useRenderJob(f.client, 'r1', (v) => seen.push(`${v.status}:${v.progress}`)));
    act(() => f.push(view('rendering', 20)));
    act(() => f.push(view('encoding', 90)));
    expect(seen).toEqual(['rendering:20', 'encoding:90']);
  });

  it('asks the server to check after 45 s without a change, and applies the answer', async () => {
    vi.useFakeTimers();
    const f = fakeClient();
    f.check.mockResolvedValueOnce({ ...view('error', 40), error: 'stalled' });
    const seen: RenderView[] = [];
    renderHook(() => useRenderJob(f.client, 'r1', (v) => seen.push(v)));
    act(() => f.push(view('rendering', 40)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(44_000);
    });
    expect(f.check).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(f.check).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)?.error).toBe('stalled');
    // Final: no more checks.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(f.check).toHaveBeenCalledTimes(1);
  });

  it('a change resets the 45 s timer', async () => {
    vi.useFakeTimers();
    const f = fakeClient();
    renderHook(() => useRenderJob(f.client, 'r1', () => {}));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });
    act(() => f.push(view('rendering', 10)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });
    expect(f.check).not.toHaveBeenCalled();
  });

  it('stops watching on unmount and does nothing without a render', () => {
    const f = fakeClient();
    const { unmount } = renderHook(() => useRenderJob(f.client, 'r1', () => {}));
    unmount();
    expect(f.stop).toHaveBeenCalled();
    const g = fakeClient();
    renderHook(() => useRenderJob(g.client, null, () => {}));
    expect(g.stop).not.toHaveBeenCalled();
  });
});
