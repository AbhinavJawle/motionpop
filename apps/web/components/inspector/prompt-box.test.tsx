// @vitest-environment happy-dom
import type { Router } from '@motionpop/ai';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIStatusStore } from '@/lib/ai/ai-status';
import { createFakeRouter } from '@/lib/ai/fake-router';
import { demoProject } from '@/lib/projects/fixture';
import { resetActivity } from '@/lib/stores/ai-activity';
import { editorStore } from '@/lib/stores/editor';
import { PromptBox } from './prompt-box';

const routerRef: { current: Router } = {
  current: createFakeRouter({ latencyMs: 0, sleep: async () => {} }),
};
const getRouterSpy = vi.fn(async () => routerRef.current);
vi.mock('@/lib/ai/router-client', () => ({ getRouter: () => getRouterSpy() }));

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
const loadEmpty = (id = 'slot-2') => {
  const p = demoProject(0);
  editorStore.getState().load({
    ...p,
    slots: p.slots.map((s) => (s.id === id ? { ...s, prompt: '' } : s)),
  });
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_FAKE_AI', '1');
  getRouterSpy.mockClear();
  resetActivity();
  routerRef.current = createFakeRouter({ latencyMs: 0, sleep: async () => {} });
  useAIStatusStore.setState({ availability: 'available', online: true });
  loadEmpty();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('PromptBox pre-fill (R6.1)', () => {
  it('writes an empty prompt on the device and saves it on the slot', async () => {
    render(<PromptBox slot={slot()} />);
    await waitFor(() => expect(slot().prompt).toContain('that follows “revenue grew forty'));
    expect(getRouterSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the template when the device is not available, without asking the router', async () => {
    useAIStatusStore.setState({ availability: 'unavailable', online: true });
    render(<PromptBox slot={slot()} />);
    await waitFor(() =>
      expect(slot().prompt).toBe(
        'An Editorial Explainer big number for “revenue grew forty percent since 2020”.',
      ),
    );
    expect(getRouterSpy).not.toHaveBeenCalled();
  });

  it('waits while the device status is still being checked', async () => {
    useAIStatusStore.setState({ availability: 'checking', online: true });
    render(<PromptBox slot={slot()} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(slot().prompt).toBe('');
    act(() => useAIStatusStore.setState({ availability: 'unavailable' }));
    await waitFor(() => expect(slot().prompt).not.toBe(''));
  });

  it('leaves a slot that has a prompt alone', async () => {
    editorStore.getState().load(demoProject(0));
    render(<PromptBox slot={slot()} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(getRouterSpy).not.toHaveBeenCalled();
    expect(slot().prompt).toBe('A big, confident 40% with a warm highlight and an editorial feel.');
  });

  it('saves an edited prompt when the box loses focus, as one undo step', async () => {
    editorStore.getState().load(demoProject(0));
    render(<PromptBox slot={slot()} />);
    const box = screen.getByLabelText('Graphic prompt');
    fireEvent.change(box, { target: { value: 'A calm number in orange.' } });
    fireEvent.blur(box);
    expect(slot().prompt).toBe('A calm number in orange.');
    act(() => editorStore.getState().undo());
    expect(slot().prompt).toBe('A big, confident 40% with a warm highlight and an editorial feel.');
  });

  it('Generate is on, shows ☁ 3, and a click saves the draft and adds a "Generated" version', async () => {
    editorStore.getState().load(demoProject(0));
    render(<PromptBox slot={slot('slot-4')} />);
    const button = screen.getByRole('button', { name: /Generate/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('3');
    const box = screen.getByLabelText('Graphic prompt');
    fireEvent.change(box, { target: { value: 'A calm number in orange.' } });
    fireEvent.click(button);
    expect(slot('slot-4').prompt).toBe('A calm number in orange.');
    await waitFor(() => {
      const current = slot('slot-4').currentVersionId;
      const v = editorStore.getState().project!.versions.find((x) => x.id === current);
      expect(v).toMatchObject({ label: 'Generated', source: 'ai-cloud' });
    });
  });

  it('Generate is off offline', () => {
    editorStore.getState().load(demoProject(0));
    // The hook follows the browser's connection state, so the browser must be offline.
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    try {
      useAIStatusStore.setState({ availability: 'available', online: false });
      render(<PromptBox slot={slot()} />);
      expect((screen.getByRole('button', { name: /Generate/ }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    }
  });

  it('while another slot generates, Generate is off ("Pip is on it")', () => {
    editorStore.getState().load(demoProject(0));
    act(() =>
      editorStore.getState().setGenerating({ slotId: 'slot-4', phase: 'animating', startedAt: 0 }),
    );
    render(<PromptBox slot={slot()} />);
    expect((screen.getByRole('button', { name: /Generate/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    act(() => editorStore.getState().setGenerating(null));
  });
});
