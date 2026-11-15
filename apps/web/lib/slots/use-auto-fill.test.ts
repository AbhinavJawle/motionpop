import { createRouter, type AIProvider, type RouterConfig } from '@motionpop/ai';
import type { EditorProject } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { moveSlot } from '../commands/slots';
import { demoProject } from '../projects/fixture';
import { createEditorStore } from '../stores/editor';
import { runAutoFill, type AutoFillDeps } from './use-auto-fill';

const CONFIG: RouterConfig = {
  routingOverrides: {},
  routingSlotsDetectDeviceMaxWords: 400,
  modelFast: 'fast',
  modelStrong: 'strong',
  killSwitch: false,
};

/** Demo with slot-2 back to a suggested big-number missing its label. */
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

const GOOD = JSON.stringify({ params: { value: 40, suffix: '%', label: 'Revenue grew' } });

function setup(opts: { answer?: string | Error; flag?: boolean; router?: boolean } = {}) {
  const store = createEditorStore(() => 1);
  store.getState().load(project());
  const seen: (string | null)[] = [];
  store.subscribe((s, prev) => {
    if (s.autoFilling !== prev.autoFilling) seen.push(s.autoFilling);
  });
  const calls: string[] = [];
  const provider: AIProvider = {
    generate(req) {
      calls.push(req.mode);
      const a = opts.answer ?? GOOD;
      return a instanceof Error ? Promise.reject(a) : Promise.resolve({ text: a, ranOn: 'device' });
    },
  };
  const deps: AutoFillDeps = {
    store,
    getRouter: () =>
      Promise.resolve(
        opts.router === false ? null : createRouter({ provider, config: () => CONFIG }),
      ),
    loadConfig: () => Promise.resolve({ config: { flagAutoFill: opts.flag ?? true } }),
    now: () => 42,
  };
  const slot2 = () => store.getState().project?.slots.find((s) => s.id === 'slot-2');
  return { store, deps, calls, seen, slot2 };
}

describe('runAutoFill', () => {
  it('fills the suggested big-number on the device, as one undoable step', async () => {
    const { store, deps, calls, seen, slot2 } = setup();
    expect(await runAutoFill(deps, () => false)).toBe(1);
    expect(calls).toEqual(['ONLY_ON_DEVICE']);
    expect(seen).toEqual(['slot-2', null]);
    expect(slot2()).toMatchObject({
      status: 'ready',
      params: { value: 40, suffix: '%', label: 'Revenue grew' },
      currentVersionId: 'v-slot-2-af-42',
    });
    expect(store.getState().project?.versions.at(-1)).toMatchObject({
      source: 'ai-device',
      costCredits: 0,
      label: 'Auto-fill',
    });
    store.getState().undo();
    expect(slot2()).toMatchObject({ status: 'suggested', needsInput: ['label'] });
  });

  it('does nothing without a router or with the flag off', async () => {
    const a = setup({ router: false });
    expect(await runAutoFill(a.deps, () => false)).toBe(0);
    const b = setup({ flag: false });
    expect(await runAutoFill(b.deps, () => false)).toBe(0);
    expect(b.calls).toEqual([]);
    expect(b.slot2()?.status).toBe('suggested');
  });

  it('leaves the slot suggested when the device model is unavailable', async () => {
    const { deps, seen, slot2, store } = setup({ answer: new Error('no on-device model') });
    expect(await runAutoFill(deps, () => false)).toBe(0);
    expect(slot2()?.status).toBe('suggested');
    expect(seen).toEqual(['slot-2', null]);
    expect(store.getState().rejection).toBeNull();
  });

  it('never fills a slot the user edited, before the fill starts or while it runs', async () => {
    // Edited while auto-fill was still waiting for the router (right after load).
    const before = setup();
    const getRouter = before.deps.getRouter;
    before.deps.getRouter = () => {
      expect(before.store.getState().exec(moveSlot('slot-2', 3550))).toBe(true);
      return getRouter();
    };
    expect(await runAutoFill(before.deps, () => false)).toBe(0);
    expect(before.calls).toEqual([]);

    const during = setup();
    const router = await during.deps.getRouter();
    during.deps.getRouter = () =>
      Promise.resolve({
        run: async (...args: Parameters<NonNullable<typeof router>['run']>) => {
          during.store.getState().exec(moveSlot('slot-2', 3550));
          return router!.run(...args);
        },
      } as NonNullable<typeof router>);
    expect(await runAutoFill(during.deps, () => false)).toBe(0);
    expect(during.slot2()?.status).toBe('suggested');
    expect(during.store.getState().rejection).toBeNull();
  });

  it('stops when cancelled', async () => {
    const { deps, calls } = setup();
    expect(await runAutoFill(deps, () => true)).toBe(0);
    expect(calls).toEqual([]);
  });
});
