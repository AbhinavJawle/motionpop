import fc from 'fast-check';
import { SlotSuggestionsSchema } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { catalogueEntry, isDetectable, skillEntry, skillWorksWith } from './catalogue';
import {
  bigNumberParams,
  chartDraft,
  clauseRanges,
  detectLocal,
  hookLine,
  labelAfter,
  listDraft,
  quoteDraft,
  reasonFor,
  sceneDraft,
  sentenceIndex,
  slotBudget,
  timelineDraft,
  versusSides,
} from './detect-local';
import { postPass } from './post-pass';
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
    // Changed by spec 07 task 24: "from 10 to 40" is a chart-story (was bar-chart).
    // Changed 2026-11-16: names no longer suggest `callout`, so "Alice Moreau" gets no slot here.
    expect(out.map((s) => [s.componentId, s.skillId, s.score])).toEqual([
      ['map-zoom', 'zoom-from-world-to-place', 0.65],
      ['chart-story', 'contrast-split', 0.8],
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
    expect(detectLocal(w, spans, { maxSlots: 1 }).map((s) => s.componentId)).toEqual([
      'chart-story',
    ]);
    // The comparison's own words label its two values, each cue on the word that says it.
    expect(detectLocal(w, spans, { maxSlots: 1 })[0]?.params).toEqual({
      content: {
        labels: ['From', 'To'],
        values: [10, 40],
        decimals: 0,
      },
      images: [],
      // The slot leads in from "sales" (word 2), so "10" is its word 3.
      beats: [
        { cue: 'v1', word: 3 },
        { cue: 'v2', word: 5 },
      ],
    });
  });

  // Changed by spec 07 task 24: years were a line-chart with no data (replaced by chart-story).
  // Now a sentence with a value per year is a line chart-story; years alone make no chart.
  it('charts a value per year as a trend, and makes no chart from years alone', () => {
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
    expect(out.some((s) => s.componentId === 'chart-story')).toBe(false);
    const t = words('Rent', 'was', '900', 'in', '2010', 'and', '2,100', 'in', '2025.');
    const chart = detectLocal(t, tagSpans(t), { maxSlots: 1 })[0];
    expect(chart).toMatchObject({
      componentId: 'chart-story',
      skillId: 'slow-build-trend',
      score: 0.9,
      params: {
        variant: 'line',
        content: {
          labels: ['2010', '2025'],
          values: [900, 2100],
        },
      },
    });
  });

  it('turns words in quote marks into a quote, the cue on the first quoted word', async () => {
    const { scenes } = await import('@motionpop/motion');
    const t = words(
      'Our',
      'first',
      'customer',
      'told',
      'us,',
      '"I',
      'would',
      'pay',
      'double',
      'for',
      'this,"',
      'and',
      'that',
      'changed',
      'everything.',
      'Then',
      'we',
      'grew',
      'fast.',
    );
    const q = detectLocal(t, tagSpans(t), { maxSlots: 3 }).find((s) => s.componentId === 'quote');
    expect(q?.params).toMatchObject({
      content: { quote: 'I would pay double for this' },
      beats: [{ cue: 'quote', word: 5 - (q?.wordStart ?? 0) }],
    });
    expect(scenes['quote']?.params.safeParse(q?.params).success).toBe(true);
    expect(quoteDraft(words('no', 'quote', 'here.'), 0, 2)).toBeNull();
  });

  it('turns three dated events into a timeline, each cue on its year', async () => {
    const { scenes } = await import('@motionpop/motion');
    const t = words(
      'In',
      '1903',
      'the',
      'first',
      'plane',
      'flew.',
      'In',
      '1927',
      'a',
      'pilot',
      'crossed',
      'the',
      'ocean.',
      'And',
      'in',
      '1969',
      'people',
      'walked',
      'on',
      'the',
      'moon.',
    );
    const [tl] = detectLocal(t, tagSpans(t), { maxSlots: 1 });
    expect(tl).toMatchObject({
      componentId: 'timeline',
      skillId: 'journey-along-a-timeline',
      params: {
        content: {
          dates: ['1903', '1927', '1969'],
          events: [
            'The first plane flew',
            'A pilot crossed the ocean',
            'People walked on the moon',
          ],
        },
      },
    });
    expect(tl?.params['beats']).toEqual(
      [1, 7, 15].map((w, k) => ({ cue: `e${k + 1}`, word: w - (tl?.wordStart ?? 0) })),
    );
    expect(scenes['timeline']?.params.safeParse(tl?.params).success).toBe(true);
    // Two years are not a timeline.
    expect(timelineDraft(t, tagSpans(t), 0, 12)).toBeNull();
  });

  it('charts three values in one sentence as one chart-story, labelled by their words', async () => {
    const { scenes } = await import('@motionpop/motion');
    const t = words(
      'Our',
      'team',
      'shipped',
      '12',
      'features',
      'in',
      'March,',
      '19',
      'in',
      'April',
      'and',
      '31',
      'in',
      'May.',
    );
    const [chart] = detectLocal(t, tagSpans(t), { maxSlots: 1 });
    expect(chart?.componentId).toBe('chart-story');
    expect(chart?.params['beats']).toEqual([
      { cue: 'v1', word: 3 - (chart?.wordStart ?? 0) },
      { cue: 'v2', word: 7 - (chart?.wordStart ?? 0) },
      { cue: 'v3', word: 11 - (chart?.wordStart ?? 0) },
    ]);
    expect(scenes['chart-story']?.params.safeParse(chart?.params).success).toBe(true);
    // No label without a spoken word for it: a value with only numbers before it gives no chart.
    expect(chartDraft(words('5', '6', '7.'), tagSpans(words('5', '6', '7.')), 0, 2)).toBeNull();
  });

  it('needs at least three list items', async () => {
    const { scenes } = await import('@motionpop/motion');
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
    // Changed by spec 07 task 33: a list of 3 to 5 items that fit is a list-stack, each item
    // on its first word; one the scene can't hold stays the hook.
    expect(detectLocal(l, [span(2)]).map((s) => [s.componentId, s.skillId, s.score])).toEqual([
      ['hook-statement', 'brand-sting', 0.58],
    ]);
    expect(detectLocal(l, [span(3)])[0]).toMatchObject({
      componentId: 'list-stack',
      skillId: 'countdown-ranking',
      score: 0.7,
      params: {
        content: { items: ['Apples', 'Pears', 'Plums'] },
        beats: [
          { cue: 'i1', word: 0 },
          { cue: 'i2', word: 1 },
          { cue: 'i3', word: 3 },
        ],
      },
    });
    const long = words(
      'Apples,',
      'pears',
      'and',
      'every',
      'single',
      'kind',
      'of',
      'plum',
      'you',
      'can',
      'find.',
    );
    // An item longer than the scene holds: no list-stack (the hook takes over where it fits).
    expect(
      detectLocal(long, [{ ...span(3), wordEnd: 10 }]).some((s) => s.componentId === 'list-stack'),
    ).toBe(false);
    expect(
      scenes['list-stack']?.params.safeParse(detectLocal(l, [span(3)])[0]?.params).success,
    ).toBe(true);
    // Ordinals: the words after each one.
    const steps = words('First,', 'plan', 'it,', 'second,', 'test', 'it,', 'third,', 'ship', 'it.');
    expect(listDraft(steps, 0, 8)?.params).toEqual({
      content: { items: ['Plan it', 'Test it', 'Ship it'] },
      images: [],
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

  it('budgets one slot per 3 s of speech, at least one', () => {
    // Changed 2026-11-16: one slot per 3 s (was 3.5 s). The demo's 15.7 s gives 5.
    expect(slotBudget(DEMO)).toBe(5);
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

describe('clauseRanges', () => {
  const LONG = words(
    'The',
    'team',
    'spent',
    'long',
    'months',
    'testing',
    'the',
    'new',
    'engine,',
    'which',
    'finally',
    'worked',
    'on',
    'the',
    'third',
    'try,',
    'and',
    'everyone',
    'in',
    'the',
    'room',
    'cheered',
    'because',
    'the',
    'hard',
    'work',
    'had',
    'truly',
    'paid',
    'off.',
  ); // 30 words

  it('returns a short sentence as one range', () => {
    const w = words('We', 'grew', 'fast.');
    expect(clauseRanges(w, { start: 0, end: 2 })).toEqual([{ start: 0, end: 2 }]);
  });

  it('splits a 30-word sentence into contiguous ranges of at most 14 words that cover every word once', () => {
    expect(LONG).toHaveLength(30);
    const parts = clauseRanges(LONG, { start: 0, end: 29 });
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]?.start).toBe(0);
    expect(parts[parts.length - 1]?.end).toBe(29);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i] as { start: number; end: number };
      expect(p.end).toBeGreaterThanOrEqual(p.start);
      expect(p.end - p.start + 1).toBeLessThanOrEqual(14);
      if (i > 0) expect(p.start).toBe((parts[i - 1] as { end: number }).end + 1);
    }
  });

  it('every clause has 4 to 14 words, covers the sentence in order (any sentence of 4+ words)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z]{1,8}[,;:]?$|^(and|but|which|so)$/), {
          minLength: 4,
          maxLength: 60,
        }),
        (texts) => {
          const w = words(...texts);
          const parts = clauseRanges(w, { start: 0, end: w.length - 1 });
          expect(parts[0]?.start).toBe(0);
          expect(parts[parts.length - 1]?.end).toBe(w.length - 1);
          parts.forEach((p, i) => {
            const n = p.end - p.start + 1;
            expect(n).toBeGreaterThanOrEqual(4);
            expect(n).toBeLessThanOrEqual(14);
            if (i > 0) expect(p.start).toBe(parts[i - 1]!.end + 1);
          });
        },
      ),
    );
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

describe('clauseRanges merges and coverage (founder 2026-11-16)', () => {
  it('joins a piece under 4 words to its neighbour', () => {
    // "Rates rose," is 2 words: it joins the clause after it.
    const w = words(
      ...'Rates rose, and the banks that had lent against land were left holding bad loans'.split(
        ' ',
      ),
    );
    const r = clauseRanges(w, { start: 0, end: w.length - 1 });
    expect(r[0]).toEqual({ start: 0, end: expect.any(Number) });
    expect(r[0]!.end - r[0]!.start + 1).toBeGreaterThanOrEqual(4);
    expect(
      r.flatMap((x) => Array.from({ length: x.end - x.start + 1 }, (_, i) => x.start + i)),
    ).toEqual(w.map((_, i) => i));
  });

  it('a long explainer is mostly covered, with no empty stretch over 3.5 s', () => {
    const text =
      "In 1989, Japan's stock market was the most valuable on Earth. The Nikkei index closed the year near thirty nine thousand points, and land under the Imperial Palace in Tokyo was said to be worth more than all of California. Then the bubble burst. Within three years the index had lost more than half its value, and it would take thirty four years to climb back to that peak. What happened? Interest rates rose from two and a half percent to six percent in just over a year. Banks that had lent against inflated land suddenly held loans worth far less than they claimed. Instead of writing those loans off, many kept them alive, and a generation of so called zombie companies kept borrowing just to survive. The result was a lost decade, and then another. Wages barely moved. Prices drifted down instead of up. So why does this matter to you? Because the lesson is about time. Diversification is not exciting. But it is the reason a bad decade does not become a bad life.";
    let t = 300;
    const w: SlotWord[] = text.split(' ').map((x) => {
      const len = 180 + 25 * x.length;
      const word = { text: x, startMs: t, endMs: t + len, filler: false };
      t += len + (/[.?!]$/.test(x) ? 450 : /[,;:]$/.test(x) ? 200 : 60);
      return word;
    });
    // What the product saves: the detector's picks through the post-pass (which widens them).
    const s = postPass({ words: w, suggestions: detectLocal(w, tagSpans(w)) });
    const spanMs = (x: { startMs: number; endMs: number }) => x.endMs - x.startMs;
    const total = w[w.length - 1]!.endMs - w[0]!.startMs;
    const covered = s.reduce((a, x) => a + spanMs(x), 0);
    expect(covered / total).toBeGreaterThan(0.8);
    const sorted = [...s].sort((a, b) => a.wordStart - b.wordStart);
    let prev = w[0]!.startMs;
    for (const x of sorted) {
      expect(x.startMs - prev).toBeLessThanOrEqual(3500);
      prev = x.endMs;
    }
    expect(s.some((x) => x.componentId === 'callout')).toBe(false);
  });
});

// Spec 07c task 19 (Kiro run 20): a stat's label comes from the words after the number.
describe('labelAfter (spec 07c R5.1)', () => {
  /** The label for the first word of `ws` (the number), with the sentence split as detection does. */
  const after = (ws: SlotWord[], index = 0) => labelAfter(ws, sentenceIndex(ws), index);

  it('takes the words after the number, up to 6 words', () => {
    const ws = words('369', 'ships', 'queued', 'up', 'at', 'both', 'ends', 'of', 'the', 'canal');
    expect(after(ws)).toBe('Ships queued up at both ends');
  });

  it('stops at a digit and at punctuation', () => {
    expect(after(words('40', 'containers', '2', 'trucks'))).toBe('');
    const ws = words('369', 'days', 'in', 'the', 'queue,', 'and', 'then');
    expect(after(ws)).toBe('Days in the queue');
  });

  it('cuts before a trailing preposition when the word limit cuts the phrase', () => {
    const ws = words('5', 'days', 'waiting', 'for', 'the', 'tide', 'in', 'the', 'rain');
    expect(after(ws)).toBe('Days waiting for the tide');
  });

  it('is empty when the words after the number start with a grammar word', () => {
    expect(after(words('5', 'since', 'then', 'the', 'ships'))).toBe('');
    expect(after(words('5', 'of', 'them'))).toBe('');
  });

  it('is empty when the words run to the next sentence', () => {
    const ws = words('5', 'ships.', 'Then', 'more', 'came');
    expect(after(ws)).toBe('');
  });

  it('is never longer than the limit and never starts with a digit (property)', () => {
    const vocab = [
      'ships',
      'queued',
      'up',
      'at',
      'the',
      'of',
      'in',
      'days',
      'waiting',
      'since',
      'and',
      'port',
      '7',
    ];
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...vocab), { minLength: 1, maxLength: 14 }),
        fc.integer({ min: 1, max: 8 }),
        (rest, max) => {
          const ws = words('369', ...rest);
          const label = labelAfter(ws, sentenceIndex(ws), 0, max);
          if (label === '') return;
          const parts = label.split(' ');
          expect(parts.length).toBeGreaterThanOrEqual(2);
          expect(parts.length).toBeLessThanOrEqual(max);
          expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
          for (const p of parts) expect(/^\d/.test(p)).toBe(false);
        },
      ),
    );
  });
});
