import {
  pipPlanJsonSchema,
  pipPlanTask,
  pipQuickToModelOutput,
  reelDraftLocalTask,
  reelNoteLocalTask,
  pipQuickTask,
  type Router,
  type RunResult,
  type TaskDef,
} from '@motionpop/ai';
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import {
  EditorProjectSchema,
  audioOf,
  type EditorProject,
  type PipModelOutput,
  type ReelPlan,
} from '@motionpop/schemas';
import { describe, expect, it, vi } from 'vitest';
import { createFakeRouter, pipAnswer } from '@/lib/ai/fake-router';
import type { Route } from '@/lib/ai/route';
import { LocalCredits } from '@/lib/credits/local-credits';
import { createEditorStore } from '@/lib/stores/editor';
import { applyPlan, type ApplyDeps } from './apply';
import { chipsFor, codePlan, enforcePlan, pipInput, sceneRefs, sceneText } from './plan';
import { newConversation, sendToPip, usePip } from './use-pip';

// Spec 37: Pip on a video reel.

const plan: ReelPlan = {
  v: 1,
  look: 'mono',
  focus: { x: 0.5, y: 0.32 },
  captions: true,
  scenes: [
    {
      id: 'a',
      startMs: 3000,
      endMs: 6000,
      layout: 'split',
      bg: 'light',
      content: { template: 'headline', title: 'Revenue doubled' },
    },
    {
      id: 'b',
      startMs: 0,
      endMs: 3000,
      layout: 'split',
      content: {
        template: 'list',
        title: 'Three wins',
        items: [
          { icon: 'zap', text: 'Faster', at: 400 },
          { icon: 'target', text: 'Cheaper', at: 900 },
        ],
      },
    },
    { id: 'c', startMs: 6000, endMs: 9000, layout: 'speaker', content: { template: 'none' } },
  ],
};

function project(): EditorProject {
  const base = fixtureProject({ slots: [], durationMs: 9000 });
  return EditorProjectSchema.parse({
    ...base,
    transcript: {
      ...base.transcript,
      words: Array.from({ length: 12 }, (_, i) => ({
        i,
        text: `w${i}`,
        startMs: 100 + i * 700,
        endMs: 100 + i * 700 + 500,
        conf: 0.9,
        filler: false,
      })),
    },
    reel: plan,
  });
}

const none = { slot: 'none', choice: 'none', atWord: -1, instruction: '' };
const out = (steps: Partial<PipModelOutput['steps'][number]>[]): PipModelOutput => ({
  reply: 'Here’s the plan',
  steps: steps.map((s) => ({
    ...none,
    action: 'setSound',
    label: 'x',
    ...s,
  })) as PipModelOutput['steps'],
});

describe('Pip sees the reel (R1)', () => {
  it('sends every scene in time order with refs, text and the reel state', () => {
    const input = pipInput(project(), { kind: 'video' }, [], 'more colour please');
    const r = input.project.reel!;
    expect(r.scenes.map((s) => s.ref)).toEqual(['r1', 'r2', 'r3']);
    expect(r.scenes[0]).toMatchObject({ template: 'list', layout: 'split', startMs: 0 });
    expect(r.scenes[0]!.text).toContain('Three wins');
    expect(r.scenes[0]!.text).toContain('Faster');
    expect(r.theme).toContain('black and white');
    expect(r.sound).toContain('effects on');
    // The task accepts it, and the prompt tells the model it is a reel with graphics.
    expect(pipPlanTask().input.safeParse(input).success).toBe(true);
    const prompt = pipPlanTask().prompt(input);
    expect(prompt).toContain('VIDEO REEL with 2 motion graphic scenes');
    expect(prompt).toContain('r2 3.0-6.0s split headline "Revenue doubled"');
  });

  it('structured output: scene refs, reel choices, under 64 choices', () => {
    const schema = pipPlanJsonSchema(pipInput(project(), { kind: 'video' }, [], 'x')) as {
      properties: { steps: { items: { properties: Record<string, { enum: string[] }> } } };
    };
    const props = schema.properties.steps.items.properties;
    expect(props.slot!.enum).toEqual(['r1', 'r2', 'r3', 'none']);
    expect(props.choice!.enum).toEqual(expect.arrayContaining(['bold', 'mono', 'whoosh', 'ai']));
    expect(props.choice!.enum.length).toBeLessThanOrEqual(64);
    expect(props.action!.enum).toContain('editScene');
  });

  it('sceneText skips code and ids', () => {
    expect(
      sceneText({ template: 'custom', title: 'Hi', html: '<div>', script: 'x', brief: 'a b' }),
    ).toBe('Hi · a b');
  });
});

