// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Route } from '@/lib/ai/route';
import { editorStore } from '@/lib/stores/editor';
import { NotesOverlay, type NotesOverlayProps } from './notes-overlay';

vi.mock('sonner', () => ({ toast: vi.fn() }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;
afterEach(cleanup);

const CLOUD: Route = {
  kind: 'cloud',
  mode: 'ONLY_IN_CLOUD',
  allowCloud: false,
  credits: 1,
  insufficient: false,
};

function overlay(over: Partial<NotesOverlayProps> = {}) {
  const props: NotesOverlayProps = {
    targetId: 's1',
    notes: [],
    aspect: 16 / 9,
    route: CLOUD,
    cloudRoute: CLOUD,
    noteTime: (ms) => ms,
    add: () => true,
    remove: () => {},
    reopen: () => {},
    run: async () => ({ kind: 'applied' }),
    focal: () => null,
    working: null,
    ...over,
  };
  return render(
    <div>
      <button type="button">Draw a note</button>
      <NotesOverlay {...props} />
    </div>,
  );
}

function enterOn(target: HTMLElement): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

describe('NotesOverlay keyboard path (Enter with the pen on)', () => {
  beforeEach(() => {
    act(() => {
      editorStore.setState({ playing: false });
      editorStore.getState().setDrawMode(true);
    });
  });

  it('opens a draft around the focal element', () => {
    overlay({ focal: () => ({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }) });
    const e = enterOn(screen.getByRole('button', { name: 'Draw a note' }));
    expect(e.defaultPrevented).toBe(true);
    expect(screen.getByLabelText('What should change?')).toBeTruthy();
  });

  it('claims Enter even when there is nothing to circle, so a focused button is not pressed', () => {
    overlay({ focal: () => null });
    const e = enterOn(screen.getByRole('button', { name: 'Draw a note' }));
    expect(e.defaultPrevented).toBe(true);
    expect(screen.queryByLabelText('What should change?')).toBeNull();
  });

  it('leaves Enter alone in text fields and with the pen off', () => {
    overlay({ focal: () => ({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 }) });
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(enterOn(input).defaultPrevented).toBe(false);
    input.remove();
    act(() => editorStore.getState().setDrawMode(false));
    expect(enterOn(screen.getByRole('button', { name: 'Draw a note' })).defaultPrevented).toBe(
      false,
    );
  });
});

describe('NotesOverlay escalation notice', () => {
  it('hides "Try in the cloud" when a note already ran in the cloud, and shows it after on-device escalation', async () => {
    const note = {
      id: 'n1',
      tMs: 0,
      shape: { kind: 'circle' as const, points: [0.5, 0.3, 0.2, 0.1] },
      text: 'make it pop',
      status: 'open' as const,
    };
    const { unmount } = overlay({
      notes: [note],
      route: CLOUD,
      cloudRoute: CLOUD,
      run: async () => ({ kind: 'escalate', message: 'Cloud could not change that.' }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fix it' }));
    await waitFor(() => expect(screen.getByText('Cloud could not change that.')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Try in the cloud/ })).toBeNull();
    unmount();

    const DEVICE: Route = { kind: 'device', mode: 'ONLY_ON_DEVICE', allowCloud: false };
    overlay({
      notes: [note],
      route: DEVICE,
      cloudRoute: CLOUD,
      run: async () => ({ kind: 'escalate', message: 'Needs cloud AI.' }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fix it' }));
    await waitFor(() => expect(screen.getByText('Needs cloud AI.')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Try in the cloud/ })).toBeTruthy();
  });

  it('offers Gemini Nano and Cloud fallbacks when a Local LLM note fails, and hides Cloud when offline', async () => {
    const note = {
      id: 'n1',
      tMs: 0,
      shape: { kind: 'circle' as const, points: [0.5, 0.3, 0.2, 0.1] },
      text: 'make this better',
      status: 'open' as const,
    };
    const LOCAL_LLM: Route = {
      kind: 'cloud',
      mode: 'ONLY_IN_CLOUD',
      allowCloud: false,
      credits: 0,
      insufficient: false,
      localLlm: true,
    };
    const DEVICE: Route = { kind: 'device', mode: 'ONLY_ON_DEVICE', allowCloud: false };
    const run = vi.fn(async (_id: string, r: Route) =>
      r.kind === 'cloud' && r.localLlm
        ? ({ kind: 'cloud-failed', localLlm: true, reason: 'Timed out' } as const)
        : ({ kind: 'applied', message: 'Done' } as const),
    );
    const { unmount } = overlay({
      notes: [note],
      route: LOCAL_LLM,
      cloudRoute: CLOUD,
      nanoRoute: DEVICE,
      localLlmRoute: LOCAL_LLM,
      bothLocalConnected: true,
      localModel: 'qwen3.5:9b',
      run,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fix it' }));
    await waitFor(() => expect(screen.getByText('Local AI failed: Timed out')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Try Gemini Nano/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Try in the cloud/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Try Gemini Nano/ }));
    await waitFor(() => expect(run).toHaveBeenLastCalledWith('n1', DEVICE));
    unmount();

    // Offline: cloudRoute is disabled → "Try in the cloud" is hidden while Nano fallback stays available.
    overlay({
      notes: [note],
      route: LOCAL_LLM,
      cloudRoute: { kind: 'disabled', reason: 'Needs connection' },
      nanoRoute: DEVICE,
      localLlmRoute: LOCAL_LLM,
      bothLocalConnected: true,
      localModel: 'qwen3.5:9b',
      run,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fix it' }));
    await waitFor(() => expect(screen.getByText('Local AI failed: Timed out')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Try Gemini Nano/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Try in the cloud/ })).toBeNull();
  });
});
