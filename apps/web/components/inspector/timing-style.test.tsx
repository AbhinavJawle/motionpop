// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoProject } from '@/lib/projects/fixture';
import { editorStore } from '@/lib/stores/editor';
import { StyleRow } from './style-row';
import { TimingSection } from './timing-section';

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

beforeEach(() => {
  editorStore.getState().load(demoProject(0));
});
afterEach(cleanup);

describe('StyleRow (R3)', () => {
  it('shows the look’s name and changes it for the whole video in one undo step', () => {
    render(<StyleRow />);
    expect(screen.getByRole('button', { name: /Style: Editorial Explainer/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Style:/ }));
    fireEvent.click(screen.getByRole('option', { name: /Field Notes/ }));
    expect(editorStore.getState().project!.styleId).toBe('field-notes');
    act(() => editorStore.getState().undo());
    expect(editorStore.getState().project!.styleId).toBe('editorial-explainer');
  });
});

describe('TimingSection ease and Fade (R4)', () => {
  it('stores a chosen ease on the slot, and "Look default" clears it', () => {
    const { rerender } = render(<TimingSection slot={slot()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Ease:/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Linear/ }));
    expect(slot().timing).toEqual({ ease: 'linear' });
    rerender(<TimingSection slot={slot()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Ease: Linear/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Look default/ }));
    expect(slot().timing).toBeUndefined();
  });

  it('Fade is disabled and on for a library component, with the reason', () => {
    render(<TimingSection slot={slot()} />);
    const fade = screen.getByRole('switch', { name: 'Fade' }) as HTMLButtonElement;
    expect(fade.disabled).toBe(true);
    expect(fade.getAttribute('aria-checked')).toBe('true');
  });

  it('Fade toggles for a scene: off stores false, on removes it', () => {
    const p = demoProject(0);
    editorStore.getState().load({
      ...p,
      slots: p.slots.map((s) =>
        s.id === 'slot-4'
          ? {
              ...s,
              componentId: 'hook-statement',
              params: {
                variant: 'center',
                content: { line: 'Here is what comes next' },
                beats: [],
                images: [],
              },
            }
          : s,
      ),
    });
    const { rerender } = render(<TimingSection slot={slot('slot-4')} />);
    const fade = () => screen.getByRole('switch', { name: 'Fade' });
    expect((fade() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(fade());
    expect(slot('slot-4').timing).toEqual({ fade: false });
    rerender(<TimingSection slot={slot('slot-4')} />);
    expect(fade().getAttribute('aria-checked')).toBe('false');
    fireEvent.click(fade());
    expect(slot('slot-4').timing).toBeUndefined();
  });
});
