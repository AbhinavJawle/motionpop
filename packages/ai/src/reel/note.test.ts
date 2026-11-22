import {
  ReelSceneSchema,
  type ReelScene,
  type ReelTemplate,
  type ReelWord,
} from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyReelNote,
  checkReelNote,
  findWordRun,
  reelNoteContext,
  reelNoteInput,
  reelNotePromptV1,
  ReelNoteOutputSchema,
  type ReelNoteOutput,
} from './note';

// 40 words, one every 300 ms from 0.
const WORDS: ReelWord[] = Array.from({ length: 40 }, (_, i) => ({
  text: `w${i}`,
  startMs: i * 300,
  endMs: i * 300 + 260,
}));
const at = (i: number) => i * 300;

const CONTENTS: ReelTemplate[] = [
  {
    template: 'headline',
    title: 'Six tools',
    kicker: 'My stack',
    sub: 'Replaced my team',
    accent: 'tools',
  },
  {
    template: 'list',
    title: 'Tools',
    items: [
      { at: at(3), icon: 'video', text: 'Train fast' },
      {
        at: at(5),
        icon: 'check',
        text: 'Notes app',
        media: { kind: 'logo', query: 'Notes|notes.example', asset: 'a1' },
      },
    ],
  },
  {
    template: 'stack',
    label: 'Options',
    words: [
      { at: at(2), text: 'One' },
      { at: at(4), text: 'Two' },
    ],
  },
  {
    template: 'checklist',
    rows: [
      { at: at(2), label: 'Fast', value: '2x' },
      { at: at(6), label: 'Cheap' },
    ],
  },
  {
    template: 'compare',
    left: 'Before',
    right: 'After',
    winner: 'right',
    leftIcon: 'x',
    rows: [{ at: at(4), text: 'Hours' }],
  },
  { template: 'statement', icon: 'users', strike: true, lines: [{ at: at(3), text: 'No team' }] },
  {
    template: 'counter',
    value: 40,
    decimals: 0,
    prefix: '',
    suffix: '%',
    label: 'Revenue growth',
    icon: 'trending-up',
  },
  { template: 'progress', icon: 'download', title: 'Installing', task: 'Copying files' },
  {
    template: 'terminal',
    title: 'Shell',
    lines: [{ at: at(2), text: 'npm install', kind: 'cmd' }],
  },
  {
    template: 'chart',
    kind: 'bars',
    title: 'Growth',
    unit: '%',
    points: [
      { label: '2020', value: 10 },
      { label: '2024', value: 40 },
    ],
  },
  { template: 'browser', url: 'example.com', headline: 'Buy now', button: 'Go', strikeAt: at(6) },
  {
    template: 'flow',
    steps: [
      { at: at(2), icon: 'search', text: 'Find' },
      { at: at(5), icon: 'check', text: 'Ship' },
    ],
  },
  { template: 'quote', lines: [{ at: at(3), text: 'Make it simple' }], highlight: ['simple'] },
  {
    template: 'logo',
    media: { kind: 'logo', query: 'Acme|acme.example', asset: 'a2' },
    name: 'Acme',
    sub: 'The tool I use',
  },
  {
    template: 'logos',
    title: 'Stack',
    items: [
      { at: at(2), media: { kind: 'logo', query: 'Acme|acme.example' }, name: 'Acme' },
      { at: at(4), media: { kind: 'logo', query: 'Beta' }, name: 'Beta' },
    ],
  },
  {
    template: 'image',
    media: { kind: 'illustration', query: 'a half built bridge', asset: 'a3' },
    fit: 'frame',
    title: 'Unfinished',
    words: [{ at: at(4), text: 'Gap' }],
  },
  {
    template: 'website',
    media: { kind: 'screenshot', query: 'example.com' },
    url: 'example.com',
    headline: 'Home',
  },
  { template: 'punch', text: 'Finish it', top: 'So' },
  { template: 'cta', verb: 'Comment', keyword: 'GUIDE' },
  { template: 'none' },
];

const sceneOf = (content: ReelTemplate, extra: Partial<ReelScene> = {}): ReelScene =>
  ReelSceneSchema.parse({
    id: 'r3',
    startMs: 0,
    endMs: 3000,
    layout: ['punch', 'cta', 'none'].includes(content.template) ? 'speaker' : 'split',
    content,
    ...extra,
  });

