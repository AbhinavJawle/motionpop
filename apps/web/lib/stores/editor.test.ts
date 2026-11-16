import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteSlot, moveSlot, renameProject } from '../commands';
import { demoProject } from '../projects/fixture';
import { MemoryProjectRepository } from '../projects/repository';
import { startAutosave } from './autosave';
import { createEditorStore, selectCanRedo, selectCanUndo, selectSelectedSlot } from './editor';

const fresh = () => {
  let t = 1000;
  const store = createEditorStore(() => ++t);
  store.getState().load(demoProject(0));
  return store;
};

describe('editor store', () => {
  it('runs commands as undoable steps and stamps updatedAt', () => {
    const store = fresh();
    const before = store.getState().project!;
    expect(store.getState().exec(moveSlot('slot-2', 4400))).toBe(true);
    const moved = store.getState().project!;
    expect(moved.slots[1]!.startMs).toBe(4400);
    expect(moved.updatedAt).toBeGreaterThan(before.updatedAt);
    expect(selectCanUndo(store.getState())).toBe(true);

    store.getState().undo();
    expect(store.getState().project!.slots).toEqual(before.slots);
    expect(selectCanRedo(store.getState())).toBe(true);
    store.getState().redo();
    expect(store.getState().project!.slots[1]!.startMs).toBe(4400);
  });

  it('records a rejection and leaves the project unchanged', () => {
    const store = fresh();
    const before = store.getState().project;
    expect(store.getState().exec(renameProject('   '))).toBe(false);
    expect(store.getState().project).toBe(before);
    expect(store.getState().rejection?.label).toBeTruthy();
    expect(selectCanUndo(store.getState())).toBe(false);
  });

  it('clears the selection when the selected slot is deleted, and undo brings the slot back', () => {
    const store = fresh();
    store.getState().select('slot-2');
    expect(selectSelectedSlot(store.getState())?.id).toBe('slot-2');
    store.getState().exec(deleteSlot('slot-2'));
    expect(store.getState().selectedSlotId).toBeNull();
    store.getState().undo();
    expect(store.getState().project!.slots.map((s) => s.id)).toContain('slot-2');
  });

  it('clamps the playhead to the voiceover', () => {
    const store = fresh();
    store.getState().setPlayhead(-50);
    expect(store.getState().playheadMs).toBe(0);
    store.getState().setPlayhead(99_999.4);
    expect(store.getState().playheadMs).toBe(18_000);
  });
});

describe('autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves once after 500 ms of quiet and reports the status', async () => {
    const store = fresh();
    const repo = new MemoryProjectRepository();
    const save = vi.spyOn(repo, 'save');
    const { stop } = startAutosave(store, repo);

    store.getState().exec(moveSlot('slot-2', 4300));
    vi.advanceTimersByTime(300);
    store.getState().exec(moveSlot('slot-2', 4400));
    expect(store.getState().saveStatus).toBe('saving');
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.getState().saveStatus).toBe('saved');
    const r = await repo.load('demo');
    expect(r.ok && r.project.slots[1]!.startMs).toBe(4400);
    await stop();
  });

  it('does not save on load, and flushes a pending save on stop', async () => {
    const store = fresh();
    const repo = new MemoryProjectRepository();
    const save = vi.spyOn(repo, 'save');
    const { stop } = startAutosave(store, repo);
    store.getState().load(demoProject(5));
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    store.getState().exec(moveSlot('slot-2', 4300));
    await stop();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('shows an error status when saving fails', async () => {
    const store = fresh();
    const repo = new MemoryProjectRepository();
    vi.spyOn(repo, 'save').mockRejectedValue(new Error('quota'));
    const { stop } = startAutosave(store, repo);
    store.getState().exec(moveSlot('slot-2', 4300));
    await vi.runAllTimersAsync();
    expect(store.getState().saveStatus).toBe('error');
    await stop();
  });

  it('flush saves now and resolves only after the save and the uploads finished', async () => {
    vi.useRealTimers();
    const store = fresh();
    const repo = new MemoryProjectRepository();
    const order: string[] = [];
    const save = repo.save.bind(repo);
    vi.spyOn(repo, 'save').mockImplementation(async (p) => {
      await new Promise((r) => setTimeout(r, 20));
      await save(p);
      order.push('save');
    });
    const uploadsIdle = () =>
      new Promise<void>((r) =>
        setTimeout(() => {
          order.push('uploads');
          r();
        }, 40),
      );
    const handle = startAutosave(store, repo, { uploadsIdle });
    store.getState().exec(moveSlot('slot-2', 4300));
    await handle.flush();
    order.push('flushed');
    expect(order).toEqual(['save', 'uploads', 'flushed']);
    const r = await repo.load('demo');
    expect(r.ok && r.project.slots[1]!.startMs).toBe(4300);
    await handle.stop();
  });
});
