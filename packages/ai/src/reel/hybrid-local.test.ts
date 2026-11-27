import {
  ReelPlanSchema,
  ReelSceneSchema,
  type ReelScene,
  type ReelWord,
} from '@motionpop/schemas';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeOnDeviceProvider } from '../providers/gemini-byok';
import type { Router, RunResult, TaskDef } from '../router';
import { directReel } from './director';
import { draftToReelPlan, reelDraftLocalTask, type ReelDraftOutput } from './draft-local';
import { reelNoteContext } from './note';
import {
  applyReelNoteLocal,
  reelNoteLocalInput,
  reelNoteLocalTask,
  type ReelNoteLocalOutput,
} from './note-local';
import { pipQuickTask, pipQuickToModelOutput, type PipQuickOutput } from '../tasks/pip-quick';

const WORDS: ReelWord[] =
  'Our retention jumped ninety two percent this year with automated motion graphics. Try Motionpop now.'
    .split(' ')
    .map((text, i) => ({ text, startMs: i * 400, endMs: i * 400 + 360 }));
const DURATION_MS = WORDS.at(-1)!.endMs + 400;

function stubRouter(answer: (id: string, input: unknown) => unknown): Router {
  return {
    async run<I, O>(task: TaskDef<I, O>, input: I): Promise<RunResult<O>> {
      const output = task.output.parse(answer(task.id, input));
      return {
        output,
        ranOn: 'device',
        model: 'gemini-nano',
        costCredits: 0,
        latencyMs: 12,
        attempts: 1,
        cached: false,
      };
    },
  };
}

const SAMPLE_SCENES: ReelScene[] = [
  {
    id: 's-counter',
    startMs: 0,
    endMs: 3000,
    layout: 'split',
    bg: 'light',
    tag: 'STATS',
    content: {
      template: 'counter',
      value: 40,
      decimals: 0,
      prefix: '',
      suffix: '%',
      label: 'Old label',
    },
  },
  {
    id: 's-headline',
    startMs: 0,
    endMs: 3000,
    layout: 'split',
    bg: 'light',
    content: { template: 'headline', kicker: 'INTRO', title: 'Hello world' },
  },
  {
    id: 's-punch',
    startMs: 0,
    endMs: 3000,
    layout: 'speaker',
    content: { template: 'punch', top: 'KEY', text: 'Big point' },
  },
  {
    id: 's-cta',
    startMs: 0,
    endMs: 3000,
    layout: 'speaker',
    content: { template: 'cta', verb: 'Try', keyword: 'NOW' },
  },
  {
    id: 's-custom',
    startMs: 0,
    endMs: 3000,
    layout: 'split',
    bg: 'dark',
    content: {
      template: 'custom',
      title: 'Rocket chart',
      brief: 'rocket chart',
      html: '<div>40%</div>',
      css: '.a{}',
      script: 'return 1;',
    },
  },
];

