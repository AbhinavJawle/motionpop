import type { Router, RunResult, TaskDef } from '@motionpop/ai';
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { EditorProjectSchema, type ReelPlan } from '@motionpop/schemas';
import { describe, expect, it, vi } from 'vitest';
import type { Route } from '@/lib/ai/route';
import { addReelNote, fixReelScene } from '@/lib/commands';
import { LocalCredits } from '@/lib/credits/local-credits';
import { createEditorStore } from '@/lib/stores/editor';
import { runReelNoteFix, type ReelNoteFixDeps } from './note-fix';

const DEVICE: Route = { kind: 'device', mode: 'ONLY_ON_DEVICE', allowCloud: false };
const CLOUD: Route = {
  kind: 'cloud',
  mode: 'ONLY_IN_CLOUD',
  allowCloud: false,
  credits: 1,
  insufficient: false,
};

const TEXT = 'I use icachi visuals and the best tools every single day'.split(' ');
const plan: ReelPlan = {
  v: 1,
  look: 'mono',
  focus: { x: 0.5, y: 0.32 },
  captions: true,
  hook: 'Six tools',
  scenes: [
    {
      id: 'r1',
      startMs: 0,
      endMs: 3000,
      layout: 'split',
      tag: 'MY STACK',
      content: {
        template: 'list',
        title: 'Seamlessly and let AI',
        items: [
          { at: 700, icon: 'video', text: 'Train fast' },
          { at: 1700, icon: 'check', text: 'Write well' },
        ],
      },
    },
    { id: 'r2', startMs: 3000, endMs: 6000, layout: 'speaker', content: { template: 'none' } },
  ],
};

/** A router that answers with `answer`, through the task's own parse and check like the real one. */
function stubRouter(answer: unknown | (() => unknown), seen: unknown[] = []): Router {
  return {
    async run<I, O>(task: TaskDef<I, O>, input: I): Promise<RunResult<O>> {
      seen.push(input);
      const raw = typeof answer === 'function' ? (answer as () => unknown)() : answer;
      const output = task.output.parse(raw);
      const err = task.check?.(output, task.input.parse(input));
      if (err) throw new Error(err);
      return {
        output,
        ranOn: 'cloud',
        model: 'm',
        costCredits: 1,
        latencyMs: 7,
        attempts: 1,
        cached: false,
      };
    },
  };
}

function setup(answer: unknown | (() => unknown), extra: Partial<ReelNoteFixDeps> = {}) {
  const store = createEditorStore(() => 1000);
  const base = fixtureProject({ slots: [], durationMs: 6000 });
  store.getState().load(
    EditorProjectSchema.parse({
      ...base,
      transcript: {
        ...base.transcript,
        words: TEXT.map((text, i) => ({
          i,
          text,
          startMs: 100 + i * 450,
          endMs: 100 + i * 450 + 400,
          conf: 0.9,
          filler: false,
        })),
      },
      reel: plan,
    }),
  );
  store.getState().exec(
    addReelNote('r1', {
      id: 'n1',
      tMs: 1200,
      shape: { kind: 'circle', points: [0.5, 0.2, 0.3, 0.06] },
      text: 'make this say AI does the heavy lifting',
      status: 'open',
    }),
  );
  const credits = new LocalCredits(50);
  const seen: unknown[] = [];
  const look = vi.fn(async () => ({
    target: { parts: ['graphic' as const], texts: ['Seamlessly and let AI'], pictures: [] },
  }));
  const deps: ReelNoteFixDeps = {
    store,
    credits,
    getRouter: async () => stubRouter(answer, seen),
    look,
    ...extra,
  };
  const scene = () => store.getState().project!.reel!.scenes[0]!;
  return { store, credits, deps, look, scene, seen };
}

const titleAnswer = {
  action: 'edit',
  message: 'Changed the title.',
  graphic: {
    template: 'list',
    title: 'AI does the heavy lifting',
    items: [
      { word: 1, text: 'Train fast', icon: 'video' },
      { word: 3, text: 'Write well', icon: 'check' },
    ],
  },
};

