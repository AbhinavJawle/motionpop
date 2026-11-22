import type { Router, RunResult, TaskDef } from '@motionpop/ai';
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import { EditorProjectSchema, type ReelPlan } from '@motionpop/schemas';
import { describe, expect, it, vi } from 'vitest';
import type { Route } from '@/lib/ai/route';
import { addReelNote, fixReelScene, setReel } from '@/lib/commands';
import { LocalCredits } from '@/lib/credits/local-credits';
import { createEditorStore } from '@/lib/stores/editor';
import type { CustomReport, ReelCustomAssets, ReelCustomScene } from '@motionpop/motion/reel';
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
type Answer = unknown | ((taskId: string, input: unknown) => unknown);

function stubRouter(answer: Answer, seen: unknown[] = []): Router {
  return {
    async run<I, O>(task: TaskDef<I, O>, input: I): Promise<RunResult<O>> {
      seen.push(input);
      const raw =
        typeof answer === 'function'
          ? (answer as (id: string, input: unknown) => unknown)(task.id, input)
          : answer;
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

function setup(answer: Answer, extra: Partial<ReelNoteFixDeps> = {}) {
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

  it('runs on the strong cloud model only: a device route is blocked and spends nothing (spec 30)', async () => {
    const { deps, credits, seen } = setup(titleAnswer);
    const r = await runReelNoteFix(deps, 'r1', 'n1', DEVICE);
    expect(r).toEqual({ kind: 'blocked', reason: 'Needs cloud AI' });
    expect(seen).toHaveLength(0);
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

// ----- spec 30: a note that needs a new motion graphic ---------------------------------------------

const ASSETS: ReelCustomAssets = { js: '/* runtime */', fontCss: '' };
const CLEAN: CustomReport = {
  summary: {
    reports: [],
    stats: {
      textWords: 3,
      texts: ['Heavy lifting'],
      shapes: 2,
      hasMap: false,
      hasPaper: false,
      distinctFrames: 4,
      samples: 8,
    },
  },
  errors: [],
};
const BROKEN: CustomReport = { summary: null, errors: ['tl.from is not a function'] };
const CROWDED: CustomReport = {
  summary: {
    ...CLEAN.summary!,
    reports: [
      {
        rule: 'off-frame',
        level: 'fix',
        atMs: 900,
        hint: '"Heavy lifting" runs off the right edge',
      },
    ],
  },
  errors: [],
};

const composeNote = {
  action: 'compose',
  message: 'Making it snappier with clearer icons.',
  compose:
    'Rebuild the list as a snappy two-step flow: "Train fast" and "Write well" with bold icons, each landing on its spoken word, title "AI does the heavy lifting".',
};
const graphic = (title = 'Snappy flow') => ({
  title,
  brief: 'Two steps with icons, landing on the words.',
  html: '<div class="t">Heavy lifting</div>',
  css: '.t { font-size: calc(var(--u) * 8); color: var(--ink); }',
  script:
    'const tl = mp.timeline();\ntl.from(".t", { y: 30, opacity: 0 }, { at: 0, dur: 240, ease: "outStrong" });\nreturn tl;',
  keyMomentMs: 700,
  newPictures: [],
  message: 'Rebuilt it as a snappy flow.',
});

function composeSetup(opts: {
  reports?: CustomReport[];
  answers?: unknown[];
  assets?: ReelCustomAssets | null;
  plan?: ReelPlan;
}) {
  const answers = [...(opts.answers ?? [graphic()])];
  const reports = [...(opts.reports ?? [CLEAN])];
  const inspect = vi.fn<
    (
      scene: Omit<ReelCustomScene, 'token'>,
      assets: ReelCustomAssets,
      allow: string[],
    ) => Promise<CustomReport>
  >(async () => reports.shift() ?? CLEAN);
  const onStage = vi.fn();
  const t = setup((id: string) => (id === 'reel.note' ? composeNote : answers.shift()), {
    customAssets: async () => (opts.assets === undefined ? ASSETS : opts.assets),
    inspect,
    onStage,
  });
  return { ...t, inspect, onStage };
}

describe('runReelNoteFix: new motion graphics (spec 30)', () => {
  it('writes the scene a new graphic, reviews it, and applies it as one undo step', async () => {
    const t = composeSetup({});
    const before = t.store.getState().project;
    const r = await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD);
    expect(r).toMatchObject({
      kind: 'applied',
      composed: true,
      message: 'Rebuilt it as a snappy flow.',
    });
    const s = t.scene();
    expect(s).toMatchObject({
      id: 'r1',
      startMs: 0,
      endMs: 3000,
      layout: 'split',
      tag: 'MY STACK',
    });
    expect(s.content).toMatchObject({ template: 'custom', title: 'Snappy flow', keyMomentMs: 700 });
    expect(s.notes![0]!.status).toBe('fixed');
    // 1 for the note, 3 for the new graphic.
    expect(t.credits.balance()).toBe(46);
    // What the writer was told: the note, the brief, the area and what is there now.
    expect(t.seen[1]).toMatchObject({
      note: 'make this say AI does the heavy lifting',
      brief: composeNote.compose,
      look: 'mono',
      layout: 'split',
      area: { w: 720, h: 640 },
      durationMs: 3000,
      current: { kind: 'template', graphic: { template: 'list', title: 'Seamlessly and let AI' } },
    });
    // The review ran on the same scene the preview will build.
    expect(t.inspect).toHaveBeenCalledTimes(1);
    expect(t.inspect.mock.calls[0]![0]).toMatchObject({
      width: 720,
      height: 640,
      durationMs: 3000,
    });
    expect(t.onStage.mock.calls.map((c) => c[0])).toEqual(['compose', 'check']);
    t.store.getState().undo();
    expect(t.store.getState().project).toEqual(before);
  });

  it("sends the review's problems back for one repair, then applies the repaired graphic", async () => {
    const t = composeSetup({
      reports: [CROWDED, CLEAN],
      answers: [graphic('First'), graphic('Second')],
    });
    const r = await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD);
    expect(r.kind).toBe('applied');
    expect(t.scene().content).toMatchObject({ template: 'custom', title: 'Second' });
    expect(t.seen[2]).toMatchObject({
      fix: { problems: expect.stringContaining('runs off the right edge') },
    });
    expect(t.onStage.mock.calls.map((c) => c[0])).toEqual(['compose', 'check', 'repair', 'check']);
    expect(t.credits.balance()).toBe(46);
  });

  it('a graphic that still fails to build after the repair is never applied, and both spends come back', async () => {
    const t = composeSetup({ reports: [BROKEN, BROKEN], answers: [graphic(), graphic()] });
    const before = t.scene();
    expect(await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD)).toEqual({ kind: 'cloud-failed' });
    expect(t.scene()).toEqual(before);
    expect(t.credits.balance()).toBe(50);
  });

  it("layout notes that survive the repair don't block the graphic", async () => {
    const t = composeSetup({ reports: [CROWDED, CROWDED], answers: [graphic(), graphic('Kept')] });
    expect((await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD)).kind).toBe('applied');
    expect(t.scene().content).toMatchObject({ title: 'Kept' });
  });

  it('without the scene runtime nothing is written and the note credit comes back', async () => {
    const t = composeSetup({ assets: null });
    const before = t.scene();
    expect(await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD)).toEqual({ kind: 'cloud-failed' });
    expect(t.seen).toHaveLength(1);
    expect(t.scene()).toEqual(before);
    expect(t.credits.balance()).toBe(50);
  });

  it('a note on an AI-written scene revises its code', async () => {
    const t = composeSetup({ answers: [graphic(), graphic('Revised')] });
    await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD);
    t.store.getState().exec(
      addReelNote('r1', {
        id: 'n2',
        tMs: 900,
        shape: { kind: 'circle', points: [0.5, 0.2, 0.3, 0.06] },
        text: 'make the title bigger',
        status: 'open',
      }),
    );
    const r = await runReelNoteFix(t.deps, 'r1', 'n2', CLOUD);
    expect(r.kind).toBe('applied');
    // The note model saw the scene as an AI-written graphic, and the writer got its code.
    expect(t.seen[2]).toMatchObject({
      scene: { graphic: { template: 'custom', title: 'Snappy flow' } },
    });
    expect(t.seen[3]).toMatchObject({
      current: { kind: 'custom', title: 'Snappy flow', html: '<div class="t">Heavy lifting</div>' },
    });
    expect(t.scene().content).toMatchObject({ template: 'custom', title: 'Revised' });
  });

  it('a repair that breaks a graphic which only had layout notes keeps the first graphic', async () => {
    const t = composeSetup({
      reports: [CROWDED, BROKEN],
      answers: [graphic('First'), graphic('Broken repair')],
    });
    expect((await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD)).kind).toBe('applied');
    expect(t.scene().content).toMatchObject({ template: 'custom', title: 'First' });
    expect(t.credits.balance()).toBe(46);
  });

  it('marks pictures that are not fetched yet so the writer avoids them', async () => {
    const t = composeSetup({ answers: [graphic(), graphic('Revised')] });
    await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD);
    // Give the AI-written scene a picture that was never fetched.
    const s = t.scene();
    if (s.content.template !== 'custom') throw new Error('expected a custom scene');
    t.store.getState().exec(
      fixReelScene('r1', {
        scene: { ...s, content: { ...s.content, media: [{ kind: 'photo', query: 'a desk' }] } },
      }),
    );
    t.store.getState().exec(
      addReelNote('r1', {
        id: 'n2',
        tMs: 900,
        shape: { kind: 'circle', points: [0.5, 0.2, 0.3, 0.06] },
        text: 'more color',
        status: 'open',
      }),
    );
    await runReelNoteFix(t.deps, 'r1', 'n2', CLOUD);
    expect(t.seen[3]).toMatchObject({
      pictures: [{ id: 'm0', shows: expect.stringContaining('(not fetched: avoid)') }],
    });
  });
});

