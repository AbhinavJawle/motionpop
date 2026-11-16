// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { demoProject } from '../projects/fixture';
import { createEditorStore } from '../stores/editor';
import { commitField, GATE_WARNING } from './commit-field';

const fresh = () => {
  const store = createEditorStore(() => 1000);
  store.getState().load(demoProject(0));
  return store;
};
const slot = (store: ReturnType<typeof fresh>, id = 'slot-2') =>
  store.getState().project!.slots.find((s) => s.id === id)!;

describe('commitField (spec 09 R2.2 to R2.4)', () => {
  it('applies a valid value as one user version and one undo step', () => {
    const store = fresh();
    const before = slot(store).params;
    const r = commitField(store, 'slot-2', { path: '/value', label: 'Value' }, 45, { now: 5 });
    expect(r).toEqual({ ok: true, changed: true, warning: null });
    const s = slot(store);
    expect(s.params['value']).toBe(45);
    const v = store.getState().project!.versions.find((x) => x.id === s.currentVersionId)!;
    expect(v).toMatchObject({ source: 'user', label: 'Edited value', costCredits: 0 });
    expect(v.params['value']).toBe(45);
    expect(store.getState().history.past).toHaveLength(1);
    store.getState().undo();
    expect(slot(store).params).toEqual(before);
    // Back to the version the slot had before.
    expect(slot(store).currentVersionId).toBe('v-2-3');
  });

  it('keeps the slot timing in the new version', () => {
    const store = fresh();
    store.getState().exec({
      label: 't',
      do: (p) => ({
        ...p,
        slots: p.slots.map((s) => (s.id === 'slot-2' ? { ...s, timing: { speed: 0.8 } } : s)),
      }),
      undo: (p) => p,
    });
    commitField(store, 'slot-2', { path: '/value', label: 'Value' }, 46, { now: 6 });
    const s = slot(store);
    expect(s.timing).toEqual({ speed: 0.8 });
    expect(
      store.getState().project!.versions.find((x) => x.id === s.currentVersionId)!.timing,
    ).toEqual({
      speed: 0.8,
    });
  });

  it('an invalid value changes nothing and returns the schema message', () => {
    const store = fresh();
    const project = store.getState().project;
    const r = commitField(store, 'slot-2', { path: '/label', label: 'Label' }, 'x'.repeat(80));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    expect(store.getState().project).toBe(project);
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('removing a required field is refused by the schema', () => {
    const store = fresh();
    const r = commitField(store, 'slot-2', { path: '/label', label: 'Label' }, undefined);
    expect(r.ok).toBe(false);
    expect(slot(store).params['label']).toBe('Revenue grew');
  });

  it('the same value is a no-op: no version, no undo step', () => {
    const store = fresh();
    const r = commitField(store, 'slot-2', { path: '/value', label: 'Value' }, 40);
    expect(r).toEqual({ ok: true, changed: false, warning: null });
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('a planned component or a missing slot says so', () => {
    const store = fresh();
    expect(commitField(store, 'slot-3', { path: '/x', label: 'X' }, 1)).toEqual({
      ok: false,
      error: 'This graphic isn’t available yet.',
    });
    expect(commitField(store, 'nope', { path: '/x', label: 'X' }, 1).ok).toBe(false);
  });

  it('exports the warning copy of the design', () => {
    expect(GATE_WARNING).toBe('This may not fit. Try a quick edit.');
  });
});

describe('commitField on a scene', () => {
  const sceneStore = () => {
    const store = createEditorStore(() => 1000);
    const p = demoProject(0);
    store.getState().load({
      ...p,
      slots: p.slots.map((s) =>
        s.id === 'slot-4'
          ? {
              ...s,
              componentId: 'stat-punch',
              params: {
                variant: 'hero',
                content: {
                  value: 40,
                  suffix: '%',
                  decimals: 0,
                  label: 'The takeaway',
                  countFrom: 0,
                },
                beats: [],
                images: [],
              },
            }
          : s,
      ),
    });
    return store;
  };

  it('edits a scene’s content under /content', () => {
    const store = sceneStore();
    const r = commitField(store, 'slot-4', { path: '/content/value', label: 'Value' }, 45, {
      now: 9,
      doc: document,
    });
    expect(r.ok).toBe(true);
    const s = store.getState().project!.slots.find((x) => x.id === 'slot-4')!;
    expect((s.params['content'] as Record<string, unknown>)['value']).toBe(45);
    expect(s.params['variant']).toBe('hero');
  });

  it('applies content the gates object to and says so (the user decides)', () => {
    const store = sceneStore();
    const r = commitField(
      store,
      'slot-4',
      { path: '/content/label', label: 'Label' },
      'Longer label',
      {
        now: 10,
        doc: document,
        check: () => 'the label does not fit',
      },
    );
    expect(r).toEqual({ ok: true, changed: true, warning: GATE_WARNING });
    const s = store.getState().project!.slots.find((x) => x.id === 'slot-4')!;
    expect((s.params['content'] as Record<string, unknown>)['label']).toBe('Longer label');
  });

  it('no warning when the gates pass', () => {
    const store = sceneStore();
    const r = commitField(store, 'slot-4', { path: '/content/label', label: 'Label' }, 'Shorter', {
      now: 11,
      doc: document,
      check: () => null,
    });
    expect(r).toMatchObject({ ok: true, warning: null });
  });
});
