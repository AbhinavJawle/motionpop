// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoProject } from '@/lib/projects/fixture';
import { editorStore } from '@/lib/stores/editor';
import { GeneratingPanel } from './generating-panel';
import { InspectorBody } from './inspector-body';

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

const slot = (id: string) => editorStore.getState().project!.slots.find((s) => s.id === id)!;
beforeEach(() => editorStore.getState().load(demoProject(0)));
afterEach(cleanup);

describe('GeneratingPanel (spec 09 R6.4)', () => {
  it('has the copy of editor-generating.png', () => {
    render(<GeneratingPanel slot={slot('slot-2')} />);
    for (const t of [
      'Motion in the making',
      'Bringing it to life',
      'A few moments. A little magic.',
      'Finding moments',
      'Choosing graphics',
      'Keep your ideas moving.',
      'You can keep editing while Pip works.',
    ]) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    // The third step is active and names the slot.
    expect(screen.getByText(/Animating slot 2/)).toBeTruthy();
  });

  it('YOUR NEXT MOMENT names the next slot that is not ready, and is left out when there is none', () => {
    // slot-3 is still generating after slot-2: it is the next moment.
    const { unmount } = render(<GeneratingPanel slot={slot('slot-2')} />);
    expect(screen.getByText('Your next moment')).toBeTruthy();
    expect(screen.getByText(/Slot 3 ·/)).toBeTruthy();
    expect(screen.getByText('Matching the motion to your words.')).toBeTruthy();
    unmount();
    // Nothing comes after the last slot.
    render(<GeneratingPanel slot={slot('slot-4')} />);
    expect(screen.queryByText('Your next moment')).toBeNull();
  });
});

describe('a failed slot (R6.6)', () => {
  const fail = () =>
    editorStore.getState().exec({
      label: 'fail',
      do: (p) => ({
        ...p,
        slots: p.slots.map((s) =>
          s.id === 'slot-4' ? { ...s, status: 'failed' as const, error: 'Couldn’t generate' } : s,
        ),
      }),
      undo: (p) => p,
    });

  it('shows "Couldn’t generate" with Retry and Use a template', () => {
    fail();
    render(<InspectorBody slot={slot('slot-4')} />);
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t generate');
    expect(screen.getByRole('button', { name: /Retry/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use a template' })).toBeTruthy();
  });

  it('Use a template applies a free "default" version and the slot is ready again', () => {
    fail();
    render(<InspectorBody slot={slot('slot-4')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use a template' }));
    expect(slot('slot-4').status).toBe('ready');
    const v = editorStore
      .getState()
      .project!.versions.find((x) => x.id === slot('slot-4').currentVersionId)!;
    expect(v).toMatchObject({ source: 'default', costCredits: 0 });
    act(() => editorStore.getState().undo());
    expect(slot('slot-4').status).toBe('failed');
  });

  it('a slot that did not fail shows no notice', () => {
    render(<InspectorBody slot={slot('slot-4')} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
