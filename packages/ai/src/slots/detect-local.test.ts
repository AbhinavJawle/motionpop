import fc from 'fast-check';
import { SlotSuggestionsSchema } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { catalogueEntry, isDetectable, skillEntry, skillWorksWith } from './catalogue';
import {
  bigNumberParams,
  detectLocal,
  hookLine,
  reasonFor,
  sceneDraft,
  sentenceIndex,
  slotBudget,
  versusSides,
} from './detect-local';
import { tagSpans } from './tagger';
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

  // Changed by spec 07 task 27: the number is a stat-punch scene (was big-number) and the
  // opening line a hook-statement draft. The stat leads in only as far as "revenue", the first
  // word 900 ms before "forty" (was back to "Our"), so it doesn't open on an empty frame.
  it('suggests the 40 % moment as a ready-to-render stat-punch, anchored on "forty"', () => {
    // Three since the coverage pass (2026-11-16): the closing stretch gets its spoken line.
    expect(out).toHaveLength(3);
    expect(out[1]).toMatchObject({
      componentId: 'stat-punch',
      skillId: 'shocking-stat-reveal',
      score: 0.95,
      wordStart: 6,
      wordEnd: 9,
      params: {
        content: { value: 40, suffix: '%', decimals: 0, label: 'Our revenue grew', countFrom: 0 },
        beats: [{ cue: 'number', word: 2 }],
        images: [],
      },
      reason: "You said 'revenue grew forty percent'",
    });
    expect(out[1]?.needsInput).toBeUndefined();
  });

  it('drafts a hook for the opening line, line cue on its first word', () => {
    expect(out[0]).toMatchObject({
      componentId: 'hook-statement',
      skillId: 'brand-sting',
      wordStart: 0,
      wordEnd: 4,
      params: { content: { line: "Let's look at the numbers" }, beats: [{ cue: 'line', word: 0 }] },
      needsInput: ['content'],
    });
    // "And this is only the beginning." is a claim after its joining word (2026-11-16), so it
    // is a hook too; "Here's what comes next." still starts its last word too late to be one.
    expect(out[2]).toMatchObject({
      componentId: 'hook-statement',
      wordStart: 12,
      wordEnd: 17,
      params: { content: { line: 'And this is only the beginning' } },
    });
    expect(out.some((s) => s.wordStart >= 18)).toBe(false);
  });

  it('makes the closing claim a hook when the voice leaves time to read it', () => {
    const longer = [...DEMO, { text: 'Stay', startMs: 16200, endMs: 16600, filler: false }];
    const hooks = detectLocal(longer, DEMO_SPANS, { maxSlots: 5 }).filter((s) => s.wordStart >= 18);
    expect(hooks).toMatchObject([
      { componentId: 'hook-statement', skillId: 'calm-explanation', score: 0.55, wordEnd: 21 },
    ]);
  });

  it('passes the SlotSuggestion schema and uses catalogue ids only', () => {
    expect(SlotSuggestionsSchema.safeParse(out).success).toBe(true);
    for (const s of out) {
      expect(catalogueEntry(s.componentId)).toBeDefined();
      expect(isDetectable(s.componentId)).toBe(true);
      const skill = skillEntry(s.skillId);
      expect(skill && skillWorksWith(skill, s.componentId)).toBe(true);
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
    // map-zoom is a built scene now (its draft names the place); the planned components still need input.
    expect(out.find((s) => s.componentId === 'map-zoom')?.needsInput).toBeUndefined();
    expect(
      out
        .filter((s) => s.componentId !== 'map-zoom')
        .every((s) => s.needsInput && s.needsInput.length > 0),
    ).toBe(true);
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
    const l = words('Apples,', 'pears', 'and', 'plums.', 'Then', 'more', 'came', 'later.');
    const span = (items: number): TaggedSpan => ({
      wordStart: 0,
      wordEnd: 3,
      kind: 'list',
      text: 'x',
      items,
    });
    // Changed by spec 07 task 27: a list of 3 is a countdown hook-statement over its sentence
    // (was kinetic-headline). With 2 items, the sentence is still the opening line's hook.
    expect(detectLocal(l, [span(2)]).map((s) => [s.componentId, s.skillId, s.score])).toEqual([
      ['hook-statement', 'brand-sting', 0.58],
    ]);
    expect(detectLocal(l, [span(3)])[0]).toMatchObject({
      componentId: 'hook-statement',
      skillId: 'countdown-ranking',
      score: 0.7,
      params: { content: { line: 'Apples, pears and plums' } },
    });
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
      content: {
        value: 2.5,
        prefix: '$',
        suffix: 'M',
        decimals: 1,
        label: 'Profit hit',
        countFrom: 0,
      },
      images: [],
      beats: [{ cue: 'number', word: 2 }],
    });
    expect(out[0]?.score).toBe(0.85);
  });
});

