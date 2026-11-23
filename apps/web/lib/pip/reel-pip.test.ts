import { pipPlanJsonSchema, pipPlanTask } from '@motionpop/ai';
import { fixtureProject } from '@motionpop/motion/testing/project-fixture';
import {
  EditorProjectSchema,
  audioOf,
  type EditorProject,
  type PipModelOutput,
  type ReelPlan,
} from '@motionpop/schemas';
import { describe, expect, it, vi } from 'vitest';
import { pipAnswer } from '@/lib/ai/fake-router';
import type { Route } from '@/lib/ai/route';
import { createEditorStore } from '@/lib/stores/editor';
import { applyPlan, type ApplyDeps } from './apply';
import { chipsFor, codePlan, enforcePlan, pipInput, sceneRefs, sceneText } from './plan';

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