describe('enforcePlan on a reel (R1.3, R4)', () => {
  const p = project();
  const refs = sceneRefs(p);

  it('resolves scene refs and prices scene edits', () => {
    const r = enforcePlan(
      out([
        { action: 'editScene', slot: 'r2', instruction: 'make it colourful', label: 'Redo' },
        { action: 'updateSlot', slot: 'r1', instruction: 'bigger', label: 'Bigger' },
        { action: 'removeSlot', slot: 'r3', label: 'Clear' },
        { action: 'editScene', slot: 'r9', instruction: 'x', label: 'Ghost' },
        { action: 'regenerateReel', label: 'Again' },
      ]),
      p,
      'cloud',
    );
    expect(r.steps.map((s) => [s.action, s.sceneId])).toEqual([
      ['editScene', refs.get('r2')],
      ['editScene', refs.get('r1')],
      ['clearScene', refs.get('r3')],
      ['regenerateReel', undefined],
    ]);
    expect(r.steps[0]!.credits).toBe(1);
    expect(r.steps[3]!.credits).toBe(3);
    expect(r.dropped).toEqual([{ label: 'Ghost', reason: 'That scene isn’t in the reel' }]);
  });

  it('parses theme colours, sound, music and added sounds', () => {
    const r = enforcePlan(
      out([
        { action: 'setReelTheme', choice: 'bold', instruction: 'orange #ff5a36 and #7c5cff' },
        { action: 'setReelTheme', choice: 'soft', instruction: 'something warm' },
        { action: 'setSound', choice: 'quieter' },
        { action: 'setSound', choice: 'clear' },
        { action: 'setMusic', choice: 'ai', instruction: 'upbeat lo-fi, 100 bpm' },
        { action: 'addSound', choice: 'whoosh', atWord: 3 },
        { action: 'addSound', choice: 'whoosh', atWord: 99 },
        { action: 'setReelLook', choice: 'mono' },
        { action: 'setReelLook', choice: 'cream' },
      ]),
      p,
      'cloud',
    );
    expect(r.steps.map((s) => s.action)).toEqual([
      'setReelTheme',
      'setSound',
      'setMusic',
      'addSound',
      'setReelLook',
    ]);
    expect(r.steps[0]!.theme).toEqual({
      accent: '#FF5A36',
      accent2: '#7C5CFF',
      background: 'bold',
    });
    expect(r.steps[2]).toMatchObject({ music: 'ai', instruction: 'upbeat lo-fi, 100 bpm' });
    expect(r.steps[3]).toMatchObject({ sfxKind: 'whoosh', atWord: 3 });
    expect(r.steps[4]!.look).toBe('cream');
    expect(r.dropped.map((d) => d.reason)).toEqual([
      'No colours were given',
      'There are no added sounds',
      'No word to put it on',
      'The reel already has that look',
    ]);
  });

  it('AI music needs a brief', () => {
    const r = enforcePlan(
      out([{ action: 'setMusic', choice: 'ai', instruction: ' ' }]),
      p,
      'cloud',
    );
    expect(r.dropped[0]!.reason).toBe('No music brief was given');
  });

  it('reel actions are dropped on voiceover projects', () => {
    const vo = EditorProjectSchema.parse(fixtureProject({ durationMs: 9000 }));
    const r = enforcePlan(out([{ action: 'setReelTheme', instruction: '#FF0000' }]), vo, 'cloud');
    expect(r.steps).toEqual([]);
    expect(r.dropped[0]!.reason).toBe('Only for video reels');
  });
});

