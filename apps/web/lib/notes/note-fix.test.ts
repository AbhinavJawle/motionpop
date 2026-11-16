import { describe, expect, it, vi } from 'vitest';
import { createFakeRouter } from '@/lib/ai/fake-router';
import type { Route } from '@/lib/ai/route';
import { LocalCredits } from '@/lib/credits/local-credits';
import { addNote } from '@/lib/commands';
import { demoProject } from '@/lib/projects/fixture';
import { createEditorStore } from '@/lib/stores/editor';
import type { Region } from './geometry';
import { jpegBase64, runNoteFix, type NoteFixDeps } from './note-fix';

const DEVICE: Route = { kind: 'device', mode: 'ONLY_ON_DEVICE', allowCloud: false };
const CLOUD: Route = {
  kind: 'cloud',
  mode: 'ONLY_IN_CLOUD',
  allowCloud: false,
  credits: 1,
  insufficient: false,
};

function setup(opts: { search?: string; sleep?: (ms: number) => Promise<void> } = {}) {
  const store = createEditorStore(() => 1000);
  store.getState().load(demoProject(0));
  const credits = new LocalCredits(120);
  const router = createFakeRouter({
    latencyMs: 5,
    search: opts.search ?? '',
    sleep: opts.sleep ?? (async () => {}),
  });
  const look = vi.fn(async () => ({
    regionText: ['$140k', '2022'],
    image: undefined as string | undefined,
  }));
  const deps: NoteFixDeps = {
    store,
    credits,
    getRouter: async () => router,
    look,
    now: () => 5000,
  };
  const slot = () => store.getState().project!.slots.find((s) => s.id === 'slot-2')!;
  const note = (id = 'note-1') => slot().notes.find((n) => n.id === id)!;
  const addText = (text: string) =>
    store.getState().exec(
      addNote('slot-2', {
        id: 'note-2',
        tMs: 1000,
        shape: { kind: 'circle', points: [0.3, 0.3, 0.1, 0.1] },
        text,
        status: 'open',
      }),
    );
  return { store, credits, deps, look, slot, note, addText };
}

