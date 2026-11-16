// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIStatusStore } from '@/lib/ai/ai-status';
import { demoProject } from '@/lib/projects/fixture';
import { resetActivity } from '@/lib/stores/ai-activity';
import { editorStore } from '@/lib/stores/editor';
import { InspectorBody } from './inspector-body';

vi.mock('@/lib/ai/router-client', () => ({ getRouter: async () => null }));

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

beforeEach(() => {
  editorStore.getState().load(demoProject(0));
  resetActivity();
  useAIStatusStore.setState({ availability: 'available', online: true });
});
afterEach(cleanup);

describe('InspectorBody (R1.1)', () => {
  it('shows the sections in the order of editor.png, with no React warnings', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const slot = editorStore.getState().project!.slots.find((s) => s.id === 'slot-2')!;
    const { container } = render(<InspectorBody slot={slot} />);
    // A duplicate key between sibling sections once logged "two children with the same key".
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([]);
    errors.mockRestore();

    const text = container.textContent ?? '';
    const order = [
      'GRAPHIC',
      'Slot 2 · Big number',
      'You said',
      'Content',
      'Style',
      'Timing',
      'Versions',
    ];
    let at = -1;
    for (const label of order) {
      const i = text.toLowerCase().indexOf(label.toLowerCase(), at + 1);
      expect(i, label).toBeGreaterThan(at);
      at = i;
    }
    expect(screen.getByLabelText('Graphic prompt')).toBeTruthy();
    expect(screen.getByLabelText('Quick edit')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Slot actions' })).toBeTruthy();
  });
});