describe('chips and the quick planner on a reel', () => {
  it('offers reel chips that build reel plans', () => {
    const p = project();
    expect(chipsFor(p).map((c) => c.id)).toEqual([
      'reelColour',
      'reelSfx',
      'reelMusic',
      'captions',
      'reelLook',
    ]);
    expect(codePlan('reelColour', p).steps[0]).toMatchObject({ action: 'setReelTheme' });
    expect(codePlan('captions', p).steps[0]).toMatchObject({ captions: 'off' });
  });

  it('the quick planner answers colour and better graphics on a reel', () => {
    const p = project();
    const ans = pipAnswer(
      pipInput(
        p,
        { kind: 'video' },
        [],
        'too black and white, add lots of colours and make the animations better',
      ),
    );
    const r = enforcePlan(ans, p, 'code');
    expect(r.steps[0]).toMatchObject({ action: 'setReelTheme', theme: { background: 'bold' } });
    expect(r.steps.filter((s) => s.action === 'editScene')).toHaveLength(2);
  });
});

const cloud: Route = { kind: 'cloud', credits: 1 } as Route;

function storeWith(p: EditorProject) {
  const store = createEditorStore(() => 1000);
  store.getState().load(p);
  return store;
}

function deps(store: ReturnType<typeof storeWith>, extra: Partial<ApplyDeps> = {}): ApplyDeps {
  return {
    store,
    credits: null,
    getRouter: async () => null,
    editRoute: cloud,
    generateRoute: cloud,
    ...extra,
  } as ApplyDeps;
}

describe('applyPlan on a reel (R2, R3)', () => {
  it('theme, sound, music, added sound and captions land as one undo step', async () => {
    const p = project();
    const store = storeWith(p);
    const plan = enforcePlan(
      out([
        { action: 'setReelTheme', choice: 'soft', instruction: '#FF5A36' },
        { action: 'setSound', choice: 'louder' },
        { action: 'setMusic', choice: 'steady-pulse' },
        { action: 'addSound', choice: 'impact', atWord: 2 },
        { action: 'setCaptions', choice: 'off' },
        { action: 'clearScene', slot: 'r2' },
      ]),
      p,
      'cloud',
    );
    const r = await applyPlan(deps(store), plan, () => {});
    expect(r.changes).toBe(6);
    const next = store.getState().project!;
    expect(next.reel!.theme).toEqual({ accent: '#FF5A36', background: 'soft' });
    expect(audioOf(next)).toMatchObject({ sfxGainDb: 4, musicId: 'steady-pulse' });
    expect(next.reel!.sfx).toEqual([{ kind: 'impact', atMs: 1500, gainDb: -2 }]);
    expect(next.reel!.captions).toBe(false);
    expect(next.reel!.scenes.find((s) => s.id === 'a')).toMatchObject({
      layout: 'speaker',
      content: { template: 'none' },
    });
    expect(r.entries).toHaveLength(1);
    store.getState().undo();
    expect({ ...store.getState().project, updatedAt: 0 }).toEqual({ ...p, updatedAt: 0 });
  });

  it('editScene adds a whole-frame note with the brief and runs the reel note fix', async () => {
    const p = project();
    const store = storeWith(p);
    const reelNote = vi.fn(async () => ({
      kind: 'applied' as const,
      ms: 10,
      ranOn: 'cloud' as const,
      message: 'ok',
      pictures: 0,
    }));
    const plan = enforcePlan(
      out([{ action: 'editScene', slot: 'r2', instruction: 'gradient bars, bold type' }]),
      p,
      'cloud',
    );
    const r = await applyPlan(deps(store, { reelNote, newId: () => 'n1' }), plan, () => {});
    expect(reelNote).toHaveBeenCalledWith('a', 'pip-n1');
    const note = store.getState().project!.reel!.scenes.find((s) => s.id === 'a')!.notes![0]!;
    expect(note).toMatchObject({ id: 'pip-n1', text: 'gradient bars, bold type', status: 'open' });
    expect(r.states[plan.steps[0]!.id]!.state).toBe('done');
  });

  it('a scene edit that fails is skipped with a reason; no runner means no cloud', async () => {
    const p = project();
    const store = storeWith(p);
    const plan = enforcePlan(
      out([{ action: 'editScene', slot: 'r1', instruction: 'x' }]),
      p,
      'cloud',
    );
    const a = await applyPlan(
      deps(store, { reelNote: async () => ({ kind: 'no-credits' }) }),
      plan,
      () => {},
    );
    expect(a.states[plan.steps[0]!.id]).toEqual({ state: 'skipped', reason: 'Out of credits' });
    const b = await applyPlan(deps(storeWith(p)), plan, () => {});
    expect(b.states[plan.steps[0]!.id]!.reason).toBe('Scene edits need cloud AI');
  });

  it('AI music runs after the instant steps through the music runner', async () => {
    const p = project();
    const store = storeWith(p);
    const reelMusic = vi.fn(async () => true);
    const plan = enforcePlan(
      out([{ action: 'setMusic', choice: 'ai', instruction: 'warm piano' }]),
      p,
      'cloud',
    );
    const r = await applyPlan(deps(store, { reelMusic }), plan, () => {});
    expect(reelMusic).toHaveBeenCalledWith('warm piano');
    expect(r.changes).toBe(1);
  });
});