describe('runNoteFix', () => {
  it('"Make this slower" sets timing.speed 0.8 and marks the note fixed, in one undo step', async () => {
    const { deps, store, slot, note, credits } = setup();
    const r = await runNoteFix(deps, 'slot-2', 'note-1', DEVICE);
    expect(r).toMatchObject({ kind: 'applied', ranOn: 'device' });
    expect(slot().timing).toEqual({ speed: 0.8 });
    expect(note()).toMatchObject({ status: 'fixed', fixedVersionId: expect.any(String) });
    const v = store.getState().project!.versions.find((x) => x.id === note().fixedVersionId)!;
    expect(v).toMatchObject({ source: 'ai-device', costCredits: 0, label: 'Make this slower' });
    expect(slot().currentVersionId).toBe(v.id);
    expect(credits.balance()).toBe(120);
    store.getState().undo();
    expect(slot().timing).toBeUndefined();
    expect(note().status).toBe('open');
    expect(slot().currentVersionId).toBe('v-2-3');
  });

  it('sends the region, the texts and a JPEG only when there is one', async () => {
    const { deps, look } = setup();
    const router = { run: vi.fn(createFakeRouter({ latencyMs: 1, sleep: async () => {} }).run) };
    // The crop the note asked for is read back below from the mock's calls.
    const seen = vi.fn(async (crop: Region) => {
      void crop;
      return { regionText: ['$140k'], image: `data:image/jpeg;base64,${'QUJD'}` };
    });
    await runNoteFix(
      { ...deps, look: seen, getRouter: async () => router as never },
      'slot-2',
      'note-1',
      DEVICE,
    );
    const input = router.run.mock.calls[0]![1] as Record<string, unknown>;
    expect(input['regionText']).toEqual(['$140k']);
    expect(input['image']).toBe('QUJD');
    expect(input['note']).toMatchObject({ text: 'Make this slower', tMs: 1400 });
    // The crop asked for is inside the frame and at least the note's region.
    const crop = seen.mock.calls[0]![0];
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.w).toBeLessThanOrEqual(1);
    router.run.mockClear();
    await runNoteFix(
      { ...deps, getRouter: async () => router as never },
      'slot-2',
      'note-1',
      DEVICE,
    );
    expect(look).toHaveBeenCalled();
    expect((router.run.mock.calls[0]![1] as Record<string, unknown>)['image']).toBeUndefined();
  });

  it('an image that is not a JPEG data URL is dropped', () => {
    expect(jpegBase64('data:image/jpeg;base64,QUJD')).toBe('QUJD');
    expect(jpegBase64('data:image/png;base64,QUJD')).toBeUndefined();
    expect(jpegBase64('javascript:alert(1)')).toBeUndefined();
    expect(jpegBase64(undefined)).toBeUndefined();
  });

  it('a note the model can’t do escalates and applies nothing', async () => {
    const { deps, store, slot, addText, note } = setup();
    addText('make the logo spin');
    const before = store.getState().project;
    const r = await runNoteFix(deps, 'slot-2', 'note-2', DEVICE);
    expect(r).toEqual({ kind: 'escalate', message: 'That needs a new graphic. Try Generate.' });
    expect(store.getState().project).toBe(before);
    expect(slot().timing).toBeUndefined();
    expect(note('note-2').status).toBe('open');
  });

  it('a failing device call is device-failed, never a cloud call or a charge', async () => {
    const { deps, credits, store } = setup({ search: '?fakeFail=note' });
    const before = store.getState().project;
    expect(await runNoteFix(deps, 'slot-2', 'note-1', DEVICE)).toEqual({ kind: 'device-failed' });
    expect(credits.balance()).toBe(120);
    expect(store.getState().project).toBe(before);
  });

  it('the cloud spends 1 credit, and refunds when the call fails', async () => {
    const ok = setup();
    expect(await runNoteFix(ok.deps, 'slot-2', 'note-1', CLOUD)).toMatchObject({
      kind: 'applied',
      ranOn: 'cloud',
    });
    expect(ok.credits.balance()).toBe(119);
    const bad = setup({ search: '?fakeFail=note' });
    expect(await runNoteFix(bad.deps, 'slot-2', 'note-1', CLOUD)).toEqual({ kind: 'cloud-failed' });
    expect(bad.credits.balance()).toBe(120);
  });

  it('a disabled route calls nothing', async () => {
    const { deps } = setup();
    const getRouter = vi.fn();
    expect(
      await runNoteFix({ ...deps, getRouter }, 'slot-2', 'note-1', {
        kind: 'disabled',
        reason: 'Needs connection',
      }),
    ).toEqual({ kind: 'blocked', reason: 'Needs connection' });
    expect(getRouter).not.toHaveBeenCalled();
  });

  it('discards the answer (and refunds) when the note is deleted or the slot edited meanwhile', async () => {
    let touch = () => {};
    const a = setup({ sleep: async () => touch() });
    touch = () =>
      a.store.getState().exec({
        label: 'delete note',
        do: (p) => ({
          ...p,
          slots: p.slots.map((s) => (s.id === 'slot-2' ? { ...s, notes: [] } : s)),
        }),
        undo: (p) => p,
      });
    expect(await runNoteFix(a.deps, 'slot-2', 'note-1', CLOUD)).toEqual({ kind: 'changed' });
    expect(a.credits.balance()).toBe(120);

    const b = setup({ sleep: async () => touch() });
    touch = () =>
      b.store.getState().exec({
        label: 'edit',
        do: (p) => ({
          ...p,
          slots: p.slots.map((s) =>
            s.id === 'slot-2' ? { ...s, params: { ...s.params, label: 'Edited' } } : s,
          ),
        }),
        undo: (p) => p,
      });
    expect(await runNoteFix(b.deps, 'slot-2', 'note-1', DEVICE)).toEqual({ kind: 'changed' });
    expect(b.slot().timing).toBeUndefined();
  });

  it('an unknown note or slot is "changed"', async () => {
    const { deps } = setup();
    expect(await runNoteFix(deps, 'slot-2', 'nope', DEVICE)).toEqual({ kind: 'changed' });
    expect(await runNoteFix(deps, 'nope', 'note-1', DEVICE)).toEqual({ kind: 'changed' });
  });
});
