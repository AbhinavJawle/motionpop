// @vitest-environment happy-dom
import { cleanup, render, screen, act } from '@testing-library/react';
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