describe('runReelNoteFix: reads the note frame (spec 29 review)', () => {
  it('pauses on the note time and reads the preview before anything is spent', async () => {
    let atLook: { playing: boolean; playheadMs: number; balance: number | null } | null = null;
    const t = setup(titleAnswer);
    t.deps.look = async () => {
      const st = t.store.getState();
      atLook = { playing: st.playing, playheadMs: st.playheadMs, balance: t.credits.balance() };
      return { target: { parts: ['graphic'], texts: ['Seamlessly and let AI'], pictures: [] } };
    };
    t.store.getState().setPlayhead(2500);
    t.store.getState().setPlaying(true);
    expect((await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD)).kind).toBe('applied');
    // Scene r1 starts at 0 and the note sits at 1200 ms.
    expect(atLook).toEqual({ playing: false, playheadMs: 1200, balance: 50 });
  });

  it('a capture that fails still runs the note without a picture', async () => {
    const t = setup(titleAnswer, {
      look: () => {
        throw new Error('capture blew up');
      },
    });
    expect((await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD)).kind).toBe('applied');
  });
});

describe('runReelNoteFix: the custom code budget (spec 30 review)', () => {
  it('a reel without room for another graphic is told so before anything is spent on it', async () => {
    const t = composeSetup({});
    // Three big AI-written scenes in CJK text (3 bytes a character) fill the 400 kB budget.
    const big = (id: string, startMs: number) => ({
      id,
      startMs,
      endMs: startMs + 1000,
      layout: 'speaker' as const,
      content: {
        template: 'custom' as const,
        title: 'Big',
        brief: 'Big.',
        html: '漢'.repeat(12_000),
        css: '漢'.repeat(12_000),
        script: '漢'.repeat(24_000),
      },
    });
    const reel = t.store.getState().project!.reel!;
    t.store.getState().exec(
      setReel({
        ...reel,
        scenes: [reel.scenes[0]!, big('b1', 3000), big('b2', 4000), big('b3', 5000)],
      }),
    );
    const before = t.scene();
    expect(await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD)).toEqual({
      kind: 'blocked',
      reason: 'This reel holds too many new graphics. Undo one first.',
    });
    // Only the note model ran; the writer never did, and the note credit came back.
    expect(t.seen).toHaveLength(1);
    expect(t.scene()).toEqual(before);
    expect(t.credits.balance()).toBe(50);
  });
});

describe('runReelNoteFix: credits never stick on an unexpected throw (spec 30 review)', () => {
  it('a throw after the note credit was spent refunds it', async () => {
    const t = setup(titleAnswer, {
      getRouter: () => {
        throw new Error('router blew up');
      },
    });
    const before = t.scene();
    expect(await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD)).toEqual({ kind: 'cloud-failed' });
    expect(t.scene()).toEqual(before);
    expect(t.credits.balance()).toBe(50);
  });

  it('a throw while building the writer input refunds both spends', async () => {
    const t = composeSetup({});
    t.deps.customPictures = () => {
      throw new Error('pictures blew up');
    };
    const before = t.scene();
    expect(await runReelNoteFix(t.deps, 'r1', 'n1', CLOUD)).toEqual({ kind: 'cloud-failed' });
    expect(t.scene()).toEqual(before);
    expect(t.credits.balance()).toBe(50);
  });
});
