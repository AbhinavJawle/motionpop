import { ReelPlanSchema, type ReelPlan, type ReelScene, type ReelWord } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import type { Router } from '../router';
import { directReel } from './director';
import { applyEditChoices, ctaParts, defaultCtaText, MOOD_BRIEFS } from './edit-choices';

const STEP = 400;
const DUR = 12000;

function wordsOf(text: string, step = STEP): ReelWord[] {
  return text
    .split(' ')
    .map((t, i) => ({ text: t, startMs: i * step, endMs: i * step + step - 40 }));
}

const scene = (
  id: string,
  startMs: number,
  endMs: number,
  layout: ReelScene['layout'],
  content: ReelScene['content'],
  extra: Partial<ReelScene> = {},
): ReelScene => ({ id, startMs, endMs, layout, content, ...extra });

const NONE = { template: 'none' } as const;
const CTA = { template: 'cta', verb: 'Comment', keyword: 'GUIDE' } as const;

function plan(scenes: ReelScene[], extra: Partial<ReelPlan> = {}): ReelPlan {
  return ReelPlanSchema.parse({ v: 1, look: 'mono', captions: true, scenes, ...extra });
}

const SAY = 'Revenue grew forty percent last year and nothing else changed at all so watch this';
const WS = wordsOf(SAY);

/** A split-layout reel that ends on a speaker cta, with a speaker first scene. */
function base(): ReelPlan {
  return plan(
    [
      scene('a', 0, 4000, 'speaker', NONE),
      scene('b', 4000, 9000, 'split', { template: 'headline', title: 'Middle part' }),
      scene('c', 9000, DUR, 'speaker', CTA),
    ],
    { hook: 'Big promise', music: { brief: 'Warm director brief for the bed' } },
  );
}

const tiled = (p: ReelPlan, dur = DUR) => {
  expect(p.scenes[0]!.startMs).toBe(0);
  expect(p.scenes.at(-1)!.endMs).toBe(dur);
  p.scenes.forEach((s, i) => {
    expect(s.endMs).toBeGreaterThan(s.startMs);
    if (i > 0) expect(s.startMs).toBe(p.scenes[i - 1]!.endMs);
  });
};

