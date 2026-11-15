import fc from 'fast-check';
import { SlotSuggestionsSchema } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { catalogueEntry, skillEntry } from './catalogue';
import { bigNumberParams, detectLocal, reasonFor, sentenceIndex, slotBudget } from './detect-local';
import type { SlotWord, TaggedSpan } from './types';

/** Words spaced 400 ms apart unless a [text, start, end] tuple is given. */
function words(...items: (string | readonly [string, number, number])[]): SlotWord[] {
  let t = 0;
  return items.map((it) => {
    if (typeof it !== 'string') return { text: it[0], startMs: it[1], endMs: it[2], filler: false };
    const w = { text: it, startMs: t, endMs: t + 300, filler: false };
    t += 400;
    return w;
  });
}

// The demo transcript (apps/web/lib/projects/fixture.ts), 15.7 s of speech.
const DEMO = words(
  ["Let's", 0, 440],
  ['look', 530, 980],
  ['at', 1100, 1360],
  ['the', 1500, 1840],
  ['numbers.', 2050, 2840],
  ['Our', 3550, 3980],
  ['revenue', 4200, 4780],
  ['grew', 4980, 5480],
  ['forty', 5580, 6050],
  ['percent', 6180, 6830],
  ['since', 6950, 7400],
  ['2020.', 7500, 7800],
  ['And', 8650, 9050],
  ['this', 9200, 9600],
  ['is', 9720, 9980],
  ['only', 10120, 10620],
  ['the', 10750, 11080],
  ['beginning.', 11200, 12020],
  ["Here's", 13100, 13700],
  ['what', 13850, 14350],
  ['comes', 14500, 15130],
  ['next.', 15300, 15740],
);
// What the tagger (task 2) should produce for it.
const DEMO_SPANS: TaggedSpan[] = [
  { wordStart: 7, wordEnd: 7, kind: 'comparison', text: 'grew' },
  { wordStart: 8, wordEnd: 9, kind: 'number', text: 'forty percent', value: 40, unit: '%' },
  { wordStart: 11, wordEnd: 11, kind: 'year', text: '2020.', value: 2020 },
];

describe('detectLocal on the demo transcript', () => {
  const out = detectLocal(DEMO, DEMO_SPANS);

  it('suggests the 40 % moment as a ready-to-render big number', () => {
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      componentId: 'big-number',
      skillId: 'shocking-stat-reveal',
      score: 0.95,
      wordStart: 5,
      wordEnd: 9,
      params: { value: 40, suffix: '%', decimals: 0, label: 'Our revenue grew' },
      reason: "You said 'Our revenue grew forty percent'",
    });
    expect(out[0]?.needsInput).toBeUndefined();
  });

  it('passes the SlotSuggestion schema and uses catalogue ids only', () => {
    expect(SlotSuggestionsSchema.safeParse(out).success).toBe(true);
    for (const s of out) {
      expect(catalogueEntry(s.componentId)).toBeDefined();
      expect(skillEntry(s.skillId)).toBeDefined();
    }
  });
});

describe('scoring and mapping', () => {
  const w = words(
    'In',
    'Paris,',
    'sales',
    'went',
    'from',
    '10',
    'to',
    '40.',
    'Then',
    'Alice',
    'Moreau',
    'spoke.',
  );
  const spans: TaggedSpan[] = [
    { wordStart: 1, wordEnd: 1, kind: 'place', text: 'Paris,' },
    {
      wordStart: 4,
      wordEnd: 7,
      kind: 'comparison',
      text: 'from 10 to 40.',
      fromValue: 10,
      value: 40,
    },
    { wordStart: 9, wordEnd: 10, kind: 'name', text: 'Alice Moreau' },
  ];

  it('maps each kind to its component and skill, best first within the budget', () => {
    const out = detectLocal(w, spans, { maxSlots: 3 });
    expect(out.map((s) => [s.componentId, s.skillId, s.score])).toEqual([
      ['map-zoom', 'zoom-from-world-to-place', 0.65],
      ['bar-chart', 'contrast-split', 0.8],
      ['callout', 'calm-explanation', 0.4],
    ]);
    expect(out.every((s) => s.needsInput && s.needsInput.length > 0)).toBe(true);
  });

  it('keeps only the best when the budget is tight', () => {
    expect(detectLocal(w, spans, { maxSlots: 1 }).map((s) => s.componentId)).toEqual(['bar-chart']);
  });

  it('turns two years in one sentence into a trend, and ignores a lone year', () => {
    const y = words('From', '2019', 'to', '2023', 'it', 'climbed.', 'In', '2024.');
    const out = detectLocal(
      y,
      [
        { wordStart: 1, wordEnd: 1, kind: 'year', text: '2019', value: 2019 },
        { wordStart: 3, wordEnd: 3, kind: 'year', text: '2023', value: 2023 },
        { wordStart: 7, wordEnd: 7, kind: 'year', text: '2024.', value: 2024 },
      ],
      { maxSlots: 5 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      componentId: 'line-chart',
      wordStart: 0,
      wordEnd: 3,
      score: 0.6,
    });
  });

  it('needs at least three list items', () => {
    const l = words('Apples,', 'pears', 'and', 'plums.');
    const span = (items: number): TaggedSpan => ({
      wordStart: 0,
      wordEnd: 3,
      kind: 'list',
      text: 'x',
      items,
    });
    expect(detectLocal(l, [span(2)])).toEqual([]);
    expect(detectLocal(l, [span(3)])[0]?.componentId).toBe('kinetic-headline');
  });

  it('never picks overlapping candidates', () => {
    const n = words('Profit', 'hit', '$2.5M', 'this', 'year.');
    const out = detectLocal(
      n,
      [
        { wordStart: 2, wordEnd: 2, kind: 'number', text: '$2.5M', value: 2_500_000, unit: '$' },
        { wordStart: 2, wordEnd: 2, kind: 'name', text: '$2.5M' },
      ],
      { maxSlots: 5 },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.params).toEqual({
      value: 2.5,
      prefix: '$',
      suffix: 'M',
      decimals: 1,
      label: 'Profit hit',
    });
    expect(out[0]?.score).toBe(0.85);
  });
});

