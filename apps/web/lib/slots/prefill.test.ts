import { describe, expect, it, vi } from 'vitest';
import { createFakeRouter } from '@/lib/ai/fake-router';
import type { Route } from '@/lib/ai/route';
import { demoProject } from '@/lib/projects/fixture';
import { createEditorStore } from '@/lib/stores/editor';
import { prefillPrompt } from './prefill';

const DEVICE: Route = { kind: 'device', mode: 'ONLY_ON_DEVICE', allowCloud: false };
const LOCAL: Route = { kind: 'local' };

function setup(search = '') {
  const store = createEditorStore(() => 1000);
  const p = demoProject(0);
  store.getState().load({
    ...p,
    slots: p.slots.map((s) => (s.id === 'slot-2' ? { ...s, prompt: '' } : s)),
  });
  const router = createFakeRouter({ latencyMs: 0, search, sleep: async () => {} });
  const prompt = () => store.getState().project!.slots.find((s) => s.id === 'slot-2')!.prompt;
  return { store, router, deps: { store, getRouter: async () => router }, prompt };
}

describe('prefillPrompt (R6.1)', () => {
  it('writes the prompt on the device and saves it on the slot as one undo step', async () => {
    const { deps, prompt, store } = setup();
    const r = await prefillPrompt(deps, 'slot-2', DEVICE);
    expect(r).toMatchObject({ kind: 'filled', source: 'device' });
    expect(prompt()).toBe(
      'A big number that follows “revenue grew forty percent since 2020” in an Editorial Explainer look.',
    );
    store.getState().undo();
    expect(prompt()).toBe('');
  });

  it('uses the template when the device is not ready (a local route)', async () => {
    const getRouter = vi.fn();
    const { store, prompt } = setup();
    const r = await prefillPrompt({ store, getRouter }, 'slot-2', LOCAL);
    expect(r).toMatchObject({ kind: 'filled', source: 'template' });
    expect(prompt()).toBe(
      'An Editorial Explainer big number for “revenue grew forty percent since 2020”.',
    );
    expect(getRouter).not.toHaveBeenCalled();
  });

  it('never reaches the cloud: a cloud or disabled route gets the template and no router call', async () => {
    for (const route of [
      { kind: 'cloud', mode: 'ONLY_IN_CLOUD', allowCloud: false, credits: 1, insufficient: false },
      { kind: 'disabled', reason: 'Needs connection' },
    ] as Route[]) {
      const getRouter = vi.fn();
      const { store, prompt } = setup();
      const r = await prefillPrompt({ store, getRouter }, 'slot-2', route);
      expect(r).toMatchObject({ kind: 'filled', source: 'template' });
      expect(getRouter).not.toHaveBeenCalled();
      expect(prompt()).toContain('big number for');
    }
  });

  it('falls back to the template when the device model fails or is missing', async () => {
    const failing = setup('?fakeFail=all');
    expect(await prefillPrompt(failing.deps, 'slot-2', DEVICE)).toMatchObject({
      kind: 'filled',
      source: 'template',
    });
    const off = setup('?device=off');
    expect(await prefillPrompt(off.deps, 'slot-2', DEVICE)).toMatchObject({ source: 'template' });
    const none = setup();
    expect(
      await prefillPrompt({ store: none.store, getRouter: async () => null }, 'slot-2', DEVICE),
    ).toMatchObject({ source: 'template' });
  });

  it('leaves a slot that already has a prompt alone', async () => {
    const { store } = setup();
    const getRouter = vi.fn();
    const before = store.getState().project;
    expect(await prefillPrompt({ store, getRouter }, 'slot-4', DEVICE)).toEqual({
      kind: 'skipped',
    });
    expect(store.getState().project).toBe(before);
    expect(getRouter).not.toHaveBeenCalled();
  });

  it('does not overwrite a prompt the user typed while the model worked', async () => {
    let type = () => {};
    const store = createEditorStore(() => 1000);
    const p = demoProject(0);
    store.getState().load({
      ...p,
      slots: p.slots.map((s) => (s.id === 'slot-2' ? { ...s, prompt: '' } : s)),
    });
    const router = createFakeRouter({ latencyMs: 0, sleep: async () => type() });
    type = () => {
      store.getState().exec({
        label: 'typed',
        do: (proj) => ({
          ...proj,
          slots: proj.slots.map((s) => (s.id === 'slot-2' ? { ...s, prompt: 'My own prompt' } : s)),
        }),
        undo: (proj) => proj,
      });
    };
    const r = await prefillPrompt({ store, getRouter: async () => router }, 'slot-2', DEVICE);
    expect(r).toEqual({ kind: 'skipped' });
    expect(store.getState().project!.slots.find((s) => s.id === 'slot-2')!.prompt).toBe(
      'My own prompt',
    );
  });

  it('works for a graphic that is not built yet (template names it)', async () => {
    const store = createEditorStore(() => 1000);
    const p = demoProject(0);
    store.getState().load({
      ...p,
      slots: p.slots.map((s) => (s.id === 'slot-3' ? { ...s, prompt: '' } : s)),
    });
    const r = await prefillPrompt({ store, getRouter: async () => null }, 'slot-3', LOCAL);
    expect(r).toMatchObject({ kind: 'filled', source: 'template' });
    expect(r.kind === 'filled' && r.text).toContain('map for');
  });
});