describe('applyEditChoices: CTA (R5.3)', () => {
  it('off: every cta scene becomes speaker none', () => {
    const p = plan([
      scene('a', 0, 4000, 'speaker', CTA),
      scene('b', 4000, 8000, 'split', { template: 'headline', title: 'Hi' }),
      scene('c', 8000, DUR, 'speaker', CTA),
    ]);
    const out = applyEditChoices(p, WS, DUR, { cta: { enabled: false } });
    expect(out.scenes.some((s) => s.content.template === 'cta')).toBe(false);
    expect(out.scenes[0]).toMatchObject({ layout: 'speaker', content: { template: 'none' } });
    expect(out.scenes[2]).toMatchObject({ layout: 'speaker', content: { template: 'none' } });
    expect(out.scenes[1]!.content.template).toBe('headline');
    tiled(out);
  });

  it('on with text: appends a speaker cta at the end and the plan still tiles', () => {
    const p = plan([
      scene('a', 0, 6000, 'split', { template: 'headline', title: 'Hi' }),
      scene('b', 6000, DUR, 'split', { template: 'headline', title: 'There' }),
    ]);
    const out = applyEditChoices(p, WS, DUR, { cta: { enabled: true, text: 'Comment LINK' } });
    expect(out.scenes).toHaveLength(3);
    const last = out.scenes.at(-1)!;
    expect(last.layout).toBe('speaker');
    expect(last.content).toEqual({ template: 'cta', verb: 'Comment', keyword: 'LINK' });
    expect(last.endMs - last.startMs).toBe(1600);
    expect(out.scenes[1]!.endMs).toBe(DUR - 1600);
    tiled(out);
  });

  it('on with text: a speaker last scene is converted instead of split', () => {
    const out = applyEditChoices(base(), WS, DUR, { cta: { enabled: true, text: 'Follow me' } });
    expect(out.scenes).toHaveLength(3);
    expect(out.scenes.at(-1)).toMatchObject({
      startMs: 9000,
      layout: 'speaker',
      content: { template: 'cta', verb: 'Follow', keyword: 'me' },
    });
    tiled(out);
  });

  it('on with text: a last scene too short to split is converted whole', () => {
    const p = plan([
      scene('a', 0, 10500, 'split', { template: 'headline', title: 'Hi' }),
      scene('b', 10500, DUR, 'split', { template: 'headline', title: 'End' }),
    ]);
    const out = applyEditChoices(p, WS, DUR, { cta: { enabled: true, text: 'Comment LINK' } });
    expect(out.scenes).toHaveLength(2);
    expect(out.scenes[1]).toMatchObject({ layout: 'speaker', content: { template: 'cta' } });
    tiled(out);
  });

  it('on with text: clears carry, tag and bg on the converted scene', () => {
    const p = plan([
      scene('a', 0, 6000, 'split', { template: 'headline', title: 'Hi' }),
      scene(
        'b',
        6000,
        DUR,
        'split',
        { template: 'headline', title: 'End' },
        {
          carry: true,
          tag: 'TAG',
          bg: 'dark',
        },
      ),
    ]);
    const out = applyEditChoices(p, WS, DUR, { cta: { enabled: true, text: 'Comment LINK' } });
    const tail = out.scenes.at(-1)!;
    expect(tail.carry).toBeUndefined();
    expect(tail.tag).toBeUndefined();
    expect(tail.bg).toBeUndefined();
  });

  it('on with text: a long scene id still gives a valid appended scene id', () => {
    const id = 'x'.repeat(40);
    const p = plan([scene(id, 0, DUR, 'split', { template: 'headline', title: 'Hi' })]);
    const out = applyEditChoices(p, WS, DUR, { cta: { enabled: true, text: 'Comment LINK' } });
    expect(out.scenes).toHaveLength(2);
    expect(new Set(out.scenes.map((s) => s.id)).size).toBe(2);
  });

  it('on with text: an earlier director cta does not stay as a second ask', () => {
    const p = plan([
      scene('a', 0, 3000, 'speaker', CTA),
      scene('b', 3000, DUR, 'split', { template: 'headline', title: 'Hi' }),
    ]);
    const out = applyEditChoices(p, WS, DUR, { cta: { enabled: true, text: 'Comment LINK' } });
    expect(out.scenes.filter((s) => s.content.template === 'cta')).toHaveLength(1);
    expect(out.scenes.at(-1)!.content.template).toBe('cta');
  });

  // Changed by the spec 39 AI soak (9 of 19 directed reels had the CTA on and no ask): with no
  // director cta and no creator text, a default ask is appended (was: nothing added).
  it('on without text: keeps the director cta scenes, or adds a default ask when there is none', () => {
    const none = plan([
      scene('a', 0, 6000, 'split', { template: 'headline', title: 'Hi' }),
      scene('b', 6000, DUR, 'split', { template: 'headline', title: 'End' }),
    ]);
    const a = applyEditChoices(none, WS, DUR, { cta: { enabled: true } });
    expect(a.scenes.filter((s) => s.content.template === 'cta')).toHaveLength(1);
    expect(a.scenes.at(-1)!.content.template).toBe('cta');
    expect(a.scenes.at(-1)!.endMs).toBe(DUR);
    const short = plan([scene('a', 0, 5000, 'split', { template: 'headline', title: 'Hi' })]);
    const s5 = applyEditChoices(short, WS, 5000, { cta: { enabled: true } });
    expect(s5.scenes.some((s) => s.content.template === 'cta')).toBe(false);
    const b = applyEditChoices(base(), WS, DUR, { cta: { enabled: true, text: '   ' } });
    expect(b.scenes.at(-1)!.content).toEqual(CTA);
    expect(b.scenes).toHaveLength(3);
  });
});

