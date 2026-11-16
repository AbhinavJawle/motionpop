import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createFakeRouter } from '@/lib/ai/fake-router';
import type { Route } from '@/lib/ai/route';
import { newSpendKey } from '@/lib/credits/client';
import { LocalCredits } from '@/lib/credits/local-credits';
import { closeOutOfCredits, useCreditsUi } from '@/lib/credits/credits-ui';
import { demoProject } from '@/lib/projects/fixture';
import { createEditorStore } from '@/lib/stores/editor';
import { runQuickEdit, type QuickEditDeps } from './quick-edit';

const DEVICE: Route = { kind: 'device', mode: 'ONLY_ON_DEVICE', allowCloud: false };
const CLOUD: Route = {
  kind: 'cloud',
  mode: 'ONLY_IN_CLOUD',
  allowCloud: false,
  credits: 1,
  insufficient: false,
};

function setup(
  opts: { search?: string; start?: number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const store = createEditorStore(() => 1000);
  store.getState().load(demoProject(0));
  const credits = new LocalCredits(opts.start ?? 120);
  const router = createFakeRouter({
    latencyMs: 5,
    search: opts.search ?? '',
    sleep: opts.sleep ?? (async () => {}),
  });
  const deps: QuickEditDeps = {
    store,
    credits,
    getRouter: async () => router,
    now: () => 5000,
  };
  const slot = () => store.getState().project!.slots.find((s) => s.id === 'slot-2')!;
  return { store, credits, deps, slot };
}

describe('runQuickEdit on the device', () => {
  it('"make it slower" sets timing.speed 0.8 as a free on-device version', async () => {
    const { deps, store, slot, credits } = setup();
    const r = await runQuickEdit(deps, 'slot-2', 'make it slower', DEVICE);
    expect(r).toMatchObject({ kind: 'applied', ranOn: 'device' });
    expect(slot().timing).toEqual({ speed: 0.8 });
    const v = store.getState().project!.versions.find((x) => x.id === slot().currentVersionId)!;
    expect(v).toMatchObject({ source: 'ai-device', costCredits: 0, label: 'make it slower' });
    expect(v.timing).toEqual({ speed: 0.8 });
    expect(credits.balance()).toBe(120);
    // One undo step.
    store.getState().undo();
    expect(slot().timing).toBeUndefined();
    expect(slot().currentVersionId).toBe('v-2-3');
  });

  it('"change 40 to 45" patches the number and keeps the rest', async () => {
    const { deps, slot } = setup();
    const r = await runQuickEdit(deps, 'slot-2', 'change 40 to 45', DEVICE);
    expect(r.kind).toBe('applied');
    expect(slot().params).toMatchObject({ value: 45, suffix: '%', label: 'Revenue grew' });
  });

  it('an instruction the model can’t do says escalate and applies nothing', async () => {
    const { deps, store, slot } = setup();
    const before = store.getState().project;
    const r = await runQuickEdit(deps, 'slot-2', 'make the logo spin', DEVICE);
    expect(r).toEqual({ kind: 'escalate', message: 'That needs a new graphic. Try Generate.' });
    expect(store.getState().project).toBe(before);
    expect(slot().timing).toBeUndefined();
  });

  it('a failing device call is "device-failed", never a silent cloud call, never a charge', async () => {
    const { deps, credits, store } = setup({ search: '?fakeFail=edit' });
    const before = store.getState().project;
    const r = await runQuickEdit(deps, 'slot-2', 'make it slower', DEVICE);
    expect(r).toEqual({ kind: 'device-failed' });
    expect(credits.balance()).toBe(120);
    expect(store.getState().project).toBe(before);
  });

  it('a disabled route calls nothing', async () => {
    const getRouter = vi.fn();
    const { deps } = setup();
    const r = await runQuickEdit({ ...deps, getRouter }, 'slot-2', 'make it slower', {
      kind: 'disabled',
      reason: 'Needs connection',
    });
    expect(r).toEqual({ kind: 'blocked', reason: 'Needs connection' });
    expect(getRouter).not.toHaveBeenCalled();
  });

  it('a planned graphic and an empty instruction are blocked', async () => {
    const { deps } = setup();
    expect(await runQuickEdit(deps, 'slot-3', 'make it slower', DEVICE)).toEqual({
      kind: 'blocked',
      reason: 'Coming soon',
    });
    expect((await runQuickEdit(deps, 'slot-2', '   ', DEVICE)).kind).toBe('blocked');
  });

  it('discards the answer when the slot was edited while the model worked', async () => {
    let touch = () => {};
    const { deps, store, slot } = setup({
      sleep: async () => touch(),
    });
    touch = () => {
      store.getState().exec({
        label: 'user edit',
        do: (p) => ({
          ...p,
          slots: p.slots.map((s) =>
            s.id === 'slot-2' ? { ...s, params: { ...s.params, label: 'Edited meanwhile' } } : s,
          ),
        }),
        undo: (p) => p,
      });
    };
    const r = await runQuickEdit(deps, 'slot-2', 'make it slower', DEVICE);
    expect(r).toEqual({ kind: 'changed' });
    expect(slot().params['label']).toBe('Edited meanwhile');
    expect(slot().timing).toBeUndefined();
  });

  it('discards the answer when the slot was deleted meanwhile', async () => {
    let drop = () => {};
    const { deps, store } = setup({ sleep: async () => drop() });
    drop = () => {
      store.getState().exec({
        label: 'delete',
        do: (p) => ({ ...p, slots: p.slots.filter((s) => s.id !== 'slot-2') }),
        undo: (p) => p,
      });
    };
    expect(await runQuickEdit(deps, 'slot-2', 'make it slower', DEVICE)).toEqual({
      kind: 'changed',
    });
  });
});

describe('runQuickEdit in the cloud (a click on "Try in the cloud")', () => {
  it('spends 1 credit with a version labelled ai-cloud', async () => {
    const { deps, credits, store, slot } = setup();
    const r = await runQuickEdit(deps, 'slot-2', 'make it faster', CLOUD);
    expect(r).toMatchObject({ kind: 'applied', ranOn: 'cloud' });
    expect(credits.balance()).toBe(119);
    const v = store.getState().project!.versions.find((x) => x.id === slot().currentVersionId)!;
    expect(v).toMatchObject({ source: 'ai-cloud', costCredits: 1 });
    expect(slot().timing).toEqual({ speed: 1.25 });
  });

  it('refunds when the cloud call fails', async () => {
    const { deps, credits } = setup({ search: '?fakeFail=edit' });
    const r = await runQuickEdit(deps, 'slot-2', 'make it faster', CLOUD);
    expect(r).toEqual({ kind: 'cloud-failed' });
    expect(credits.balance()).toBe(120);
  });

  it('refunds when the model answers escalate, and when the slot changed', async () => {
    const a = setup();
    expect((await runQuickEdit(a.deps, 'slot-2', 'dance', CLOUD)).kind).toBe('escalate');
    expect(a.credits.balance()).toBe(120);

    let touch = () => {};
    const b = setup({ sleep: async () => touch() });
    touch = () => {
      b.store.getState().exec({
        label: 'x',
        do: (p) => ({
          ...p,
          slots: p.slots.map((s) => (s.id === 'slot-2' ? { ...s, endMs: s.endMs - 100 } : s)),
        }),
        undo: (p) => p,
      });
    };
    expect(await runQuickEdit(b.deps, 'slot-2', 'make it faster', CLOUD)).toEqual({
      kind: 'changed',
    });
    expect(b.credits.balance()).toBe(120);
  });

  it('opens the out-of-credits modal and calls nothing when the balance is short', async () => {
    closeOutOfCredits();
    const getRouter = vi.fn();
    const { deps, credits } = setup({ start: 0 });
    const r = await runQuickEdit({ ...deps, getRouter }, 'slot-2', 'make it faster', CLOUD);
    expect(r).toEqual({ kind: 'no-credits' });
    expect(getRouter).not.toHaveBeenCalled();
    expect(useCreditsUi.getState().outOfCredits).toMatchObject({ action: 'edit', cost: 1 });
    expect(credits.balance()).toBe(0);
    closeOutOfCredits();
  });

  it('every attempt draws a new key (a retry is never a free call)', async () => {
    const keys: string[] = [];
    const { deps } = setup({ search: '?fakeFail=edit' });
    const wrapped = {
      ...deps,
      newKey: () => {
        const k = newSpendKey();
        keys.push(k);
        return k;
      },
    };
    await runQuickEdit(wrapped, 'slot-2', 'make it faster', CLOUD);
    await runQuickEdit(wrapped, 'slot-2', 'make it faster', CLOUD);
    expect(new Set(keys).size).toBe(2);
    expect(deps.credits!.balance()).toBe(120);
  });

  it('blocks a cloud route without a credits client, charging nothing', async () => {
    const { deps } = setup();
    expect(
      await runQuickEdit({ ...deps, credits: null }, 'slot-2', 'make it faster', CLOUD),
    ).toEqual({
      kind: 'blocked',
      reason: 'Sign in to use cloud AI',
    });
  });
});

describe('property: credits balance of quick edits', () => {
  it('after any mix of cloud attempts with random failures, balance = start − successes, never negative', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 6 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
        async (start, fails) => {
          const { deps, credits } = setup({ start });
          let ok = 0;
          for (const [i, fail] of fails.entries()) {
            // Each attempt is its own router with or without the failure switch.
            const router = createFakeRouter({
              latencyMs: 0,
              search: fail ? '?fakeFail=edit' : '',
              sleep: async () => {},
            });
            const r = await runQuickEdit(
              { ...deps, getRouter: async () => router },
              'slot-2',
              i % 2 === 0 ? 'make it faster' : 'make it slower',
              CLOUD,
            );
            if (r.kind === 'applied') ok++;
            expect(credits.balance()).toBeGreaterThanOrEqual(0);
          }
          expect(credits.balance()).toBe(start - ok);
          closeOutOfCredits();
        },
      ),
      { numRuns: 60 },
    );
  });
});