describe('helpers', () => {
  it('splits sentences on . ? ! (including closing quotes)', () => {
    expect(sentenceIndex(words('Hi.', 'You?', '"Yes!"', 'ok'))).toEqual([0, 1, 2, 3]);
  });

  it('budgets one slot per 5 s of speech, at least one', () => {
    expect(slotBudget(DEMO)).toBe(3);
    expect(slotBudget(words('hi'))).toBe(1);
    expect(slotBudget([])).toBe(0);
  });

  it('quotes the exact words without fillers or trailing punctuation', () => {
    const w = words('So', 'um', 'revenue', 'grew.');
    (w[1] as SlotWord).filler = true;
    expect(reasonFor(w, 0, 3)).toBe("You said 'So revenue grew'");
  });

  it('flags a missing label instead of inventing one', () => {
    const w = words('Forty', 'percent!');
    const r = bigNumberParams(
      { wordStart: 0, wordEnd: 1, kind: 'number', text: '', value: 40, unit: '%' },
      w,
      sentenceIndex(w),
    );
    expect(r.needsInput).toEqual(['label']);
    expect(r.params).not.toHaveProperty('label');
  });
});

describe('properties', () => {
  const kinds = ['number', 'year', 'place', 'name', 'comparison', 'list'] as const;
  const arbInput = fc
    .array(fc.stringMatching(/^[A-Za-z0-9]{1,8}[.,?!]?$/), { minLength: 1, maxLength: 60 })
    .chain((texts) => {
      const w = texts.map((text, i) => ({
        text,
        startMs: i * 450,
        endMs: i * 450 + 400,
        filler: false,
      }));
      const span = fc
        .tuple(
          fc.nat(w.length - 1),
          fc.nat(3),
          fc.constantFrom(...kinds),
          fc.integer({ min: 0, max: 1e7 }),
          fc.constantFrom(undefined, '%', '$', 'x'),
          fc.nat(5),
        )
        .map(([start, len, kind, value, unit, items]): TaggedSpan => ({
          wordStart: start,
          wordEnd: Math.min(w.length - 1, start + len),
          kind,
          text: 'x',
          value,
          ...(unit ? { unit: unit as TaggedSpan['unit'] } : {}),
          ...(kind === 'comparison' && items % 2 ? { fromValue: value / 2 } : {}),
          items,
        }));
      return fc.tuple(fc.constant(w), fc.array(span, { maxLength: 12 }));
    });

  it('is deterministic, schema-valid, in timeline order, non-overlapping and within budget', () => {
    fc.assert(
      fc.property(arbInput, ([w, spans]) => {
        const a = detectLocal(w, spans);
        expect(detectLocal(w, spans)).toEqual(a);
        expect(SlotSuggestionsSchema.safeParse(a).success).toBe(true);
        expect(a.length).toBeLessThanOrEqual(slotBudget(w));
        for (let i = 1; i < a.length; i++) {
          expect((a[i] as (typeof a)[number]).wordStart).toBeGreaterThan(
            (a[i - 1] as (typeof a)[number]).wordEnd,
          );
        }
        for (const s of a) expect(s.wordEnd).toBeLessThan(w.length);
      }),
    );
  });
});