describe('defaultCtaText', () => {
  const ws = (t: string) => wordsOf(t);
  it("uses the speaker's own ask from the last third", () => {
    expect(
      defaultCtaText(ws('one two three four five six seven eight comment LINK below now')),
    ).toBe('Comment LINK');
    expect(defaultCtaText(ws('a b c d e f g h i save it for later'))).toBe('Save this');
    // Changed in the spec 39 AI QA review: "drop a comment" has no keyword (was "Comment COMMENT").
    expect(defaultCtaText(ws('a b c d e f g h i drop a comment below'))).toBe('Comment below');
    expect(defaultCtaText(ws('a b c d e f g h i drop the word GUIDE'))).toBe('Comment GUIDE');
    expect(defaultCtaText(ws('a b c d e f g h i drop GUIDE in the comments'))).toBe(
      'Comment GUIDE',
    );
    expect(defaultCtaText(ws('a b c d e f g h i drop me a follow'))).toBe('Follow for more');
    expect(defaultCtaText(ws('a b c d e f g h i and then prices drop twenty percent'))).toBe(
      'Follow for more',
    );
    expect(defaultCtaText(ws('a b c d e f g h follow'))).toBe('Follow for more');
  });
  it('falls back to Follow for more, and ignores asks early in the reel', () => {
    expect(
      defaultCtaText(ws('comment LINK then a long talk about other things entirely here ok')),
    ).toBe('Follow for more');
    expect(defaultCtaText([])).toBe('Follow for more');
  });
  // Regression (found by the applyEditChoices property in the spec 39 AI QA review): the ask
  // table was a plain object, so a spoken "constructor" matched Object.prototype and crashed.
  it('ignores Object.prototype names', () => {
    expect(defaultCtaText(ws('a b c d e f g h i constructor toString hasOwnProperty'))).toBe(
      'Follow for more',
    );
  });
});

describe('ctaParts', () => {
  it('splits verb and keyword', () => {
    expect(ctaParts('Comment LINK')).toEqual({ verb: 'Comment', keyword: 'LINK' });
    expect(ctaParts('Comment the word LINK')).toEqual({
      verb: 'Comment',
      keyword: 'the word LINK',
    });
  });
  it('one word becomes Follow + word; empty is safe', () => {
    expect(ctaParts('Subscribe')).toEqual({ verb: 'Follow', keyword: 'Subscribe' });
    expect(ctaParts('  ')).toEqual({ verb: 'Follow', keyword: 'for more' });
  });
  it('truncates long text within 14 / 16 characters', () => {
    const { verb, keyword } = ctaParts(
      'Congratulations everybody should definitely subscribe now please',
    );
    expect(verb.length).toBeLessThanOrEqual(14);
    expect(keyword.length).toBeLessThanOrEqual(16);
    expect(keyword.length).toBeGreaterThan(0);
  });
});

