// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Version } from '@motionpop/schemas';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoProject } from '@/lib/projects/fixture';
import { editorStore } from '@/lib/stores/editor';
import { VersionsStrip } from './versions-strip';

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

const slot = () => editorStore.getState().project!.slots.find((s) => s.id === 'slot-2')!;
const more = (n: number): Version[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `v-extra-${i}`,
    slotId: 'slot-2',
    componentId: 'big-number',
    params: { value: 40, suffix: '%', label: 'Revenue grew', context: 'The bigger picture' },
    source: 'user' as const,
    costCredits: 0,
    createdAt: 10 + i,
    label: `Edit ${i}`,
  }));

beforeEach(() => {
  editorStore.getState().load(demoProject(0));
});
afterEach(cleanup);

describe('VersionsStrip (R5)', () => {
  it('shows the three versions of the demo slot, v3 current', () => {
    render(<VersionsStrip slot={slot()} />);
    expect(screen.getAllByRole('button', { name: /^v\d/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'v3 (current)' }).getAttribute('aria-current')).toBe(
      'true',
    );
    expect(screen.getByLabelText('Current version v3').textContent).toBe('v3');
  });

  it('restores a version on click in one undo step', () => {
    const { rerender } = render(<VersionsStrip slot={slot()} />);
    fireEvent.click(screen.getByRole('button', { name: 'v1' }));
    expect(slot().currentVersionId).toBe('v-2-1');
    rerender(<VersionsStrip slot={slot()} />);
    expect(screen.getByLabelText('Current version v1')).toBeTruthy();
    act(() => editorStore.getState().undo());
    expect(slot().currentVersionId).toBe('v-2-3');
  });

  it('the current tile cannot be clicked, and a version of another graphic is greyed', () => {
    const p = editorStore.getState().project!;
    editorStore.getState().load({
      ...p,
      versions: [
        ...p.versions,
        { ...p.versions[0]!, id: 'v-other', componentId: 'versus', label: 'Old' },
      ],
    });
    render(<VersionsStrip slot={slot()} />);
    expect(
      (screen.getByRole('button', { name: 'v3 (current)' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    // Newest page: v2, v3, Old.
    expect((screen.getByRole('button', { name: 'Old' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('pages by three with the arrows and jumps to the newest page when a version is added', () => {
    const p = editorStore.getState().project!;
    editorStore.getState().load({ ...p, versions: [...p.versions, ...more(4)] }); // 7 versions
    const { rerender } = render(<VersionsStrip slot={slot()} />);
    const names = () =>
      screen
        .getAllByRole('button', { name: /^(v\d|Edit|Newest)/ })
        .map((b) => b.getAttribute('aria-label'));
    expect(names()).toEqual(['Edit 1', 'Edit 2', 'Edit 3']);
    expect((screen.getByLabelText('Newer versions') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Older versions'));
    expect(names()).toEqual(['v2', 'v3 (current)', 'Edit 0']);
    fireEvent.click(screen.getByLabelText('Older versions'));
    expect(names()).toEqual(['v1', 'v2', 'v3 (current)']);
    expect((screen.getByLabelText('Older versions') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Newer versions'));
    expect(names()).toEqual(['Edit 0', 'Edit 1', 'Edit 2']);
    // A new version appears: back to the newest page.
    const q = editorStore.getState().project!;
    editorStore.getState().load({
      ...q,
      versions: [...q.versions, ...more(1).map((x) => ({ ...x, id: 'v-new', label: 'Newest' }))],
    });
    rerender(<VersionsStrip slot={slot()} />);
    expect(names()).toContain('Newest');
  });
});
