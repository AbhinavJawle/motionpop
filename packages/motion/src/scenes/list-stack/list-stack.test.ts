// @vitest-environment happy-dom
import fc from 'fast-check';
import { FORMATS, type StylePack } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import type { Format } from '../../contract';
import { contains, insetForCamera, safeArea, type Box } from '../../core/safe-area';
import { editorialExplainer, fieldNotes, paperCollage } from '../../styles';
import { assertSeekPure } from '../../testing/seek-pure';
import { arbitrary } from './samples';
import { layoutListStack, listFromWords, listStack, type ListStackContent } from './index';

const FORMAT_IDS: Format[] = ['16:9', '9:16', '1:1'];
const VARIANTS = listStack.variants.map((v) => v.id);
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const SHOW: ListStackContent = {
  title: 'Three rules for saving',
  items: ['Pay yourself first', 'Automate every transfer', 'Never touch the buffer'],
};

describe('list-stack schema and words', () => {
  it('accepts 3 to 5 items and rejects anything else', () => {
    const ok = (content: unknown, variant?: string) =>
      listStack.params.safeParse({ ...(variant ? { variant } : {}), content }).success;
    expect(ok(SHOW)).toBe(true);
    expect(ok(SHOW, 'grid')).toBe(false);
    expect(ok({ items: ['A', 'B'] })).toBe(false);
    expect(ok({ items: ['A', 'B', 'C', 'D', 'E', 'F'] })).toBe(false);
    expect(ok({ ...SHOW, highlight: 3 })).toBe(false);
    expect(ok({ items: ['one two three four five six seven', 'B', 'C'] })).toBe(false);
  });

  it('reads items after ordinals or from "A, B and C", in spoken words only', () => {
    expect(
      listFromWords('First, write the plan. Second, test it. Third, ship it.'.split(' ')),
    ).toEqual({ items: ['Write the plan', 'Test it', 'Ship it'] });
    expect(listFromWords('You need time, money and patience.'.split(' '))).toEqual({
      items: ['Time', 'Money', 'Patience'],
    });
    expect(listFromWords('Every pantry needs rice, beans, olive oil and salt.'.split(' '))).toEqual(
      { items: ['Rice', 'Beans', 'Olive oil', 'Salt'] },
    );
    expect(listFromWords('Cats and dogs.'.split(' '))).toBeNull();
  });
});

describe('list-stack layout', () => {
  it('keeps every box inside the camera-safe area and apart, for every variant and format', () => {
    for (const format of FORMAT_IDS) {
      const { width, height } = FORMATS[format];
      const safe = insetForCamera(safeArea(format, width, height), width, height, 1.14);
      for (const variant of VARIANTS)
        for (const items of [
          SHOW.items,
          ['Rice', 'Beans', 'Olive oil', 'Salt'],
          ['Six words in this item here', 'B', 'Internationalisation of every team', 'D', 'E'],
        ])
          for (const title of [true, false]) {
            const tag = `${variant} ${format} ${items.length} title=${title}`;
            const L = layoutListStack(variant, format, width, height, safe, { items, title });
            const texts = [
              ...(L.title ? [L.title.box] : []),
              ...L.rows.flatMap((r) => [r.text.box, ...(r.num ? [r.num.box] : [])]),
            ];
            for (const b of [...texts, ...L.rows.flatMap((r) => (r.card ? [r.card] : []))])
              expect(contains(safe, b, 1), `${tag} ${JSON.stringify(b)}`).toBe(true);
            texts.forEach((a, i) =>
              texts.slice(i + 1).forEach((b) => expect(overlaps(a, b), tag).toBe(false)),
            );
            const cards = L.rows.flatMap((r) => (r.card ? [r.card] : []));
            cards.forEach((a, i) =>
              cards.slice(i + 1).forEach((b) => expect(overlaps(a, b), tag).toBe(false)),
            );
          }
    }
  });
});

describe('list-stack build', () => {
  const mount = (content: ListStackContent, variant: string, extra: object = {}) => {
    const root = document.createElement('div');
    document.body.append(root);
    const comp = listStack.build(
      {
        root,
        ...FORMATS['16:9'],
        format: '16:9',
        style: editorialExplainer,
        durationMs: listStack.durationMs.ideal,
        keyMomentMs: 1200,
        fps: 30,
        seed: 5,
        warn: () => {},
        ...extra,
      },
      listStack.params.parse({ variant, content }),
    );
    return { root, comp, done: () => (comp.dispose(), root.remove()) };
  };

  it('schedules one cue per item and numbers them 01 to 0n', () => {
    const b = mount(SHOW, 'numbered');
    expect(b.comp.report.plan.cues.map((q) => q.id)).toEqual(['title', 'i1', 'i2', 'i3']);
    expect(b.root.querySelector('[data-actor="num-3"]')?.textContent).toBe('03');
    expect(b.root.querySelector('[data-focal]')?.getAttribute('data-actor')).toBe('item-1');
    b.done();
  });

  it('lands each item on its first spoken word', () => {
    const words = Array.from({ length: 14 }, (_, i) => ({
      startMs: 200 + i * 320,
      endMs: 450 + i * 320,
    }));
    const root = document.createElement('div');
    document.body.append(root);
    const comp = listStack.build(
      {
        root,
        ...FORMATS['9:16'],
        format: '9:16',
        style: fieldNotes,
        look: fieldNotes,
        durationMs: 7000,
        keyMomentMs: 1200,
        fps: 30,
        seed: 2,
        warn: () => {},
        words,
      },
      listStack.params.parse({
        variant: 'cards',
        content: SHOW,
        beats: [
          { cue: 'i1', word: 4 },
          { cue: 'i2', word: 7 },
          { cue: 'i3', word: 11 },
        ],
      }),
    );
    for (const [cue, w] of [
      ['i1', 4],
      ['i2', 7],
      ['i3', 11],
    ] as const)
      expect(comp.report.plan.cues.find((q) => q.id === cue)?.landMs).toBe(words[w]!.startMs);
    comp.dispose();
    root.remove();
  });

  it('seeks purely for random lists in every format and look', () => {
    fc.assert(
      fc.property(
        arbitrary,
        fc.constantFrom(...FORMAT_IDS),
        fc.constantFrom<StylePack>(editorialExplainer, fieldNotes, paperCollage),
        (score, format, style) => {
          assertSeekPure(listStack, listStack.params.parse(score), { format, numRuns: 5, style });
        },
      ),
      { numRuns: 20 },
    );
  });
});