describe('applyEditChoices: hook style (R5.4)', () => {
  const FIRST_NUM = wordsOf('Revenue grew forty percent last year and nothing else changed at all');
  const FIRST_NONE = wordsOf('Hello there friends today we talk about plain stuff and more things');

  it('stat: a number said in scene 1 becomes a counter', () => {
    const out = applyEditChoices(base(), FIRST_NUM, DUR, { hookStyle: 'stat' });
    expect(out.scenes[0]!.layout).toBe('split');
    expect(out.scenes[0]!.content).toMatchObject({
      template: 'counter',
      value: 40,
      suffix: '%',
      prefix: '',
    });
    expect(out.hookStyle).toBe('stat');
    expect(out.scenes[1]).toEqual(base().scenes[1]);
  });

  it('stat: the cream look converts a speaker scene 1 to a card', () => {
    const p = { ...base(), look: 'cream' as const };
    const out = applyEditChoices(p, FIRST_NUM, DUR, { hookStyle: 'stat' });
    expect(out.scenes[0]!.layout).toBe('card');
  });

  it('stat: no number and a speaker scene 1 falls back to a headline from plan.hook', () => {
    const out = applyEditChoices(base(), FIRST_NONE, DUR, { hookStyle: 'stat' });
    expect(out.scenes[0]!.content).toEqual({ template: 'headline', title: 'Big promise' });
    expect(out.scenes[0]!.layout).toBe('split');
  });

  it('stat: no number and no hook → headline from the first four words, title-cased', () => {
    const p = base();
    delete p.hook;
    const out = applyEditChoices(p, FIRST_NONE, DUR, { hookStyle: 'stat' });
    expect(out.scenes[0]!.content).toEqual({
      template: 'headline',
      title: 'Hello there friends today',
    });
  });

  it('stat: no number and a graphic scene 1 is left alone', () => {
    const p = plan([
      scene('a', 0, 6000, 'split', { template: 'headline', title: 'Keep me' }),
      scene('b', 6000, DUR, 'speaker', NONE),
    ]);
    const out = applyEditChoices(p, FIRST_NONE, DUR, { hookStyle: 'stat' });
    expect(out.scenes[0]!.content).toEqual({ template: 'headline', title: 'Keep me' });
  });

  it('stat: a lone "one" and a said year are not statistics', () => {
    const ws = wordsOf('In 2020 one thing changed and nothing else mattered to anybody at all');
    const out = applyEditChoices(base(), ws, DUR, { hookStyle: 'stat' });
    expect(out.scenes[0]!.content.template).toBe('headline');
  });

  it('stat: keeps a fractional value to two decimals', () => {
    const ws = wordsOf('It cost 0.25 dollars each and nothing else was needed for this one');
    const out = applyEditChoices(base(), ws, DUR, { hookStyle: 'stat' });
    const c = out.scenes[0]!.content;
    expect(c.template).toBe('counter');
    if (c.template === 'counter') expect(c.decimals).toBe(2);
  });

  it('visual: keeps an image scene 1', () => {
    const image = {
      template: 'image',
      media: { kind: 'illustration', query: 'a coffee cup' },
      fit: 'frame',
      words: [],
    } as unknown as ReelScene['content'];
    const p = plan([scene('a', 0, 6000, 'split', image), scene('b', 6000, DUR, 'speaker', NONE)]);
    const out = applyEditChoices(p, FIRST_NONE, DUR, { hookStyle: 'visual' });
    expect(out.scenes[0]!.content.template).toBe('image');
    expect(out.hookStyle).toBe('visual');
  });

  it('visual: a speaker scene 1 becomes a headline', () => {
    const out = applyEditChoices(base(), FIRST_NONE, DUR, { hookStyle: 'visual' });
    expect(out.scenes[0]!.content.template).toBe('headline');
  });

  it('headline: a speaker scene 1 becomes a title card; a graphic one is kept', () => {
    const out = applyEditChoices(base(), FIRST_NONE, DUR, { hookStyle: 'headline' });
    expect(out.scenes[0]!.content.template).toBe('headline');
    const p = plan([scene('a', 0, DUR, 'split', { template: 'headline', title: 'Mine' })]);
    expect(
      applyEditChoices(p, FIRST_NONE, DUR, { hookStyle: 'headline' }).scenes[0]!.content,
    ).toEqual({ template: 'headline', title: 'Mine' });
  });

  it('cold-open: drops plan.hook and leaves scene 1 as it is', () => {
    const out = applyEditChoices(base(), FIRST_NONE, DUR, { hookStyle: 'cold-open' });
    expect(out.hook).toBeUndefined();
    expect(out.scenes[0]).toEqual(base().scenes[0]);
    expect(out.hookStyle).toBe('cold-open');
  });
});