describe('runReelNoteFix (spec 29 R4)', () => {
  it('applies the change and marks the note fixed in one undo step, charging 1 credit', async () => {
    const { deps, store, scene, credits, seen, look } = setup(titleAnswer);
    const before = store.getState().project;
    const r = await runReelNoteFix(deps, 'r1', 'n1', CLOUD);
    expect(r).toMatchObject({ kind: 'applied', ranOn: 'cloud', message: 'Changed the title.' });
    const c = scene().content as Extract<
      ReelPlan['scenes'][number]['content'],
      { template: 'list' }
    >;
    expect(c.title).toBe('AI does the heavy lifting');
    // Items that stayed keep their exact cues.
    expect(c.items.map((x) => x.at)).toEqual([700, 1700]);
    expect(scene().notes![0]!.status).toBe('fixed');
    expect(credits.balance()).toBe(49);
    // What the model was told.
    expect(seen[0]).toMatchObject({
      target: { parts: ['graphic'], texts: ['Seamlessly and let AI'] },
      hook: 'Six tools',
      note: { text: 'make this say AI does the heavy lifting' },
    });
    expect(look).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), 'r1');
    store.getState().undo();
    expect(store.getState().project).toEqual(before);
  });

  it('is free on the device', async () => {
    const { deps, credits } = setup(titleAnswer);
    const r = await runReelNoteFix(deps, 'r1', 'n1', DEVICE);
    expect(r.kind).toBe('applied');
    expect(credits.balance()).toBe(50);
  });

  it('"none" leaves the scene, refunds, and passes the reason on', async () => {
    const { deps, credits, scene } = setup({
      action: 'none',
      message: 'Fonts are fixed in this look.',
    });
    const before = scene();
    const r = await runReelNoteFix(deps, 'r1', 'n1', CLOUD);
    expect(r).toEqual({ kind: 'escalate', message: 'Fonts are fixed in this look.' });
    expect(scene()).toEqual(before);
    expect(credits.balance()).toBe(50);
  });

  it('a broken answer fails, refunds and changes nothing', async () => {
    const { deps, credits, scene } = setup({
      action: 'edit',
      message: 'x',
      graphic: { template: 'list', title: 'x', items: [] },
    });
    const before = scene();
    expect(await runReelNoteFix(deps, 'r1', 'n1', CLOUD)).toEqual({ kind: 'cloud-failed' });
    expect(await runReelNoteFix(deps, 'r1', 'n1', DEVICE)).toEqual({ kind: 'device-failed' });
    expect(scene()).toEqual(before);
    expect(credits.balance()).toBe(50);
  });

  it('never overwrites an edit made while the model worked', async () => {
    let store: ReturnType<typeof setup>['store'] | null = null;
    const t = setup(() => {
      // The user changes the scene mid-call.
      store!
        .getState()
        .exec(fixReelScene('r1', { scene: { ...plan.scenes[0]!, tag: 'CHANGED' } }, 'Edit'));
      return titleAnswer;
    });
    store = t.store;
    expect(await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD)).toEqual({ kind: 'changed' });
    expect(t.scene().tag).toBe('CHANGED');
    expect(t.credits.balance()).toBe(50);
  });

  it('fixes a caption word and the hook', async () => {
    const { deps, store } = setup({
      action: 'edit',
      message: 'Fixed the caption.',
      hook: 'Six AI tools',
      captions: [{ find: 'icachi', replace: 'eye-catching' }],
    });
    const r = await runReelNoteFix(deps, 'r1', 'n1', CLOUD);
    expect(r.kind).toBe('applied');
    const p = store.getState().project!;
    expect(p.transcript.words[2]!.text).toBe('eye-catching');
    expect(p.reel!.hook).toBe('Six AI tools');
  });

  it('fetches a new picture after the edit lands, as its own step', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const onPictures = vi.fn();
    const fetchMedia = vi.fn(async (p: ReelPlan) => {
      await gate;
      const s = p.scenes[0]!;
      const content =
        s.content.template === 'logo'
          ? { ...s.content, media: { ...s.content.media, asset: 'img1' } }
          : s.content;
      return {
        plan: { ...p, scenes: [{ ...s, content }] },
        assets: [
          {
            id: 'img1',
            hash: 'h',
            status: 'ready' as const,
            source: 'logo' as const,
            subject: 'Acme',
            keyed: false,
            src: 'media:h.webp',
          },
        ],
      };
    });
    const { deps, scene } = setup(
      {
        action: 'edit',
        message: 'Showing the Acme logo.',
        graphic: { template: 'logo', brand: 'Acme', sub: 'My tool' },
        brands: [{ name: 'Acme', domain: 'acme.example' }],
      },
      { fetchMedia, onPictures },
    );
    const r = await runReelNoteFix(deps, 'r1', 'n1', CLOUD);
    expect(r).toMatchObject({ kind: 'applied', pictures: 1 });
    // The edit shows at once, with the designed fallback until the picture lands.
    expect(scene().content).toMatchObject({
      template: 'logo',
      media: { query: 'Acme|acme.example' },
    });
    release();
    await vi.waitFor(() => expect(onPictures).toHaveBeenCalledWith(1));
    expect(scene().content).toMatchObject({ media: { asset: 'img1' } });
    expect(scene().notes![0]!.status).toBe('fixed');
  });
});
