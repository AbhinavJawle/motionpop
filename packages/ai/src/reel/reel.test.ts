import { ReelPlanSchema, type ReelWord } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { autoReelPlan, findNumber } from './auto';
import { directReel, toReelPlan, type ReelDirectOutput } from './director';

const SCRIPT =
  'This is your thought of the day. You have a potential problem. Revenue grew forty percent last year, ' +
  'and nothing changed. Learn, build, ship. Why does nobody finish? Comment GUIDE below.';

function words(text = SCRIPT, step = 380): ReelWord[] {
  return text
    .split(' ')
    .map((t, i) => ({ text: t, startMs: i * step, endMs: i * step + step - 40 }));
}

function expectTiled(plan: { scenes: { startMs: number; endMs: number }[] }, durationMs: number) {
  expect(plan.scenes[0]!.startMs).toBe(0);
  expect(plan.scenes.at(-1)!.endMs).toBe(durationMs);
  plan.scenes.forEach((s, i) => {
    expect(s.endMs).toBeGreaterThan(s.startMs);
    if (i > 0) expect(s.startMs).toBe(plan.scenes[i - 1]!.endMs);
  });
}

describe('findNumber', () => {
  it('reads digits, number words and percents, and skips years', () => {
    expect(findNumber(['grew', '40%'])).toMatchObject({ value: 40, suffix: '%' });
    expect(findNumber(['forty', 'percent'])).toMatchObject({ value: 40, suffix: '%', end: 1 });
    expect(findNumber(['two', 'million'])).toMatchObject({ value: 2e6 });
    expect(findNumber(['since', '2020'])).toBeNull();
  });
});

