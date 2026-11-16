// @vitest-environment happy-dom
import {
  createRouter,
  type AIProvider,
  type ProviderRequest,
  type RouterConfig,
} from '@motionpop/ai';
import type { EditorProject, Slot } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
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

/**
 * "And this is only the beginning." (demo words 12–17) as the detector drafts it, held until
 * just before "Here's" so the line has its read time after "beginning.".
 */
const HOOK: Slot = {
  id: 'slot-h',
  startMs: 8650,
  endMs: 13050,
  wordStart: 12,
  wordEnd: 17,
  reason: "You said 'And this is only the beginning'",
  componentId: 'hook-statement',
  skillId: 'calm-explanation',
  prompt: '',
  params: {
    content: { line: 'And this is only the beginning' },
    images: [],
    beats: [{ cue: 'line', word: 0 }],
  },
  status: 'suggested',
  needsInput: ['content'],
  notes: [],
};

/** A stat-punch with no draft over words that hold no number ("And this is only the beginning."). */
const STAT: Slot = {
  ...HOOK,
  id: 'slot-s',
  componentId: 'stat-punch',
  skillId: 'shocking-stat-reveal',
  params: {},
  needsInput: ['content'],
};

function project(slots: Slot[]): EditorProject {
  return { ...demoProject(), slots, versions: [] };
}

const GOOD = {
  params: {
    variant: 'left',
    content: { line: 'And this is only the beginning', emphasis: 'only the beginning' },
    beats: [
      { cue: 'line', word: 0 },
      { cue: 'emphasis', word: 3 },
    ],
  },
};
const TOO_LONG = {
  params: {
    content: {
      line: 'And this is only the beginning of a very long story that nobody will ever read here',
    },
  },
};

function setup(slots: Slot[], opts: { answers?: (object | Error)[]; router?: boolean } = {}) {
  const store = createEditorStore(() => 1);
  store.getState().load(project(slots));
  const requests: ProviderRequest[] = [];
  const provider: AIProvider = {
    generate(req) {
      requests.push(req);
      const all = opts.answers ?? [GOOD];
      const a = all[Math.min(requests.length - 1, all.length - 1)] as object | Error;
      return a instanceof Error
        ? Promise.reject(a)
        : Promise.resolve({ text: JSON.stringify(a), ranOn: 'device' });
    },
  };
  const deps: AutoFillDeps = {
    store,
    getRouter: () =>
      Promise.resolve(
        opts.router === false ? null : createRouter({ provider, config: () => CONFIG }),
      ),
    loadConfig: () => Promise.resolve({ config: { flagAutoFill: true } }),
    now: () => 42,
    doc: document,
  };
  const slot = (id: string) => store.getState().project?.slots.find((s) => s.id === id);
  const versions = () => store.getState().project?.versions ?? [];
  return { store, deps, requests, slot, versions };
}

describe('auto-fill for scenes (spec 07 task 27)', () => {
  it('fills a hook-statement on the device with its catalogue entry, words and examples', async () => {
    const { deps, requests, slot, versions } = setup([HOOK]);
    expect(await runAutoFill(deps, () => false)).toBe(1);
    expect(requests.map((r) => r.mode)).toEqual(['ONLY_ON_DEVICE']);
    const prompt = requests[0]?.prompt ?? '';
    expect(prompt).toContain('scene: hook-statement: use when');
    expect(prompt).toContain('0:And 1:this 2:is 3:only 4:the 5:beginning.');
    expect(prompt).toContain('examples (words → answer):');
    // The structured output is the scene's own score schema: variant ids are an enum.
    expect(JSON.stringify(requests[0]?.jsonSchema)).toContain('"punch"');
    expect(slot('slot-h')).toMatchObject({ status: 'ready', params: { variant: 'left' } });
    expect(slot('slot-h')?.needsInput).toBeUndefined();
    // Changed 2026-11-16: the free draft lands first (the film plays at once), then the
    // device refines it.
    expect(versions()).toEqual([
      expect.objectContaining({ slotId: 'slot-h', source: 'default', label: 'Draft' }),
      expect.objectContaining({ slotId: 'slot-h', source: 'ai-device', label: 'Auto-fill' }),
    ]);
  });

  it('every scene slot is drafted and ready before the model answers, in one undo step', async () => {
    const { deps, slot, versions } = setup([HOOK], { answers: [GOOD] });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const getRouter = deps.getRouter;
    deps.getRouter = () =>
      getRouter().then(async (router) => {
        if (!router) return router;
        return {
          ...router,
          run: async (...a: Parameters<typeof router.run>) => {
            await gate;
            return router.run(...a);
          },
        } as typeof router;
      });
    const running = runAutoFill(deps, () => false);
    await new Promise((r) => setTimeout(r, 20));
    expect(slot('slot-h')).toMatchObject({ status: 'ready' });
    expect(versions()).toEqual([expect.objectContaining({ source: 'default', label: 'Draft' })]);
    release();
    await running;
    expect(versions().map((v) => v.label)).toEqual(['Draft', 'Auto-fill']);
  });

  it('a draft the user changed before the model answers is left alone', async () => {
    const { deps, store, slot, versions } = setup([HOOK], { answers: [GOOD] });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const getRouter = deps.getRouter;
    deps.getRouter = () =>
      getRouter().then(async (router) => {
        if (!router) return router;
        return {
          ...router,
          run: async (...a: Parameters<typeof router.run>) => {
            await gate;
            return router.run(...a);
          },
        } as typeof router;
      });
    const running = runAutoFill(deps, () => false);
    await new Promise((r) => setTimeout(r, 20));
    // The user retimes the slot while the model is still thinking.
    store
      .getState()
      .load({
        ...store.getState().project!,
        slots: store
          .getState()
          .project!.slots.map((s) => (s.id === 'slot-h' ? { ...s, endMs: s.endMs - 100 } : s)),
      });
    release();
    await running;
    expect(versions().some((v) => v.label === 'Auto-fill')).toBe(false);
    expect(slot('slot-h')?.status).toBe('ready');
  });

  it('repairs twice, then keeps the detector draft as the safe default', async () => {
    const { deps, requests, slot, versions } = setup([HOOK], { answers: [TOO_LONG] });
    expect(await runAutoFill(deps, () => false)).toBe(1);
    expect(requests).toHaveLength(3);
    // The repair rounds carry the code-written reason back to the model.
    expect(requests[1]?.prompt).toMatch(/14 words/);
    expect(slot('slot-h')).toMatchObject({
      status: 'ready',
      params: { content: { line: 'And this is only the beginning' } },
    });
    expect(versions()[0]).toMatchObject({ source: 'default', costCredits: 0 });
  });

  it('uses the safe default without a device model, and when the model lacks a value', async () => {
    const none = setup([HOOK], { router: false });
    expect(await runAutoFill(none.deps, () => false)).toBe(1);
    expect(none.requests).toEqual([]);
    expect(none.versions()[0]).toMatchObject({ source: 'default' });
    expect(none.slot('slot-h')?.status).toBe('ready');

    const unsure = setup([HOOK], { answers: [{ ...GOOD, needsInput: ['emphasis'] }] });
    expect(await runAutoFill(unsure.deps, () => false)).toBe(1);
    expect(unsure.versions()[0]).toMatchObject({ source: 'default' });
  });

  it('never invents a number: a stat over words without one stays suggested', async () => {
    const { deps, slot, versions } = setup([STAT], { router: false });
    expect(await runAutoFill(deps, () => false)).toBe(0);
    expect(slot('slot-s')).toMatchObject({ status: 'suggested', params: {} });
    expect(versions()).toEqual([]);
  });
});
