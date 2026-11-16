import { lintCustom } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import { createFakeRouter } from '@/lib/ai/fake-router';
import type { Route } from '@/lib/ai/route';
import { LocalCredits } from '@/lib/credits/local-credits';
import { demoProject } from '@/lib/projects/fixture';
import { createEditorStore } from '@/lib/stores/editor';
import { COULDNT_CUSTOM, generateCustom } from './custom';
import type { GenerateDeps } from './generate';

const CLOUD: Route = {
  kind: 'cloud',
  mode: 'ONLY_IN_CLOUD',
  allowCloud: false,
  credits: 3,
  insufficient: false,
};

function setup(search = '') {
  const store = createEditorStore(() => 1000);
  store.getState().load(demoProject(0));
  const credits = new LocalCredits(120);
  const router = createFakeRouter({ latencyMs: 1, search, sleep: async () => {} });
  let n = 0;
  const deps: GenerateDeps = {
    store,
    credits,
    getRouter: async () => router,
    now: () => 5000,
    newKey: () => `custom-key-${n++}-aaaaaaaa`,
  };
  const slot = () => store.getState().project!.slots.find((s) => s.id === 'slot-4')!;
  return { store, credits, deps, slot };
}

describe('generateCustom (spec 15)', () => {
  it('spends 3 and turns the slot into a linted custom graphic, one undo away', async () => {
    const { deps, store, slot, credits } = setup();
    const before = structuredClone(slot());
    const r = await generateCustom(deps, 'slot-4', CLOUD);
    expect(r.outcome).toBe('ready');
    expect(credits.balance()).toBe(117);
    const s = slot();
    expect(s.componentId).toBe('custom');
    expect(lintCustom(s.params as { html: string; css: string; script: string })).toEqual([]);
    expect(store.getState().project!.versions.find((v) => v.id === r.versionId)).toMatchObject({
      componentId: 'custom',
      source: 'ai-cloud',
      label: 'Custom',
    });
    store.getState().undo();
    expect(slot()).toEqual(before);
  });

  it('refunds and keeps the graphic when the model fails', async () => {
    const { deps, slot, credits } = setup('?fakeFail=all');
    const r = await generateCustom(deps, 'slot-4', CLOUD);
    expect(r).toMatchObject({ outcome: 'kept', reason: COULDNT_CUSTOM });
    expect(credits.balance()).toBe(120);
    expect(slot().componentId).toBe('big-number');
  });

  it('needs a brief and a cloud route, and spends nothing otherwise', async () => {
    const { deps, store, credits } = setup();
    store.getState().exec({
      label: 'clear prompt',
      do: (p) => ({
        ...p,
        slots: p.slots.map((s) => (s.id === 'slot-4' ? { ...s, prompt: '' } : s)),
      }),
      undo: (p) => p,
    });
    expect(await generateCustom(deps, 'slot-4', CLOUD)).toMatchObject({ outcome: 'blocked' });
    expect(
      await generateCustom(deps, 'slot-1', { kind: 'disabled', reason: 'Needs connection' }),
    ).toMatchObject({
      outcome: 'blocked',
      reason: 'Needs connection',
    });
    expect(credits.balance()).toBe(120);
  });
});
