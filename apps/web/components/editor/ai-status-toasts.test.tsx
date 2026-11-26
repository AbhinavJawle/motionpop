// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  device: vi.fn(),
  cloud: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
  firebase: true,
  fake: false,
  setUp: vi.fn(),
}));
vi.mock('@/components/ui/toast', () => ({
  toast: Object.assign(vi.fn(), {
    device: h.device,
    cloud: h.cloud,
    error: h.error,
    dismiss: h.dismiss,
  }),
}));
vi.mock('@/lib/firebase/client', () => ({
  firebaseEnabled: () => h.firebase,
  getAILogic: () => Promise.resolve({}),
}));
vi.mock('@/lib/credits/pick-client', () => ({ fakeAiFlag: () => h.fake }));

import { useAIStatusStore } from '@/lib/ai/ai-status';
import { AIStatusToasts } from './ai-status-toasts';
import { OfflineBanner } from './offline-banner';

const set = (s: Partial<ReturnType<typeof useAIStatusStore.getState>>) =>
  act(() => useAIStatusStore.setState(s));

beforeEach(() => {
  h.firebase = true;
  h.fake = false;
  for (const f of [h.device, h.cloud, h.error, h.dismiss, h.setUp]) f.mockReset();
  window.sessionStorage.clear();
  useAIStatusStore.setState({
    availability: 'checking',
    setupActive: false,
    setupProgress: null,
    setupError: null,
    detected: true, // no real detection in these tests
    online: true,
  });
});
afterEach(cleanup);

describe('AIStatusToasts', () => {
  it('stays completely quiet on startup for available, unavailable, downloadable, or passive Chrome downloading', () => {
    render(<AIStatusToasts />);
    set({ availability: 'available' });
    set({ availability: 'unavailable' });
    set({ availability: 'downloadable' });
    // Passive Chrome 'downloading' (setupActive: false) must never pop up a progress toast.
    set({ availability: 'downloading', setupActive: false, setupProgress: null });
    expect(h.device).not.toHaveBeenCalled();
    expect(h.cloud).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it('shows progress and ready toasts only for a user-initiated download from Settings', () => {
    render(<AIStatusToasts />);
    set({ availability: 'downloadable', setupActive: false });
    set({ availability: 'downloading', setupActive: true, setupProgress: 0 });
    set({ setupProgress: 0.34 });
    const last = h.device.mock.calls.at(-1) as [
      string,
      undefined,
      { id: string; duration: number },
    ];
    expect(last[0]).toBe('Setting up on-device AI · 34 %');
    expect(last[2]).toEqual({ id: 'ai-setup', duration: Infinity });
    set({ availability: 'available', setupActive: false, setupProgress: null });
    expect(h.dismiss).toHaveBeenCalledWith('ai-setup');
    expect(h.device.mock.calls.at(-1)?.[0]).toBe('On-device AI ready');
  });

  it('closes the progress toast on failure (with error) or cancel (silently)', () => {
    render(<AIStatusToasts />);
    set({ availability: 'downloading', setupActive: true, setupProgress: 0.1 });
    set({
      availability: 'downloadable',
      setupActive: false,
      setupProgress: null,
      setupError: 'Chrome stopped the download.',
    });
    expect(h.dismiss).toHaveBeenCalledWith('ai-setup');
    expect(h.error).toHaveBeenCalledWith(expect.stringContaining("Couldn't set up on-device AI"));

    h.error.mockClear();
    h.dismiss.mockClear();
    set({ availability: 'downloading', setupActive: true, setupProgress: 0.2, setupError: null });
    set({
      availability: 'downloadable',
      setupActive: false,
      setupProgress: null,
      setupError: 'Download cancelled.',
    });
    expect(h.dismiss).toHaveBeenCalledWith('ai-setup');
    expect(h.error).not.toHaveBeenCalled();
  });

  it('says nothing in local mode (no Firebase) or under the fake-AI flag without ?aiToasts=1', () => {
    h.firebase = false;
    render(<AIStatusToasts />);
    set({ availability: 'downloading', setupActive: true, setupProgress: 0.5 });
    expect(h.device).not.toHaveBeenCalled();
    cleanup();
    h.fake = true;
    useAIStatusStore.setState({ availability: 'checking', setupActive: false });
    render(<AIStatusToasts />);
    set({ availability: 'downloading', setupActive: true, setupProgress: 0.5 });
    expect(h.device).not.toHaveBeenCalled();
  });
});

describe('OfflineBanner', () => {
  it('appears offline with the exact copy and goes away online', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    set({ online: false });
    expect(screen.getByRole('status').textContent).toBe(
      "You're offline. On-device edits still work. New graphics will generate when you're back.",
    );
    set({ online: true });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