describe('hybrid on-device reel & pip tasks (Gemini Nano)', () => {
  it('all three local tasks are strictly ONLY_ON_DEVICE with 0 cloud cost and no silent fallback', () => {
    for (const task of [reelNoteLocalTask(), pipQuickTask(), reelDraftLocalTask()]) {
      expect(task.mode({} as never, {} as never)).toBe('ONLY_ON_DEVICE');
      expect(task.cloudCost({} as never)).toBe(0);
      expect(task.cloudFallback).toBe(false);
    }
  });

  it('reel.note.local applies counter value (with prefix/suffix), bg, layout, tag, hook, replace, and caption fixes', () => {
    const counter = SAMPLE_SCENES[0]!;
    const ctx = reelNoteContext(counter, WORDS, 'mono');
    const inp = reelNoteLocalInput(ctx, { noteText: 'change 40 to $92.5M and make it dark' });
    expect(inp.sceneValue).toBe(40);

    const applied = applyReelNoteLocal(ctx, {
      action: 'edit',
      message: 'Updated to $92.5M on dark',
      field: 'value',
      to: '$92.5M',
      bg: 'dark',
    });
    expect(applied.changed).toBe(true);
    expect(applied.escalate).toBe(false);
    expect(applied.scene.bg).toBe('dark');
    expect(applied.scene.content).toMatchObject({
      template: 'counter',
      value: 92.5,
      decimals: 1,
      prefix: '$',
      suffix: 'M',
    });

    // Caption word fix validates against spoken words.
    const cap = applyReelNoteLocal(ctx, {
      action: 'edit',
      message: 'Fixed caption',
      field: 'caption',
      from: 'retention',
      to: 'Revenue',
    });
    expect(cap.changed).toBe(true);
    expect(cap.captions).toEqual([{ find: 'retention', replace: 'Revenue' }]);

    // Hook update on scene 1.
    const hookEdit = applyReelNoteLocal(
      ctx,
      { action: 'edit', message: 'Updated hook', field: 'hook', to: 'New Hook' },
      { hook: 'Old Hook' },
    );
    expect(hookEdit.changed).toBe(true);
    expect(hookEdit.hook).toBe('New Hook');
  });

  it('reel.note.local escalates custom graphic content edits but allows bg/tag tweaks', () => {
    const customCtx = reelNoteContext(SAMPLE_SCENES[4]!, WORDS, 'mono');
    const blocked = applyReelNoteLocal(customCtx, {
      action: 'edit',
      message: 'Tried editing custom title',
      field: 'title',
      to: 'Something else',
    });
    expect(blocked.changed).toBe(false);
    expect(blocked.escalate).toBe(true);

    const allowedBg = applyReelNoteLocal(customCtx, {
      action: 'edit',
      message: 'Light background',
      bg: 'light',
    });
    expect(allowedBg.changed).toBe(true);
    expect(allowedBg.scene.bg).toBe('light');
  });

  it('reel.note.local never breaks speaker-only templates with non-speaker layouts', () => {
    const punchCtx = reelNoteContext(SAMPLE_SCENES[2]!, WORDS, 'mono');
    const res = applyReelNoteLocal(punchCtx, {
      action: 'edit',
      message: 'Tried split',
      layout: 'split',
    });
    expect(res.changed).toBe(false);
    expect(res.escalate).toBe(true);
    expect(res.scene.layout).toBe('speaker');
  });

  it('pip.quick maps simple commands, normalizes setReelTheme hexes from choice or instruction, and blocks updateSlot on reel scenes', () => {
    const ok = pipQuickToModelOutput({
      escalate: false,
      reply: 'Switching to cream look, warm gradient, and hiding captions.',
      steps: [
        { action: 'setReelLook', label: 'Switch reel to Cream look', choice: 'cream' },
        { action: 'setCaptions', label: 'Turn captions off', choice: 'off' },
        // Even if Nano accidentally puts hex in `choice`, normalizer moves it to `instruction`!
        { action: 'setReelTheme', label: 'Coral accent', choice: '#ff5a36 bold' },
        // `updateSlot` targeting a reel scene (`r1`) must be stripped so it never bills cloud.
        { action: 'updateSlot', label: 'Bad reel target', slot: 'r1', instruction: 'redesign' },
      ],
    });
    expect(ok?.steps).toHaveLength(3);
    expect(ok?.steps[0]).toMatchObject({ action: 'setReelLook', choice: 'cream', slot: 'none' });
    expect(ok?.steps[2]).toMatchObject({
      action: 'setReelTheme',
      choice: 'bold',
      instruction: '#FF5A36',
    });
    expect(
      pipQuickToModelOutput({ escalate: true, reply: 'Needs cloud', steps: [] }),
    ).toBeNull();
    // All-invalid steps returns null so caller escalates cleanly.
    expect(
      pipQuickToModelOutput({
        escalate: false,
        reply: 'Reset theme',
        steps: [{ action: 'setReelTheme', label: 'No hex', choice: 'reset' }],
      }),
    ).toBeNull();
  });

  it('reel.draft directs a valid tiled ReelPlan on-device when preferOnDevice is set or cloud fails', async () => {
    const draft: ReelDraftOutput = {
      hook: '92% Retention',
      beats: [
        { fromWord: 0, template: 'counter', title: 'Retention lift', value: 92, suffix: '%' },
        { fromWord: 8, template: 'headline', title: 'Motion Graphics', kicker: 'AUTO' },
        { fromWord: 12, template: 'cta', title: 'MOTIONPOP', kicker: 'Try' },
      ],
    };
    const plan = draftToReelPlan(draft, WORDS, DURATION_MS, 'mono');
    expect(plan.scenes).toHaveLength(3);
    expect(plan.by).toBe('gemini-nano');

    const router = stubRouter((id) => {
      if (id === 'reel.draft') return draft;
      throw new Error('offline');
    });
    const r = await directReel(router, {
      look: 'mono',
      words: WORDS,
      durationMs: DURATION_MS,
      preferOnDevice: true,
    });
    expect(r.source).toBe('device');
    expect(r.plan.scenes).toHaveLength(3);

    const fallback = await directReel(router, {
      look: 'mono',
      words: WORDS,
      durationMs: DURATION_MS,
      fallbackOnDevice: true,
    });
    expect(fallback.source).toBe('device');
    expect(fallback.error).toBe('offline');
  });

  it('property: draftToReelPlan never throws and always outputs a valid tiled ReelPlan for arbitrary Nano outputs', () => {
    const beatArb = fc.record({
      fromWord: fc.integer({ min: -5, max: 100 }),
      template: fc.constantFrom('headline' as const, 'counter' as const, 'punch' as const, 'cta' as const),
      title: fc.string({ maxLength: 60 }),
      kicker: fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
      value: fc.option(fc.double({ noNaN: false, noDefaultInfinity: false }), { nil: undefined }),
      suffix: fc.option(fc.string({ maxLength: 12 }), { nil: undefined }),
    });
    const draftArb = fc.record({
      hook: fc.option(fc.string({ maxLength: 60 }), { nil: undefined }),
      beats: fc.array(beatArb, { minLength: 1, maxLength: 12 }),
    });

    fc.assert(
      fc.property(
        draftArb,
        fc.constantFrom('mono' as const, 'cream' as const),
        fc.integer({ min: 100, max: 60_000 }),
        (draft, look, dur) => {
          const plan = draftToReelPlan(draft as ReelDraftOutput, WORDS, dur, look);
          expect(ReelPlanSchema.safeParse(plan).success).toBe(true);
          expect(plan.scenes.length).toBeGreaterThan(0);
          expect(plan.scenes[0]!.startMs).toBe(0);
          expect(plan.by).toBe('gemini-nano');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('property: applyReelNoteLocal never throws and always produces a schema-valid scene', () => {
    const outArb = fc.record({
      action: fc.constantFrom('edit' as const, 'escalate' as const),
      message: fc.string({ maxLength: 140 }),
      field: fc.option(
        fc.constantFrom(
          'title' as const,
          'kicker' as const,
          'sub' as const,
          'tag' as const,
          'bg' as const,
          'layout' as const,
          'hook' as const,
          'value' as const,
          'replace' as const,
          'caption' as const,
        ),
        { nil: undefined },
      ),
      to: fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
      from: fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
      bg: fc.option(fc.constantFrom('light' as const, 'cream' as const, 'dark' as const), {
        nil: undefined,
      }),
      layout: fc.option(
        fc.constantFrom('split' as const, 'card' as const, 'full' as const, 'speaker' as const),
        { nil: undefined },
      ),
    });

    fc.assert(
      fc.property(fc.constantFrom(...SAMPLE_SCENES), outArb, (scene, out) => {
        const ctx = reelNoteContext(scene, WORDS, 'mono');
        const res = applyReelNoteLocal(ctx, out as ReelNoteLocalOutput, { hook: 'Six tools' });
        expect(ReelSceneSchema.safeParse(res.scene).success).toBe(true);
        if (!res.changed) expect(res.escalate).toBe(true);
      }),
      { numRuns: 150 },
    );
  });

  it('property: pipQuickToModelOutput never throws and never leaks reel-targeted updateSlot steps', () => {
    const stepArb = fc.record({
      action: fc.constantFrom(
        'setReelLook' as const,
        'setCaptions' as const,
        'setReelTheme' as const,
        'setSound' as const,
        'setMusic' as const,
        'setStyle' as const,
        'setFormat' as const,
        'toggleCuts' as const,
        'clearScene' as const,
        'updateSlot' as const,
      ),
      label: fc.string({ maxLength: 90 }),
      choice: fc.option(fc.string({ maxLength: 120 }), { nil: undefined }),
      slot: fc.option(fc.constantFrom('r1', 'r2', 's1', 's2', 'none', ''), { nil: undefined }),
      instruction: fc.option(fc.string({ maxLength: 160 }), { nil: undefined }),
    });
    const quickArb = fc.record({
      escalate: fc.boolean(),
      reply: fc.string({ maxLength: 180 }),
      steps: fc.array(stepArb, { maxLength: 4 }),
    });

    fc.assert(
      fc.property(quickArb, (q) => {
        const res = pipQuickToModelOutput(q as PipQuickOutput);
        if (q.escalate) expect(res).toBeNull();
        if (res) {
          for (const s of res.steps) {
            if (s.action === 'updateSlot') expect(s.slot).toMatch(/^s\d+$/i);
            if (s.action === 'setReelTheme') expect(s.instruction).toMatch(/#[0-9A-F]{6}/);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('chromeOnDeviceProvider multimodal support', () => {
  const origLM = (globalThis as Record<string, unknown>).LanguageModel;
  afterEach(() => {
    if (origLM === undefined) delete (globalThis as Record<string, unknown>).LanguageModel;
    else (globalThis as Record<string, unknown>).LanguageModel = origLM;
  });

  it('passes expectedInputs with image and multimodal Blob payload when req.media is present', async () => {
    const promptSpy = vi.fn(async () => '{"action":"edit","message":"ok"}');
    const destroySpy = vi.fn();
    const createSpy = vi.fn(async () => ({ prompt: promptSpy, destroy: destroySpy }));
    const availabilitySpy = vi.fn(async () => 'available');
    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: availabilitySpy,
      create: createSpy,
    };

    const provider = chromeOnDeviceProvider();
    const res = await provider.generate({
      mode: 'ONLY_ON_DEVICE',
      model: 'gemini-nano',
      system: 'sys',
      prompt: 'Fix typo',
      jsonSchema: { type: 'object' },
      media: { mimeType: 'image/jpeg', base64: btoa('fake-jpeg-bytes') },
    });

    expect(res.ranOn).toBe('device');
    expect(availabilitySpy).toHaveBeenCalledWith({
      expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      }),
    );
    const firstArg = (promptSpy.mock.calls[0] as unknown[] | undefined)?.[0] as Array<{
      role: string;
      content: Array<{ type: string; value: unknown }>;
    }>;
    expect(Array.isArray(firstArg)).toBe(true);
    expect(firstArg[0]!.content[1]!.type).toBe('image');
    expect(firstArg[0]!.content[1]!.value).toBeInstanceOf(Blob);
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to text-only Nano when multimodal image input is unavailable', async () => {
    const promptSpy = vi.fn(async () => '{"action":"edit","message":"ok"}');
    const destroySpy = vi.fn();
    const createSpy = vi.fn(async () => ({ prompt: promptSpy, destroy: destroySpy }));
    const availabilitySpy = vi
      .fn()
      .mockResolvedValueOnce('unavailable')
      .mockResolvedValueOnce('available');
    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: availabilitySpy,
      create: createSpy,
    };

    const provider = chromeOnDeviceProvider();
    const res = await provider.generate({
      mode: 'ONLY_ON_DEVICE',
      model: 'gemini-nano',
      system: 'sys',
      prompt: 'Fix typo',
      jsonSchema: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object' },
      media: { mimeType: 'image/jpeg', base64: btoa('fake-jpeg-bytes') },
    });

    expect(res.ranOn).toBe('device');
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedInputs: [{ type: 'text', languages: ['en'] }],
      }),
    );
    expect(promptSpy).toHaveBeenCalledWith(
      'Fix typo',
      expect.objectContaining({ responseConstraint: { type: 'object' } }),
    );
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});
