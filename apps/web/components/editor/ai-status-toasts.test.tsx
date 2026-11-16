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
    setupProgress: null,
    detected: true, // no real detection in these tests
    online: true,
  });
});
afterEach(cleanup);

describe('AIStatusToasts', () => {
  it('shows the mint toast once when on-device AI is available', () => {
    render(<AIStatusToasts />);
    expect(h.device).not.toHaveBeenCalled();
    set({ availability: 'available' });
    expect(h.device).toHaveBeenCalledTimes(1);
    expect(h.device).toHaveBeenCalledWith(
      'On-device AI ready',
      'Small edits run instantly on your device, free and private.',
    );
    // Another editor mounted in the same session says nothing.
    cleanup();
    useAIStatusStore.setState({ availability: 'checking' });
    render(<AIStatusToasts />);
    set({ availability: 'available' });
    expect(h.device).toHaveBeenCalledTimes(1);
  });

  it('shows the violet toast when unavailable, without a setup action', () => {
    render(<AIStatusToasts />);
    set({ availability: 'unavailable' });
    expect(h.cloud).toHaveBeenCalledWith(
      'Using cloud AI',
      "Your browser doesn't support on-device AI yet. Everything still works.",
      undefined,
    );
  });

  it('offers "Set up on-device AI" when downloadable, and the action is a click handler', () => {
    render(<AIStatusToasts />);
    set({ availability: 'downloadable' });
    const [title, , opts] = h.cloud.mock.calls[0] as [
      string,
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(title).toBe('Using cloud AI');
    expect(opts.action.label).toBe('Set up on-device AI');
    expect(typeof opts.action.onClick).toBe('function');
  });

  it('keeps a persistent progress toast while downloading, then a mint toast and no progress toast', () => {
    render(<AIStatusToasts />);
    set({ availability: 'downloadable' });
    set({ availability: 'downloading', setupProgress: 0 });
    set({ setupProgress: 0.34 });
    const last = h.device.mock.calls.at(-1) as [
      string,
      undefined,
      { id: string; duration: number },
    ];
    expect(last[0]).toBe('Setting up on-device AI · 34 %');
    expect(last[2]).toEqual({ id: 'ai-setup', duration: Infinity });
    set({ availability: 'available', setupProgress: null });
    expect(h.dismiss).toHaveBeenCalledWith('ai-setup');
    expect(h.device.mock.calls.at(-1)?.[0]).toBe('On-device AI ready');
  });

  it('a failed setup closes the progress toast and says so', () => {
    render(<AIStatusToasts />);
    set({ availability: 'downloadable' });
    set({ availability: 'downloading', setupProgress: 0.1 });
    set({ availability: 'downloadable', setupProgress: null });
    expect(h.dismiss).toHaveBeenCalledWith('ai-setup');
    expect(h.error).toHaveBeenCalledWith(expect.stringContaining("Couldn't set up on-device AI"));
  });

  it('says nothing in local mode (no Firebase, so no cloud) or under the fake-AI flag without ?aiToasts=1', () => {
    h.firebase = false;
    render(<AIStatusToasts />);
    set({ availability: 'unavailable' });
    expect(h.cloud).not.toHaveBeenCalled();
    cleanup();
    h.fake = true;
    useAIStatusStore.setState({ availability: 'checking' });
    render(<AIStatusToasts />);
    set({ availability: 'available' });
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