const edit = (o: Partial<ReelNoteOutput> & Record<string, unknown>): ReelNoteOutput =>
  ReelNoteOutputSchema.parse({ action: 'edit', message: 'ok', ...o });

describe('reel.note mapping (spec 29 R2)', () => {
  it('maps every template to the model language and back unchanged', () => {
    for (const content of CONTENTS) {
      const scene = sceneOf(content);
      const ctx = reelNoteContext(scene, WORDS, 'mono');
      const res = applyReelNote(ctx, edit({ graphic: ctx.graphic }));
      expect(res.scene.content, content.template).toEqual(scene.content);
      expect(res.changed, content.template).toBe(false);
    }
  });

  it('changes one field and keeps every cue and picture of what stays', () => {
    const scene = sceneOf(CONTENTS[1]!);
    const ctx = reelNoteContext(scene, WORDS, 'mono');
    const g = structuredClone(ctx.graphic) as Extract<typeof ctx.graphic, { template: 'list' }>;
    g.title = 'My tools';
    const res = applyReelNote(ctx, edit({ graphic: g }));
    const c = res.scene.content as Extract<ReelTemplate, { template: 'list' }>;
    expect(c.title).toBe('My tools');
    expect(c.items.map((x) => x.at)).toEqual([at(3), at(5)]);
    expect(c.items[1]!.media).toEqual({ kind: 'logo', query: 'Notes|notes.example', asset: 'a1' });
    expect(res.changed).toBe(true);
  });

  it('keeps logos the answer forgot to copy, unless the name is new or the logo is removed', () => {
    const scene = sceneOf(CONTENTS[1]!);
    const ctx = reelNoteContext(scene, WORDS, 'mono');
    const list = (items: { word?: number; text: string; brand?: string }[]) =>
      applyReelNote(ctx, edit({ graphic: { template: 'list', title: 'Tools', items } })).scene
        .content as Extract<ReelTemplate, { template: 'list' }>;
    const logo = { kind: 'logo', query: 'Notes|notes.example', asset: 'a1' };
    // Retyped ("it's just Notes, not Notes app"), brand left out: same word, related text → kept.
    expect(
      list([
        { word: 3, text: 'Train fast' },
        { word: 5, text: 'Notes' },
      ]).items[1]!.media,
    ).toEqual(logo);
    // Same text on another word, and same position without a word → kept.
    expect(
      list([
        { word: 9, text: 'Notes app' },
        { word: 3, text: 'Train' },
      ]).items[0]!.media,
    ).toEqual(logo);
    expect(list([{ text: 'Train fast' }, { text: 'Notes pro' }]).items[1]!.media).toEqual(logo);
    // A wholly new name, or an explicit "" → no old logo.
    expect(
      list([
        { word: 3, text: 'Train fast' },
        { word: 5, text: 'Zeta' },
      ]).items[1]!.media,
    ).toBeUndefined();
    expect(
      list([
        { word: 3, text: 'Train fast' },
        { word: 5, text: 'Notes app', brand: '' },
      ]).items[1]!.media,
    ).toBeUndefined();

    const cmp = sceneOf({
      template: 'compare',
      left: 'Acme',
      right: 'Beta',
      winner: 'right',
      leftMedia: { kind: 'logo', query: 'Acme|acme.example', asset: 'la' },
      rightMedia: { kind: 'logo', query: 'Beta|beta.example', asset: 'ra' },
      rows: [{ at: at(4), text: 'Hours' }],
    });
    const cctx = reelNoteContext(cmp, WORDS, 'mono');
    const swapped = applyReelNote(
      cctx,
      edit({
        graphic: {
          template: 'compare',
          left: 'Beta',
          right: 'Acme',
          winner: 'left',
          items: [{ word: 4, text: 'Hours' }],
        },
      }),
    ).scene.content as Extract<ReelTemplate, { template: 'compare' }>;
    expect(swapped.leftMedia?.asset).toBe('ra');
    expect(swapped.rightMedia?.asset).toBe('la');
  });

  it('keeps text fields the answer left out; "" removes them', () => {
    const scene = sceneOf(CONTENTS[0]!); // headline: title, kicker, sub, accent
    const ctx = reelNoteContext(scene, WORDS, 'mono');
    const head = (g: { title: string; kicker?: string; sub?: string; accent?: string }) =>
      applyReelNote(ctx, edit({ graphic: { template: 'headline', ...g } })).scene
        .content as Extract<ReelTemplate, { template: 'headline' }>;
    const kept = head({ title: 'Seven tools' });
    expect(kept).toMatchObject({
      title: 'Seven tools',
      kicker: 'My stack',
      sub: 'Replaced my team',
    });
    const gone = head({ title: 'Six tools', kicker: '' });
    expect(gone.kicker).toBeUndefined();
    expect(gone.sub).toBe('Replaced my team');
    // Leaving fields out with nothing else changed: the drop was the edit ("remove this small text").
    const dropped = head({ title: 'Six tools', sub: 'Replaced my team', accent: 'tools' });
    expect(dropped.kicker).toBeUndefined();
    expect(dropped.sub).toBe('Replaced my team');
    // Same on an older plan whose suffix the builder now cleans up (" tools? " → " tools?").
    const old = sceneOf({
      template: 'counter',
      value: 6,
      decimals: 0,
      prefix: '',
      suffix: ' tools? ',
      label: 'Tools I used',
      kicker: 'REVEALING',
    });
    const octx = reelNoteContext(old, WORDS, 'mono');
    const counter = (g: { label: string }) =>
      applyReelNote(octx, edit({ graphic: { template: 'counter', value: 6, ...g } })).scene
        .content as Extract<ReelTemplate, { template: 'counter' }>;
    expect(counter({ label: 'Tools I used' }).kicker).toBeUndefined();
    expect(counter({ label: 'AI tools I use' })).toMatchObject({
      kicker: 'REVEALING',
      suffix: ' tools?',
    });
    // A different template starts from its own fields only.
    const ctx2 = reelNoteContext(sceneOf(CONTENTS[1]!), WORDS, 'mono');
    const list = applyReelNote(
      ctx2,
      edit({
        graphic: {
          template: 'list',
          title: 'Tools',
          items: [
            { word: 3, text: 'Train faster' },
            { word: 5, text: 'Notes' },
          ],
        },
      }),
    ).scene.content as Extract<ReelTemplate, { template: 'list' }>;
    expect(list.items.map((x) => x.icon)).toEqual(['video', 'check']);
  });

  it('a new brand gets a fresh logo request (no stale asset) with its domain', () => {
    const scene = sceneOf(CONTENTS[13]!);
    const ctx = reelNoteContext(scene, WORDS, 'mono');
    const res = applyReelNote(
      ctx,
      edit({
        graphic: { template: 'logo', brand: 'Zeta', sub: 'Notes app' },
        brands: [{ name: 'Zeta', domain: 'zeta.example' }],
      }),
    );
    const c = res.scene.content as Extract<ReelTemplate, { template: 'logo' }>;
    expect(c.media).toEqual({ kind: 'logo', query: 'Zeta|zeta.example' });
    expect(c.name).toBe('Zeta');
  });

  it('enforces layouts: speaker templates go full-frame, graphics leave the speaker layout', () => {
    const graphic = sceneOf(CONTENTS[0]!);
    const toNone = applyReelNote(
      reelNoteContext(graphic, WORDS, 'mono'),
      edit({ graphic: { template: 'none' } }),
    );
    expect(toNone.scene.layout).toBe('speaker');
    expect(toNone.scene.content).toEqual({ template: 'none' });

    const speaker = sceneOf(CONTENTS[17]!);
    const toHeadline = applyReelNote(
      reelNoteContext(speaker, WORDS, 'cream'),
      edit({ graphic: { template: 'headline', title: 'Finish it' } }),
    );
    expect(toHeadline.scene.layout).toBe('card');

    const asked = applyReelNote(reelNoteContext(graphic, WORDS, 'mono'), edit({ layout: 'card' }));
    expect(asked.scene.layout).toBe('split');
    const full = applyReelNote(reelNoteContext(graphic, WORDS, 'mono'), edit({ layout: 'full' }));
    expect(full.scene.layout).toBe('full');
  });

  // Lab finding (spec 29): "remove this graphic, just show me" came back as a bare speaker layout.
  it('a speaker layout without a speaker graphic shows the speaker alone; unchanged is unchanged', () => {
    const graphic = sceneOf(CONTENTS[0]!);
    const ctx = reelNoteContext(graphic, WORDS, 'mono');
    const res = applyReelNote(ctx, edit({ layout: 'speaker' }));
    expect(res.scene.layout).toBe('speaker');
    expect(res.scene.content).toEqual({ template: 'none' });
    const kept = applyReelNote(
      reelNoteContext(sceneOf(CONTENTS[18]!), WORDS, 'mono'),
      edit({ layout: 'speaker' }),
    );
    expect(kept.scene.content).toMatchObject({ template: 'cta' });
    // The same graphic with its keys in another order is no change.
    const reordered = applyReelNote(
      ctx,
      edit({
        graphic: {
          accent: 'tools',
          sub: 'Replaced my team',
          kicker: 'My stack',
          title: 'Six tools',
          template: 'headline',
        },
      }),
    );
    expect(reordered.changed).toBe(false);
  });

  it('tags are mono-only and removable; carry drops when the template changes', () => {
    const scene = sceneOf(CONTENTS[2]!, { tag: 'OPTIONS', carry: true });
    const ctx = reelNoteContext(scene, WORDS, 'mono');
    expect(applyReelNote(ctx, edit({ tag: '' })).scene.tag).toBeUndefined();
    expect(applyReelNote(ctx, edit({ tag: 'Choices' })).scene.tag).toBe('Choices');
    expect(applyReelNote(ctx, edit({ tag: 'X' })).scene.carry).toBe(true);
    const swapped = applyReelNote(
      ctx,
      edit({ graphic: { template: 'headline', title: 'Pick one' } }),
    );
    expect(swapped.scene.carry).toBeUndefined();
    const cream = reelNoteContext(scene, WORDS, 'cream');
    expect(applyReelNote(cream, edit({ tag: 'Choices' })).scene.tag).toBeUndefined();
  });

  it('a new item lands on its spoken word; an item without a word is spread in the scene', () => {
    const scene = sceneOf(CONTENTS[11]!);
    const ctx = reelNoteContext(scene, WORDS, 'mono');
    const res = applyReelNote(
      ctx,
      edit({
        graphic: {
          template: 'flow',
          items: [
            { word: 2, text: 'Find', icon: 'search' },
            { word: 5, text: 'Ship', icon: 'check' },
            { word: 8, text: 'Grow', icon: 'trending-up' },
          ],
        },
      }),
    );
    const steps = (res.scene.content as Extract<ReelTemplate, { template: 'flow' }>).steps;
    expect(steps.map((s) => s.at)).toEqual([at(2), at(5), at(8)]);
    for (const s of steps) {
      expect(s.at).toBeGreaterThanOrEqual(scene.startMs);
      expect(s.at).toBeLessThan(scene.endMs);
    }
  });

  it('"none" changes nothing and passes its message on', () => {
    const ctx = reelNoteContext(sceneOf(CONTENTS[0]!), WORDS, 'mono');
    const res = applyReelNote(
      ctx,
      ReelNoteOutputSchema.parse({ action: 'none', message: 'Fonts are fixed.' }),
    );
    expect(res.changed).toBe(false);
    expect(res.message).toBe('Fonts are fixed.');
  });

  it('only changes the hook when the scene shows one', () => {
    const ctx = reelNoteContext(sceneOf(CONTENTS[0]!), WORDS, 'mono');
    expect(applyReelNote(ctx, edit({ hook: 'New hook' }), { hook: 'Old hook' }).hook).toBe(
      'New hook',
    );
    expect(applyReelNote(ctx, edit({ hook: '' }), { hook: 'Old hook' }).hook).toBeNull();
    expect(applyReelNote(ctx, edit({ hook: 'New hook' })).hook).toBeUndefined();
  });

  it('any valid answer gives a valid scene inside the scene window (property)', () => {
    const text = fc.string({ minLength: 0, maxLength: 90 });
    const item = fc.record({
      word: fc.option(fc.integer({ min: -5, max: 60 }), { nil: undefined }),
      text,
      icon: fc.option(fc.constantFrom('check', 'nope', 'rocket'), { nil: undefined }),
    });
    const graphic = fc.oneof(
      fc.record({ template: fc.constant('headline' as const), title: text }),
      fc.record({
        template: fc.constant('list' as const),
        title: text,
        items: fc.array(item, { maxLength: 8 }),
      }),
      fc.record({
        template: fc.constant('statement' as const),
        items: fc.array(item, { maxLength: 6 }),
      }),
      fc.record({ template: fc.constant('punch' as const), text }),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 19 }),
        graphic,
        fc.constantFrom('mono', 'cream'),
        (k, g, look) => {
          const scene = sceneOf(CONTENTS[k]!, { startMs: 900, endMs: 4500 });
          const ctx = reelNoteContext(scene, WORDS, look as 'mono' | 'cream');
          let res;
          try {
            res = applyReelNote(ctx, edit({ graphic: g }));
          } catch {
            return; // an unusable graphic is rejected, never half-applied
          }
          expect(ReelSceneSchema.safeParse(res.scene).success).toBe(true);
          expect(res.scene.startMs).toBe(900);
          expect(res.scene.endMs).toBe(4500);
          const speakerTpl = ['punch', 'cta', 'none'].includes(res.scene.content.template);
          expect(res.scene.layout === 'speaker').toBe(speakerTpl);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('reel.note checks and prompt (spec 29 R2)', () => {
  const scene = sceneOf(CONTENTS[0]!);
  const ctx = reelNoteContext(scene, WORDS, 'mono');
  const input = reelNoteInput(ctx, {
    sceneIndex: 0,
    sceneCount: 5,
    note: { text: 'make this say Work smarter', region: { x: 0.1, y: 0.1, w: 0.5, h: 0.2 } },
    target: { parts: ['graphic'], texts: ['SIX TOOLS'], pictures: [] },
    caption: 'w3 w4',
    hook: 'Six tools',
  });

  it('rejects an edit that changes nothing, a broken graphic and a caption fix that matches nothing', () => {
    expect(checkReelNote(edit({}), input)).toMatch(/changes nothing/);
    expect(
      checkReelNote(edit({ graphic: { template: 'list', title: 'x', items: [] } }), input),
    ).toMatch(/list/);
    expect(checkReelNote(edit({ captions: [{ find: 'nope', replace: 'yes' }] }), input)).toMatch(
      /does not match/,
    );
    expect(checkReelNote(edit({ captions: [{ find: 'W3', replace: 'three' }] }), input)).toBeNull();
    expect(
      checkReelNote(edit({ graphic: { template: 'headline', title: 'Work smarter' } }), input),
    ).toBeNull();
    // Text the builder would cut mid-way goes back to the model to shorten.
    expect(
      checkReelNote(
        edit({
          graphic: {
            template: 'flow',
            items: [
              { word: 1, text: 'Record' },
              { word: 2, text: 'Train my assistant' },
            ],
          },
        }),
        input,
      ),
    ).toMatch(/"Train my assistant" → "Train my assista"/);
  });

  it('tells the model what was circled, the scene and the note', () => {
    const p = reelNotePromptV1(input);
    expect(p).toContain('Scene 1 of 5');
    expect(p).toContain('Circled: graphic.');
    expect(p).toContain('"SIX TOOLS"');
    expect(p).toContain('Hook band: "Six tools"');
    expect(p).toContain('Note: "make this say Work smarter"');
    expect(p).toContain('3@0.90 w3');
  });

  it('finds caption words across punctuation, case and split tokens', () => {
    const ws = [{ text: 'I' }, { text: 'use' }, { text: 'mid-journey,' }, { text: 'daily.' }];
    expect(findWordRun(ws, 'Mid journey')).toEqual({ start: 2, end: 2 });
    expect(findWordRun(ws, 'use mid-journey')).toEqual({ start: 1, end: 2 });
    expect(findWordRun(ws, 'nothing here')).toBeNull();
  });
});
