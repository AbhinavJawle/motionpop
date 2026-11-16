// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoProject } from '@/lib/projects/fixture';
import { editorStore } from '@/lib/stores/editor';
import { ContentSection } from './content-section';

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

describe('ContentSection (spec 09 R2)', () => {
  it('shows the title field, the data table and the compact context field of a big number', () => {
    render(<ContentSection slot={slot()} />);
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Revenue grew');
    expect((screen.getByLabelText('Context') as HTMLInputElement).value).toBe('The bigger picture');
    expect((screen.getByLabelText('Value') as HTMLInputElement).value).toBe('40');
    expect((screen.getByLabelText('Suffix') as HTMLInputElement).value).toBe('%');
  });

  it('commits a number on Enter as a new version, and undo brings the old one back', () => {
    render(<ContentSection slot={slot()} />);
    const input = screen.getByLabelText('Value');
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(slot().params['value']).toBe(45);
    const v = editorStore
      .getState()
      .project!.versions.find((x) => x.id === slot().currentVersionId)!;
    expect(v.source).toBe('user');
    act(() => editorStore.getState().undo());
    expect(slot().params['value']).toBe(40);
    expect(slot().currentVersionId).toBe('v-2-3');
  });

  it('commits on blur', () => {
    render(<ContentSection slot={slot()} />);
    const input = screen.getByLabelText('Label');
    fireEvent.change(input, { target: { value: 'Sales grew' } });
    fireEvent.blur(input);
    expect(slot().params['label']).toBe('Sales grew');
  });

  it('shows an error and changes nothing for text in a number field', () => {
    render(<ContentSection slot={slot()} />);
    const before = editorStore.getState().project;
    const input = screen.getByLabelText('Value');
    fireEvent.change(input, { target: { value: 'lots' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toMatch(/number/i);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(editorStore.getState().project).toBe(before);
  });

  it('shows the schema message when the value does not fit (a label past 48 characters)', () => {
    render(<ContentSection slot={slot()} />);
    const input = screen.getByLabelText('Label');
    fireEvent.change(input, { target: { value: 'x'.repeat(60) } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(slot().params['label']).toBe('Revenue grew');
  });

  it('Escape puts the old value back', () => {
    render(<ContentSection slot={slot()} />);
    const input = screen.getByLabelText('Label') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('Revenue grew');
  });

  it('follows the slot when it changes underneath (undo, a quick edit)', () => {
    const { rerender } = render(<ContentSection slot={slot()} />);
    act(() => {
      editorStore.getState().exec({
        label: 'x',
        do: (p) => ({
          ...p,
          slots: p.slots.map((s) =>
            s.id === 'slot-2' ? { ...s, params: { ...s.params, label: 'Elsewhere' } } : s,
          ),
        }),
        undo: (p) => p,
      });
    });
    rerender(<ContentSection slot={slot()} />);
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Elsewhere');
  });

  it('a graphic that is not built yet says so', () => {
    render(<ContentSection slot={slot('slot-3')} />);
    expect(screen.getByText('This graphic isn’t available yet.')).toBeTruthy();
  });

  it('collapses and expands with its chevron', () => {
    render(<ContentSection slot={slot()} />);
    const toggle = screen.getByRole('button', { name: /content/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