describe('helpers', () => {
  it('splits sentences on . ? ! (including closing quotes)', () => {
    expect(sentenceIndex(words('Hi.', 'You?', '"Yes!"', 'ok'))).toEqual([0, 1, 2, 3]);
  });

  it('budgets one slot per 3.5 s of speech, at least one', () => {
    expect(slotBudget(DEMO)).toBe(4);
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

describe('hook lines and scene drafts (spec 07 task 27)', () => {
  it('keeps hook lines inside the scene limits: 3 to 14 words, at most 90 characters', () => {
    expect(hookLine(words('Too', 'short.'), 0, 1)).toBeNull();
    const fifteen = words(...Array.from({ length: 15 }, (_, i) => `w${i}`));
    expect(hookLine(fifteen, 0, 14)).toBeNull();
    expect(hookLine(fifteen, 0, 13)).toBe(
      fifteen
        .slice(0, 14)
        .map((w) => w.text)
        .join(' '),
    );
    // 6 words of exactly 90 characters fit; one more word does not.
    const long = words(
      'Extraordinarily',
      'uncharacteristically',
      'incomprehensible',
      'circumstances',
      'surrounding',
      'everything',
      'today.',
    );
    expect(hookLine(long, 0, 5)).toHaveLength(90);
    expect(hookLine(long, 0, 6)).toBeNull();
  });

  it('drops fillers and trailing punctuation, keeps a question mark', () => {
    const w = words('So', 'um', 'what', 'happens', 'next?');
    (w[1] as SlotWord).filler = true;
    expect(hookLine(w, 0, 4)).toBe('So what happens next?');
    expect(hookLine(words('Here', 'we', 'go.'), 0, 2)).toBe('Here we go');
  });

  it('turns a question into a hook', () => {
    const w = words(
      'Prices',
      'rose.',
      'But',
      'who',
      'pays',
      'for',
      'it?',
      'Nobody',
      'really',
      'knows',
      'yet.',
    );
    const hooks = detectLocal(w, [], { maxSlots: 5 }).filter((s) => s.wordStart === 2);
    expect(hooks).toMatchObject([{ componentId: 'hook-statement', score: 0.56 }]);
  });

  it('writes scene params for AI suggestions from the words, and drops what it cannot back', () => {
    const base = { reason: 'r', score: 0.9, params: { anything: true } } as const;
    const stat = sceneDraft(
      {
        ...base,
        wordStart: 5,
        wordEnd: 11,
        componentId: 'stat-punch',
        skillId: 'shocking-stat-reveal',
      },
      DEMO,
      DEMO_SPANS,
    );
    expect(stat?.params).toEqual({
      content: { value: 40, suffix: '%', decimals: 0, label: 'Our revenue grew', countFrom: 0 },
      images: [],
      beats: [{ cue: 'number', word: 3 }],
    });
    // No tagged number inside: never invent one.
    expect(
      sceneDraft(
        {
          ...base,
          wordStart: 12,
          wordEnd: 17,
          componentId: 'stat-punch',
          skillId: 'shocking-stat-reveal',
        },
        DEMO,
        DEMO_SPANS,
      ),
    ).toBeNull();
    const hook = sceneDraft(
      {
        ...base,
        wordStart: 12,
        wordEnd: 17,
        componentId: 'hook-statement',
        skillId: 'calm-explanation',
      },
      DEMO,
      DEMO_SPANS,
    );
    expect(hook).toMatchObject({
      params: {
        content: { line: 'And this is only the beginning' },
        beats: [{ cue: 'line', word: 0 }],
      },
      needsInput: ['content'],
    });
    const other = {
      ...base,
      wordStart: 0,
      wordEnd: 3,
      componentId: 'map-zoom',
      skillId: 'zoom-from-world-to-place',
    };
    expect(sceneDraft(other, DEMO, DEMO_SPANS)).toBe(other);
  });

  it('drafts a versus from the two sides as spoken, each cue on its side, or drops it', async () => {
    // Spec 07 task 23. The draft must be a valid versus score (checked against the scene).
    const { scenes } = await import('@motionpop/motion');
    const w = words('So,', 'electric', 'cars', 'versus', 'petrol', 'cars.', 'Which', 'wins?');
    expect(versusSides(w, 0, 7)).toEqual({
      left: 'Electric cars',
      right: 'Petrol cars',
      leftWord: 1,
      rightWord: 4,
    });
    const base = { reason: 'r', score: 0.7, params: { anything: true } } as const;
    const vs = sceneDraft(
      { ...base, wordStart: 1, wordEnd: 7, componentId: 'versus', skillId: 'contrast-split' },
      w,
      [],
    );
    expect(vs).toMatchObject({
      params: {
        content: { left: 'Electric cars', right: 'Petrol cars' },
        beats: [
          { cue: 'left', word: 0 },
          { cue: 'right', word: 3 },
        ],
      },
      needsInput: ['content'],
    });
    expect(scenes.versus?.params.safeParse(vs?.params).success).toBe(true);
    // Grammar and fillers are skipped, "or" is not a separator, and one side alone is nothing.
    expect(versusSides(words('rent', 'vs', 'buy'), 0, 2)).toMatchObject({ left: 'Rent' });
    expect(versusSides(words('you', 'vs', 'the', 'rest'), 0, 3)).toBeNull();
    expect(versusSides(words('more', 'or', 'less'), 0, 2)).toBeNull();
    expect(versusSides(words('cats', 'versus'), 0, 1)).toBeNull();
    expect(
      sceneDraft(
        { ...base, wordStart: 0, wordEnd: 2, componentId: 'versus', skillId: 'contrast-split' },
        words('more', 'or', 'less'),
        [],
      ),
    ).toBeNull();
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

describe('detectLocal with the real tagger', () => {
  it('tags the demo transcript exactly like the hand-made spans', () => {
    expect(tagSpans(DEMO)).toEqual(DEMO_SPANS);
  });

  it('gives the same suggestions as the hand-made spans', () => {
    const out = detectLocal(DEMO, tagSpans(DEMO));
    expect(out).toEqual(detectLocal(DEMO, DEMO_SPANS));
    expect(out.map((s) => s.componentId)).toEqual([
      'hook-statement',
      'stat-punch',
      'hook-statement',
    ]);
  });
});