describe('autoReelPlan', () => {
  it('returns a valid, tiled plan with a graphic hook and a counter for the spoken number', () => {
    const ws = words();
    const dur = ws.at(-1)!.endMs + 300;
    for (const look of ['mono', 'cream'] as const) {
      const plan = autoReelPlan(ws, dur, look);
      expect(ReelPlanSchema.safeParse(plan).success).toBe(true);
      expectTiled(plan, dur);
      expect(plan.scenes[0]!.layout).not.toBe('speaker');
      expect(plan.scenes.some((s) => s.content.template === 'counter')).toBe(true);
    }
  });

  it('never cuts statement lines mid-word', () => {
    const plan = autoReelPlan(words(), 20000, 'mono');
    const vocab = new Set(SCRIPT.split(' ').map((w) => w.replace(/[.,?!]/g, '')));
    for (const s of plan.scenes) {
      if (s.content.template !== 'statement') continue;
      for (const l of s.content.lines)
        for (const w of l.text.split(' ')) expect(vocab).toContain(w);
    }
  });

  it('stays valid for any transcript (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[A-Za-z]{1,12}[.,?]?$/), { minLength: 1, maxLength: 120 }),
        fc.integer({ min: 120, max: 900 }),
        (ts, step) => {
          const ws = words(ts.join(' '), step);
          const dur = ws.at(-1)!.endMs + 200;
          const plan = autoReelPlan(ws, dur, 'cream');
          expect(ReelPlanSchema.safeParse(plan).success).toBe(true);
          expectTiled(plan, dur);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('toReelPlan', () => {
  const ws = words();
  const dur = ws.at(-1)!.endMs + 300;

  it('maps word indices to ms, forces speaker templates full-frame and tiles the result', () => {
    const out: ReelDirectOutput = {
      hook: 'Finish what you start',
      scenes: [
        {
          fromWord: 0,
          toWord: 6,
          layout: 'split',
          graphic: { template: 'headline', title: 'Thought of the day' },
        },
        {
          fromWord: 7,
          toWord: 19,
          layout: 'split',
          graphic: {
            template: 'list',
            title: 'The plan',
            items: [
              { word: 19, text: 'Learn', icon: 'graduation-cap' },
              { word: 20, text: 'Build', icon: 'nope-not-an-icon' },
            ],
          },
        },
        {
          fromWord: 20,
          toWord: 30,
          layout: 'split',
          graphic: { template: 'punch', text: 'Ship it' },
        },
      ],
    };
    const plan = toReelPlan(out, ws, dur, 'mono', 'test');
    expectTiled(plan, dur);
    expect(plan.hook).toBe('Finish what you start');
    expect(plan.scenes[1]!.startMs).toBe(ws[7]!.startMs);
    expect(plan.scenes[2]!.layout).toBe('speaker');
    const list = plan.scenes[1]!.content;
    expect(list.template).toBe('list');
    if (list.template === 'list') {
      // Item 0 is cued on its word; item 1 is outside the scene, so it is spread evenly.
      expect(list.items[0]!.at).toBe(Math.min(plan.scenes[1]!.endMs - 200, ws[19]!.startMs));
      expect(list.items[1]!.icon).not.toBe('nope-not-an-icon');
    }
  });

  it('turns an unusable scene into a speaker shot and swaps layouts per look', () => {
    const out: ReelDirectOutput = {
      scenes: [
        {
          fromWord: 0,
          toWord: 6,
          layout: 'split',
          graphic: { template: 'headline', title: 'Hello' },
        },
        // A chart with no points can't be drawn.
        {
          fromWord: 7,
          toWord: 30,
          layout: 'split',
          graphic: { template: 'chart', title: 'Up', items: [] },
        },
      ],
    };
    const plan = toReelPlan(out, ws, dur, 'cream', 'test');
    expectTiled(plan, dur);
    expect(plan.scenes[0]!.layout).toBe('card');
    expect(plan.scenes[1]!).toMatchObject({ layout: 'speaker', content: { template: 'none' } });
  });

  it('turns brands, sites and pictures into media requests (spec 26)', () => {
    const out: ReelDirectOutput = {
      brands: [{ name: 'Acme', domain: 'acme.test' }],
      scenes: [
        { fromWord: 0, toWord: 5, layout: 'split', graphic: { template: 'logo', brand: 'Acme' } },
        {
          fromWord: 6,
          toWord: 12,
          layout: 'full',
          graphic: {
            template: 'image',
            kind: 'illustration',
            subject: 'a half-built bridge',
            fit: 'frame',
          },
        },
        {
          fromWord: 13,
          toWord: 20,
          layout: 'split',
          graphic: { template: 'website', domain: 'https://acme.test/' },
        },
      ],
    };
    const plan = toReelPlan(out, ws, dur, 'mono', 'test');
    expect(plan.scenes[0]!.content).toMatchObject({
      template: 'logo',
      name: 'Acme',
      media: { kind: 'logo', query: 'Acme|acme.test' },
    });
    expect(plan.scenes[1]!.content).toMatchObject({
      template: 'image',
      media: { kind: 'illustration', query: 'a half-built bridge' },
    });
    expect(plan.scenes[2]!.content).toMatchObject({
      template: 'website',
      url: 'acme.test',
      media: { kind: 'screenshot', query: 'acme.test' },
    });
  });

  it('carries a list across other scenes, keeping the shown items on their first cues', () => {
    const out: ReelDirectOutput = {
      scenes: [
        {
          fromWord: 0,
          toWord: 8,
          layout: 'split',
          graphic: {
            template: 'list',
            title: 'Steps',
            items: [
              { word: 2, text: 'Learn' },
              { word: 5, text: 'Build' },
            ],
          },
        },
        { fromWord: 9, toWord: 12, layout: 'speaker', graphic: { template: 'none' } },
        {
          fromWord: 13,
          toWord: 16,
          layout: 'split',
          graphic: { template: 'headline', title: 'Wait' },
        },
        {
          fromWord: 17,
          toWord: 30,
          layout: 'split',
          carry: true,
          // The model re-cued "Learn" here and left "Build" out: both come back on their old cues.
          graphic: {
            template: 'list',
            title: 'Steps',
            items: [
              { word: 17, text: 'Learn' },
              { word: 19, text: 'Ship' },
            ],
          },
        },
      ],
    };
    const plan = toReelPlan(out, ws, dur, 'mono', 'test');
    const first = plan.scenes[0]!.content;
    const last = plan.scenes.at(-1)!;
    expect(last.carry).toBe(true);
    if (first.template === 'list' && last.content.template === 'list') {
      expect(last.content.items.map((i) => i.text)).toEqual(['Learn', 'Build', 'Ship']);
      expect(last.content.items[0]!.at).toBe(first.items[0]!.at);
      expect(last.content.items[1]!.at).toBe(first.items[1]!.at);
      expect(last.content.items[2]!.at).toBeGreaterThanOrEqual(last.startMs);
    } else throw new Error('expected lists');
  });

  it('decodes URL-encoded counter symbols', () => {
    const out: ReelDirectOutput = {
      scenes: [
        {
          fromWord: 0,
          toWord: 30,
          layout: 'split',
          graphic: { template: 'counter', value: 100000, label: 'Skills', suffix: '%2B' },
        },
      ],
    };
    const c = toReelPlan(out, ws, dur, 'mono', 'test').scenes[0]!.content;
    expect(c).toMatchObject({ template: 'counter', suffix: '+' });
  });
});

describe('directReel', () => {
  it('falls back to the free plan without a router', async () => {
    const ws = words();
    const r = await directReel(null, { look: 'mono', words: ws, durationMs: 20000 });
    expect(r.source).toBe('auto');
    expect(ReelPlanSchema.safeParse(r.plan).success).toBe(true);
  });
});
