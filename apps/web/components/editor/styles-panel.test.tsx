// @vitest-environment happy-dom
import { builtInSkills } from '@motionpop/ai';
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { EditorProjectSchema, type ReelPlan } from '@motionpop/schemas';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultEdit } from '@/lib/configure/defaults';
import { editorStore } from '@/lib/stores/editor';
import { StylesPanelBody } from './styles-panel';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only removal of a DOM API
delete (Element.prototype as any).animate;

const plan: ReelPlan = {
  v: 1,
  look: 'mono',
  focus: { x: 0.5, y: 0.32 },
  captions: true,
  scenes: [
    {
      id: 'r1',
      startMs: 0,
      endMs: 3000,
      layout: 'split',
      bg: 'light',
      content: { template: 'headline', title: 'Hello' },
    },
  ],
};

function load(extra: Record<string, unknown>) {
  act(() =>
    editorStore
      .getState()
      .load(
        EditorProjectSchema.parse({ ...fixtureProject({ slots: [], durationMs: 3000 }), ...extra }),
      ),
  );
}

beforeEach(() => act(() => editorStore.getState().load(null as never)));
afterEach(cleanup);

describe('StylesPanelBody', () => {
  it('shows recipe groups and caption styles for a reel project', () => {
    load({ reel: plan, edit: defaultEdit('video') });
    render(<StylesPanelBody />);
    for (const r of builtInSkills.recipes()) {
      const group = screen.getByRole('region', { name: r.name });
      expect(within(group).getAllByRole('radio')).toHaveLength(r.styles.length);
    }
    expect(screen.queryByRole('radiogroup', { name: 'Look' })).toBeNull();
    const captions = screen.getByRole('radiogroup', { name: 'Caption style' });
    expect(within(captions).getAllByRole('radio')).toHaveLength(5);
    // The default edit picks the first Tech Explainer style; the mono look shows the seam captions.
    const first = builtInSkills.recipes()[0]!.styles[0]!;
    expect(
      screen.getByRole('radio', { name: new RegExp(first.name) }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      within(captions)
        .getByRole('radio', { name: /Seam label/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('picking a style and a caption style updates the reel and project.edit', () => {
    load({ reel: plan, edit: defaultEdit('video') });
    render(<StylesPanelBody />);
    fireEvent.click(screen.getByRole('radio', { name: /Flame Punch/ }));
    let p = editorStore.getState().project!;
    expect(p.edit?.styleId).toBe('flame-punch');
    expect(p.reel?.theme).toBeDefined();
    fireEvent.click(screen.getByRole('radio', { name: /Highlight box/ }));
    p = editorStore.getState().project!;
    expect(p.reel?.captionStyle).toBe('boxed');
    expect(p.edit?.captions.style).toBe('boxed');
    expect(screen.getByRole('radio', { name: /Flame Punch/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('keeps the voiceover looks for a project without a reel', () => {
    load({});
    render(<StylesPanelBody />);
    expect(screen.getByRole('radiogroup', { name: 'Look' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Tech Explainer' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Caption style' })).toBeNull();
  });
});
