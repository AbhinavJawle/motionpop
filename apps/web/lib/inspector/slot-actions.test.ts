import { describe, expect, it } from 'vitest';
import { demoProject } from '../projects/fixture';
import { createEditorStore } from '../stores/editor';
import { applyTemplateAction, deleteSlotAction, duplicateSlotAction } from './slot-actions';

const fresh = () => {
  const store = createEditorStore(() => 1000);
  store.getState().load(demoProject(0));
  return store;
};

describe('slot menu actions (spec 09 R1.2)', () => {
  it('Delete removes the slot and undo brings it back', () => {
    const store = fresh();
    expect(deleteSlotAction(store, 'slot-4')).toBe(true);
    expect(store.getState().project!.slots.some((s) => s.id === 'slot-4')).toBe(false);
    store.getState().undo();
    expect(store.getState().project!.slots.some((s) => s.id === 'slot-4')).toBe(true);
  });

  it('Duplicate copies the slot into a free gap, selects the copy, and undoes in one step', () => {
    const store = fresh();
    deleteSlotAction(store, 'slot-3'); // opens 7.8 s to 13.1 s after slot-2
    const before = store.getState().project!.slots.length;
    expect(duplicateSlotAction(store, 'slot-2', 5)).toBe(true);
    expect(store.getState().project!.slots.length).toBe(before + 1);
    expect(store.getState().selectedSlotId).toBe(`slot-${(5).toString(36)}`);
    store.getState().undo();
    expect(store.getState().project!.slots.length).toBe(before);
  });

  it('Duplicate with no free gap changes nothing and records why', () => {
    const store = fresh();
    const before = store.getState().project;
    expect(duplicateSlotAction(store, 'slot-1', 5)).toBe(false);
    expect(store.getState().project).toBe(before);
    expect(store.getState().rejection).not.toBeNull();
  });

  it('Use a template resets a ready component to its defaults as a free `default` version', () => {
    const store = fresh();
    const outcome = applyTemplateAction(store, 'slot-4', undefined, 777);
    expect(outcome).toBe('applied');
    const p = store.getState().project!;
    const slot = p.slots.find((s) => s.id === 'slot-4')!;
    const v = p.versions.find((x) => x.id === slot.currentVersionId)!;
    expect(v.source).toBe('default');
    expect(v.costCredits).toBe(0);
    expect(v.label).toBe('Template');
    expect(slot.status).toBe('ready');
    store.getState().undo();
    expect(store.getState().project!.slots.find((s) => s.id === 'slot-4')!.params).toEqual({
      value: 40,
      suffix: '%',
      label: 'The takeaway',
    });
  });

  it('Use a template clears timing overrides', () => {
    const store = fresh();
    store.getState().exec({
      label: 'timing',
      do: (p) => ({
        ...p,
        slots: p.slots.map((s) => (s.id === 'slot-4' ? { ...s, timing: { speed: 0.8 } } : s)),
      }),
      undo: (p) => p,
    });
    applyTemplateAction(store, 'slot-4', undefined, 778);
    expect(store.getState().project!.slots.find((s) => s.id === 'slot-4')!.timing).toBeUndefined();
  });

  it('says so when the graphic has no template (a component that is not built yet)', () => {
    const store = fresh();
    expect(applyTemplateAction(store, 'slot-3', undefined, 1)).toBe('unavailable');
    expect(store.getState().project!.versions.filter((v) => v.slotId === 'slot-3')).toHaveLength(0);
  });

  it('rejects an unknown slot without touching the project', () => {
    const store = fresh();
    const before = store.getState().project;
    expect(applyTemplateAction(store, 'nope', undefined, 1)).toBe('rejected');
    expect(store.getState().project).toBe(before);
  });
});
