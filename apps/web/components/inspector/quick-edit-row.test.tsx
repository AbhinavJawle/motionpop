// @vitest-environment happy-dom
import type { Router } from '@motionpop/ai';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeRouter } from '@/lib/ai/fake-router';
import { useAIStatusStore } from '@/lib/ai/ai-status';
import { demoProject } from '@/lib/projects/fixture';
import { resetActivity, useAIActivity } from '@/lib/stores/ai-activity';
import { editorStore } from '@/lib/stores/editor';
import { QuickEditRow, QUICK_EDIT_ATTR } from './quick-edit-row';

const routerRef: { current: Router } = {
  current: createFakeRouter({ latencyMs: 0, sleep: async () => {} }),
};
vi.mock('@/lib/ai/router-client', () => ({ getRouter: async () => routerRef.current }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const slot = (id = 'slot-2') => editorStore.getState().project!.slots.find((s) => s.id === id)!;
const input = () => screen.getByLabelText('Quick edit') as HTMLInputElement;
const submit = async (value: string) => {
  fireEvent.change(input(), { target: { value } });
  await act(async () => {
    fireEvent.keyDown(input(), { key: 'Enter' });
  });
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_FAKE_AI', '1');
  editorStore.getState().load(demoProject(0));
  resetActivity();
  useAIStatusStore.setState({ availability: 'available', online: true });
  routerRef.current = createFakeRouter({ latencyMs: 0, sleep: async () => {} });
});
afterEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  cleanup();
  vi.unstubAllEnvs();
});

describe('QuickEditRow (R7)', () => {
  it('has the attribute the "Keep editing" button looks for, and the mint chip on the device', () => {
    render(<QuickEditRow slot={slot()} />);
    expect(document.querySelector(`[${QUICK_EDIT_ATTR}]`)).toBe(input());
    expect(screen.getByText('free · on-device')).toBeTruthy();
  });

  it('shows ☁ 1 when the device is not ready', () => {
    useAIStatusStore.setState({ availability: 'unavailable', online: true });
    render(<QuickEditRow slot={slot()} />);
    expect(screen.queryByText('free · on-device')).toBeNull();
    expect(screen.getByLabelText('1 credits, runs in the cloud')).toBeTruthy();
  });

  it('is disabled with the reason when offline without a device model', () => {
    // The hook follows the browser's connection state, so the browser must be offline.
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    useAIStatusStore.setState({ availability: 'unavailable', online: false });
    render(<QuickEditRow slot={slot()} />);
    expect(input().disabled).toBe(true);
    expect(screen.getByText('Needs connection')).toBeTruthy();
  });

  it('runs "make it slower" on Enter: timing changes, the input clears, "Ready in" is recorded', async () => {
    render(<QuickEditRow slot={slot()} />);
    await submit('make it slower');
    await waitFor(() => expect(slot().timing).toEqual({ speed: 0.8 }));
    expect(input().value).toBe('');
    const ready = useAIActivity.getState().ready;
    expect(ready?.slotId).toBe('slot-2');
    expect(useAIActivity.getState().busy).toBeNull();
  });

  it('shows the shimmer and the busy state while the model works', async () => {
    let release = () => {};
    routerRef.current = createFakeRouter({
      latencyMs: 1,
      sleep: () => new Promise<void>((r) => (release = r)),
    });
    render(<QuickEditRow slot={slot()} />);
    await submit('make it slower');
    await waitFor(() => expect(useAIActivity.getState().busy).toMatchObject({ kind: 'edit' }));
    expect(input().parentElement!.getAttribute('aria-busy')).toBe('true');
    await act(async () => release());
    await waitFor(() => expect(useAIActivity.getState().busy).toBeNull());
  });

  it('offers "Generate ☁ 3" when the model says it needs a new graphic', async () => {
    render(<QuickEditRow slot={slot()} />);
    await submit('make the logo spin');
    expect(await screen.findByText('That needs a new graphic. Try Generate.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Generate/ })).toBeTruthy();
    expect(slot().timing).toBeUndefined();
  });

  it('says "Couldn’t do that on your device." and offers the cloud as a click, never charging first', async () => {
    let calls = 0;
    const good = createFakeRouter({ latencyMs: 0, sleep: async () => {} });
    routerRef.current = {
      run: ((...args: Parameters<Router['run']>) => {
        calls++;
        if (calls === 1) return Promise.reject(new Error('device said no'));
        return good.run(...args);
      }) as Router['run'],
    };
    render(<QuickEditRow slot={slot()} />);
    await submit('make it slower');
    expect(await screen.findByText('Couldn’t do that on your device.')).toBeTruthy();
    expect(calls).toBe(1);
    const retry = screen.getByRole('button', { name: /Try in the cloud/ });
    await act(async () => {
      fireEvent.click(retry);
    });
    await waitFor(() => expect(slot().timing).toEqual({ speed: 0.8 }));
    const v = editorStore
      .getState()
      .project!.versions.find((x) => x.id === slot().currentVersionId)!;
    expect(v.source).toBe('ai-cloud');
    expect(v.costCredits).toBe(1);
    expect(calls).toBe(2);
  });

  it('a planned graphic cannot be quick-edited', () => {
    render(<QuickEditRow slot={slot('slot-3')} />);
    expect(input().disabled).toBe(true);
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });
});
