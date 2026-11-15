import type { EditorProject, Slot, Version } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { applyAutoFill } from '../commands/auto-fill';
import { CommandRejected } from '../commands/command';
import { demoProject } from '../projects/fixture';
import { autoFillQueue } from './auto-fill-plan';

/** The demo with slot-2 turned back into a suggested big-number missing its label. */
function project(): EditorProject {
  const p = demoProject();
  return {
    ...p,
    slots: p.slots.map((s) =>
      s.id === 'slot-2'
        ? { ...s, status: 'suggested', params: { value: 40, suffix: '%' }, needsInput: ['label'] }
        : s,
    ),
  };
}
const snapshot = (p: EditorProject) => new Map(p.slots.map((s) => [s.id, s]));
const canFill = (id: string) => id === 'big-number';
const version: Version = {
  id: 'v-slot-2-af',
  slotId: 'slot-2',
  componentId: 'big-number',
  params: { value: 40, suffix: '%', label: 'Revenue grew' },
  source: 'ai-device',
  costCredits: 0,
  createdAt: 1,
};

describe('autoFillQueue', () => {
  it('takes suggested, fillable, untried, unedited slots in timeline order', () => {
    const p = project();
    expect(autoFillQueue(p, snapshot(p), new Set(), canFill).map((s) => s.id)).toEqual(['slot-2']);
    expect(autoFillQueue(p, snapshot(p), new Set(['slot-2']), canFill)).toEqual([]);
    expect(autoFillQueue(p, snapshot(p), new Set(), () => true).map((s) => s.id)).toEqual([
      'slot-1',
      'slot-2',
    ]);
  });

  it('skips a slot the user edited or added after load', () => {
    const p = project();
    const loaded = snapshot(p);
    const moved = {
      ...p,
      slots: p.slots.map((s): Slot => (s.id === 'slot-2' ? { ...s, startMs: s.startMs + 100 } : s)),
    };
    expect(autoFillQueue(moved, loaded, new Set(), canFill)).toEqual([]);
    expect(autoFillQueue(p, new Map(), new Set(), canFill)).toEqual([]);
  });
});

describe('applyAutoFill', () => {
  it('fills, marks ready, adds a version, and undoes cleanly', () => {
    const p = project();
    const slot = p.slots.find((s) => s.id === 'slot-2')!;
    const cmd = applyAutoFill('slot-2', slot, { params: version.params, needsInput: [], version });
    const next = cmd.do(p);
    const filled = next.slots.find((s) => s.id === 'slot-2')!;
    expect(filled).toMatchObject({
      status: 'ready',
      params: version.params,
      currentVersionId: version.id,
    });
    expect(filled.needsInput).toBeUndefined();
    expect(next.versions.at(-1)).toEqual(version);
    expect(cmd.undo(next)).toEqual(p);
  });

  it('keeps the slot suggested when something is still missing', () => {
    const p = project();
    const slot = p.slots.find((s) => s.id === 'slot-2')!;
    const next = applyAutoFill('slot-2', slot, {
      params: slot.params,
      needsInput: ['label'],
      version,
    }).do(p);
    expect(next.slots.find((s) => s.id === 'slot-2')).toMatchObject({
      status: 'suggested',
      needsInput: ['label'],
    });
  });

  it('refuses to overwrite a slot that changed while the fill ran', () => {
    const p = project();
    const slot = p.slots.find((s) => s.id === 'slot-2')!;
    const edited = {
      ...p,
      slots: p.slots.map((s): Slot => (s.id === 'slot-2' ? { ...s, params: { value: 50 } } : s)),
    };
    const cmd = applyAutoFill('slot-2', slot, { params: version.params, needsInput: [], version });
    expect(() => cmd.do(edited)).toThrow(CommandRejected);
  });
});