describe('hybrid on-device Pip (`pip.quick`) + fake router end-to-end', () => {
  const DEVICE: Route = { kind: 'device', mode: 'ONLY_ON_DEVICE', allowCloud: false };
  const CLOUD: Route = {
    kind: 'cloud',
    mode: 'ONLY_IN_CLOUD',
    allowCloud: false,
    credits: 2,
    insufficient: false,
  };
  const OFFLINE: Route = { kind: 'disabled', reason: 'Needs connection' };

  function stubRouter(answer: (id: string) => unknown): Router {
    return {
      async run<I, O>(task: TaskDef<I, O>): Promise<RunResult<O>> {
        const output = task.output.parse(answer(task.id));
        return {
          output,
          ranOn: task.id === 'pip.quick' ? 'device' : 'cloud',
          model: task.id === 'pip.quick' ? 'gemini-nano' : 'gemini-cloud',
          costCredits: task.id === 'pip.quick' ? 0 : 2,
          latencyMs: 6,
          attempts: 1,
          cached: false,
        };
      },
    };
  }

  it('every pip.quick reel action survives enforcePlan without being dropped', () => {
    const p = project();
    const modelOut = pipQuickToModelOutput({
      escalate: false,
      reply: 'Updated look, theme, captions, sound, music, and cleared r2.',
      steps: [
        { action: 'setReelLook', label: 'Cream look', choice: 'cream' },
        { action: 'setReelTheme', label: 'Warm accent', choice: '#FF5A36 bold' },
        { action: 'setCaptions', label: 'Captions off', choice: 'off' },
        { action: 'setSound', label: 'Quieter SFX', choice: 'quieter' },
      ],
    });
    expect(modelOut).not.toBeNull();
    const enforced = enforcePlan(modelOut!, p, 'device');
    expect(enforced.dropped).toEqual([]);
    expect(enforced.steps.map((s) => s.action)).toEqual([
      'setReelLook',
      'setReelTheme',
      'setCaptions',
      'setSound',
    ]);
    expect(enforced.steps[1]!.theme).toEqual({ accent: '#FF5A36', background: 'bold' });
    expect(enforced.steps.every((s) => s.credits === 0)).toBe(true);

    // Also test setMusic + clearScene on the same reel.
    const modelOut2 = pipQuickToModelOutput({
      escalate: false,
      reply: 'Music and clear scene',
      steps: [
        { action: 'setMusic', label: 'Calm pad', choice: 'calm-pad' },
        { action: 'clearScene', label: 'Clear r2', slot: 'r2' },
      ],
    });
    const enforced2 = enforcePlan(modelOut2!, p, 'device');
    expect(enforced2.dropped).toEqual([]);
    expect(enforced2.steps.map((s) => s.action)).toEqual(['setMusic', 'clearScene']);
  });

  it('sendToPip runs simple commands on-device (0 credits, works offline) and escalates complex ones to cloud', async () => {
    const p = project();
    const store = createEditorStore(() => 1000);
    store.getState().load(p);
    const credits = new LocalCredits(20);

    // 1. Offline + Nano ready: simple command succeeds on-device with 0 credits!
    newConversation();
    const cloudSpy = vi.fn();
    await sendToPip(
      {
        store,
        credits,
        route: OFFLINE,
        deviceRoute: DEVICE,
        getRouter: async () =>
          stubRouter((id) => {
            if (id === 'pip.quick') {
              return {
                escalate: false,
                reply: 'Switched to cream on-device!',
                steps: [{ action: 'setReelLook', label: 'Switch to cream', choice: 'cream' }],
              };
            }
            cloudSpy();
            throw new Error('should not call cloud');
          }),
      },
      'switch to cream look',
      { kind: 'video' },
    );
    const last1 = usePip.getState().messages.at(-1)!;
    expect(last1.ranOn).toBe('device');
    expect(last1.credits).toBe(0);
    expect(last1.plan?.steps[0]?.action).toBe('setReelLook');
    expect(cloudSpy).not.toHaveBeenCalled();
    expect(credits.balance()).toBe(20);

    // 2. Online + Nano escalates: seamlessly hands off to cloud `pip.plan` (2 credits).
    newConversation();
    await sendToPip(
      {
        store,
        credits,
        route: CLOUD,
        deviceRoute: DEVICE,
        getRouter: async () =>
          stubRouter((id) => {
            if (id === 'pip.quick') return { escalate: true, reply: 'Needs cloud', steps: [] };
            return out([
              {
                action: 'editScene',
                slot: 'r2',
                instruction: 'redesign as an animated chart',
                label: 'Redesign r2',
              },
            ]);
          }),
      },
      'redesign scene 2 as a custom animated bar chart',
      { kind: 'video' },
    );
    const last2 = usePip.getState().messages.at(-1)!;
    expect(last2.ranOn).toBe('cloud');
    expect(last2.credits).toBe(2);
    expect(credits.balance()).toBe(18);

    // 3. Offline + Nano throws: cleanly falls back to code planner with 0 credits.
    newConversation();
    await sendToPip(
      {
        store,
        credits: null,
        route: OFFLINE,
        deviceRoute: DEVICE,
        getRouter: async () =>
          stubRouter(() => {
            throw new Error('Nano crashed');
          }),
      },
      'turn captions off',
      { kind: 'video' },
    );
    const last3 = usePip.getState().messages.at(-1)!;
    expect(last3.ranOn).toBe('code');
    expect(last3.credits).toBe(0);
    expect(last3.plan?.steps[0]?.action).toBe('setCaptions');
  });

  it('fake router handles reel.note.local, pip.quick, and reel.draft deterministically and respects ?device=off', async () => {
    const router = createFakeRouter({ latencyMs: 0, sleep: async () => {} });
    const noteRes = await router.run(reelNoteLocalTask(), {
      look: 'mono',
      noteText: 'make background dark',
      sceneTemplate: 'headline',
      sceneLayout: 'split',
      sceneTexts: ['Revenue doubled'],
    });
    expect(noteRes.ranOn).toBe('device');
    expect(noteRes.output).toMatchObject({ action: 'edit', bg: 'dark' });

    const pipRes = await router.run(pipQuickTask(), {
      message: 'switch to cream and make colours vibrant',
      format: '9:16',
      styleId: 'editorial-cream',
      captionsOn: true,
      hasReel: true,
      reelLook: 'mono',
      sceneRefs: ['r1 (headline)'],
      slotRefs: [],
    });
    expect(pipRes.ranOn).toBe('device');
    expect(pipRes.output.escalate).toBe(false);
    expect(pipRes.output.steps.length).toBeGreaterThanOrEqual(2);

    const draftRes = await router.run(reelDraftLocalTask(), {
      look: 'mono' as const,
      durationMs: 9000,
      words: [
        [0, 'Revenue'] as [number, string],
        [1, 'grew'] as [number, string],
        [2, 'forty'] as [number, string],
        [3, 'percent'] as [number, string],
        [4, 'last'] as [number, string],
        [5, 'year'] as [number, string],
      ],
    });
    expect(draftRes.ranOn).toBe('device');
    expect(draftRes.output.beats.length).toBeGreaterThanOrEqual(2);

    const offRouter = createFakeRouter({
      search: '?device=off',
      latencyMs: 0,
      sleep: async () => {},
    });
    await expect(
      offRouter.run(pipQuickTask(), {
        message: 'switch to cream',
        format: '9:16',
        styleId: 'editorial-cream',
        captionsOn: true,
        hasReel: true,
        sceneRefs: [],
        slotRefs: [],
      }),
    ).rejects.toThrow(/On-device AI is off/);
  });
});