describe('applyEditChoices: captions, theme, music, look', () => {
  it('captions set the switch and the style', () => {
    const on = applyEditChoices(base(), WS, DUR, { captions: { enabled: true, style: 'boxed' } });
    expect(on.captions).toBe(true);
    expect(on.captionStyle).toBe('boxed');
    const off = applyEditChoices(base(), WS, DUR, { captions: { enabled: false, style: 'clean' } });
    expect(off.captions).toBe(false);
    expect(off.captionStyle).toBe('clean');
  });

  it('music none drops the brief, a mood replaces it, auto keeps it', () => {
    expect(applyEditChoices(base(), WS, DUR, { music: 'none' }).music).toBeUndefined();
    expect(applyEditChoices(base(), WS, DUR, { music: 'lofi' }).music).toEqual({
      brief: MOOD_BRIEFS.lofi,
    });
    expect(applyEditChoices(base(), WS, DUR, { music: 'auto' }).music).toEqual(base().music);
  });

  it('every mood brief fits the plan schema', () => {
    for (const brief of Object.values(MOOD_BRIEFS))
      expect(ReelPlanSchema.shape.music.safeParse({ brief }).success).toBe(true);
  });

  it('theme is applied; absent theme keeps the plan’s', () => {
    const theme = { accent: '#ff3366', background: 'bold' as const };
    expect(applyEditChoices(base(), WS, DUR, { theme }).theme).toEqual(theme);
    const kept = { ...base(), theme: { accent: '#112233', background: 'plain' as const } };
    expect(applyEditChoices(kept, WS, DUR, {}).theme).toEqual(kept.theme);
  });

  it('never changes the look', () => {
    for (const look of ['mono', 'cream'] as const) {
      const out = applyEditChoices({ ...base(), look }, WS, DUR, {
        hookStyle: 'stat',
        cta: { enabled: true, text: 'Comment LINK' },
        captions: { enabled: true, style: 'pop' },
        music: 'upbeat',
      });
      expect(out.look).toBe(look);
    }
  });

  it('no choices: the plan is unchanged', () => {
    expect(applyEditChoices(base(), WS, DUR, {})).toEqual(base());
  });

  it('does not mutate its input', () => {
    const p = base();
    const copy = structuredClone(p);
    applyEditChoices(p, WS, DUR, {
      hookStyle: 'cold-open',
      cta: { enabled: true, text: 'Comment LINK' },
      music: 'none',
    });
    expect(p).toEqual(copy);
  });
});

describe('directReel applies the choices to the free plan (R5.7)', () => {
  const ws = wordsOf(
    'This is your thought of the day. Revenue grew forty percent last year, and nothing changed. Comment GUIDE below.',
    500,
  );
  const dur = ws.at(-1)!.endMs + 300;
  const choices = {
    cta: { enabled: true, text: 'Comment LINK' },
    hookStyle: 'cold-open' as const,
    captions: { enabled: true, style: 'boxed' as const },
    music: 'none' as const,
  };

  it('without a router', async () => {
    const r = await directReel(null, { look: 'mono', words: ws, durationMs: dur, choices });
    expect(r.source).toBe('auto');
    expect(r.plan.scenes.at(-1)!.content).toEqual({
      template: 'cta',
      verb: 'Comment',
      keyword: 'LINK',
    });
    expect(r.plan.hook).toBeUndefined();
    expect(r.plan.captionStyle).toBe('boxed');
    expect(r.plan.music).toBeUndefined();
  });

  it('when the cloud director fails', async () => {
    const router = {
      run: () => Promise.reject(new Error('boom')),
    } as unknown as Router;
    const r = await directReel(router, { look: 'cream', words: ws, durationMs: dur, choices });
    expect(r.source).toBe('auto');
    expect(r.error).toBe('boom');
    expect(r.plan.scenes.at(-1)!.content.template).toBe('cta');
    expect(r.plan.captionStyle).toBe('boxed');
  });

  it('CTA off removes the free director’s cta scenes', async () => {
    const r = await directReel(null, {
      look: 'mono',
      words: ws,
      durationMs: dur,
      choices: { cta: { enabled: false } },
    });
    expect(r.plan.scenes.some((s) => s.content.template === 'cta')).toBe(false);
  });
});
