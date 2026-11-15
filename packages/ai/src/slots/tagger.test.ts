import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sentenceIndex } from './detect-local';
import { tagSpans } from './tagger';
import type { SlotWord, TaggedSpan } from './types';

/** Words spaced 400 ms apart. A token starting with "~" is a filler ("~um"). */
function mk(input: string): SlotWord[] {
  return input
    .split(' ')
    .filter((t) => t !== '')
    .map((t, i) => ({
      text: t.startsWith('~') ? t.slice(1) : t,
      startMs: i * 400,
      endMs: i * 400 + 300,
      filler: t.startsWith('~'),
    }));
}

/** A span without its word indices, for readable tables. */
function shape(s: TaggedSpan): Record<string, unknown> {
  return {
    kind: s.kind,
    text: s.text,
    ...(s.value !== undefined ? { value: s.value } : {}),
    ...(s.unit !== undefined ? { unit: s.unit } : {}),
    ...(s.fromValue !== undefined ? { fromValue: s.fromValue } : {}),
    ...(s.items !== undefined ? { items: s.items } : {}),
  };
}

type Expected = Record<string, unknown>;
const num = (text: string, value: number, unit?: string): Expected => ({
  kind: 'number',
  text,
  value,
  ...(unit ? { unit } : {}),
});
const year = (text: string, value: number): Expected => ({ kind: 'year', text, value });
const place = (text: string): Expected => ({ kind: 'place', text });
const name = (text: string): Expected => ({ kind: 'name', text });
const cmp = (text: string, extra: Expected = {}): Expected => ({
  kind: 'comparison',
  text,
  ...extra,
});
const list = (text: string, items: number): Expected => ({ kind: 'list', text, items });

const DEMO_TEXT =
  "Let's look at the numbers. Our revenue grew forty percent since 2020. " +
  "And this is only the beginning. Here's what comes next.";

const CASES: [string, string, Expected[]][] = [
  ['demo transcript', DEMO_TEXT, [cmp('grew'), num('forty percent', 40, '%'), year('2020.', 2020)]],
  ['currency with scale', 'Revenue hit $2.5M last year.', [num('$2.5M', 2_500_000, '$')]],
  [
    'from … to with a unit',
    'Sales rose from 10 to 40 percent.',
    [
      cmp('rose'),
      cmp('from 10 to 40 percent.', { fromValue: 10, value: 40, unit: '%' }),
      num('10', 10),
      num('40 percent.', 40, '%'),
    ],
  ],
  [
    'from … to with currency',
    'Rose from $1m to $3m.',
    [
      cmp('Rose'),
      cmp('from $1m to $3m.', { fromValue: 1_000_000, value: 3_000_000, unit: '$' }),
      num('$1m', 1_000_000, '$'),
      num('$3m.', 3_000_000, '$'),
    ],
  ],
  [
    'years in a range stay years',
    'From 2019 to 2023 it climbed.',
    [year('2019', 2019), year('2023', 2023), cmp('climbed.')],
  ],
  [
    'cities and a multi-word place',
    'We flew from New York to Paris, then Tokyo.',
    [place('New York'), place('Paris,'), place('Tokyo.')],
  ],
  [
    'longest place first',
    'The United States and South Korea signed.',
    [place('United States'), place('South Korea')],
  ],
  ['pronoun "us" is not a place', 'Join us today.', []],
  ['"US" in capitals is a place', 'The US economy grew.', [place('US'), cmp('grew.')]],
  [
    '"U.S." ends the sentence, like any full stop',
    'Sales in the U.S. rose.',
    [place('U.S.'), cmp('rose.')],
  ],
  ['ambiguous places need a capital', 'I cooked turkey for Jordan.', [place('Jordan.')]],
  ['name in the middle of a sentence', 'We asked Priya.', [name('Priya.')]],
  [
    'two-word name after a common sentence start',
    'Then Alice Moreau spoke.',
    [name('Alice Moreau')],
  ],
  [
    'sentence-initial capital followed by a capital is a name',
    'Alice Moreau spoke first.',
    [name('Alice Moreau')],
  ],
  ['lone sentence-initial capital is not a name', 'Alice spoke.', []],
  ['"I" is not a name', 'Then I think Priya agreed.', [name('Priya')]],
  ['place beats name', 'She moved to Paris with Marie.', [place('Paris'), name('Marie.')]],
  ['months are not names', 'We launched in March with Priya.', [name('Priya.')]],
  [
    'names split at commas, list of three found',
    'Alice, Bob and Priya agreed.',
    [name('Alice,'), list('Alice, Bob and Priya agreed.', 3), name('Bob'), name('Priya')],
  ],
  [
    'names split from a time word',
    'Yesterday Alice Moreau and Bob spoke.',
    [name('Alice Moreau'), name('Bob')],
  ],
  ['a filler word is never tagged', 'I paid ~forty dollars today.', []],
  [
    'a filler ends a sentence but the number stays in its own sentence',
    'I have forty ~um. Percent matters.',
    [num('forty', 40)],
  ],
  ['no span crosses a full stop', 'From ten. To forty.', [num('ten.', 10), num('forty.', 40)]],
  ['digits with commas', 'We have 1,200 users.', [num('1,200', 1200)]],
  ['pounds and billions', 'It cost £3bn overall.', [num('£3bn', 3_000_000_000, '£')]],
  ['multiplier word', 'Sales doubled.', [num('doubled.', 2, 'x')]],
  ['times as a unit', 'It happened three times.', [num('three times.', 3, 'x')]],
  ['spoken year', 'In twenty twenty it began.', [year('twenty twenty', 2020)]],
  ['hyphenated number', 'We added forty-two seats.', [num('forty-two', 42)]],
  ['brackets around a number', 'It was (forty percent) higher.', [num('(forty percent)', 40, '%')]],
  ['shouting capitals are not names', 'FORTY PERCENT today', [num('FORTY PERCENT', 40, '%')]],
  ['lone "one" is a pronoun', 'No one knew.', []],
  ['"one percent" is a number', 'One percent of users.', [num('One percent', 1, '%')]],
  [
    'ordinal list',
    'First we plan, second we build, third we ship.',
    [list('First we plan, second we build, third we ship.', 3)],
  ],
  ['comma list', 'We sell apples, pears and plums.', [list('apples, pears and plums.', 3)]],
  [
    'comma list with Oxford comma',
    'Pick red, green, and blue.',
    [list('red, green, and blue.', 3)],
  ],
  ['two items are not a list', 'Salt and pepper.', []],
  [
    'comparison words and phrases',
    'Costs fell more than expected versus last year.',
    [cmp('fell'), cmp('more than'), cmp('versus')],
  ],
  [
    'compared to a year',
    'Profit is up compared to 2020.',
    [cmp('compared to'), year('2020.', 2020)],
  ],
  ['empty', '', []],
];

describe('tagSpans table', () => {
  it('has at least 20 cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(CASES)('%s', (_label, input, expected) => {
    expect(tagSpans(mk(input)).map(shape)).toEqual(expected);
  });
});

describe('demo transcript', () => {
  it('returns exactly the spans the detector expects, with indices', () => {
    expect(tagSpans(mk(DEMO_TEXT))).toEqual([
      { wordStart: 7, wordEnd: 7, kind: 'comparison', text: 'grew' },
      { wordStart: 8, wordEnd: 9, kind: 'number', text: 'forty percent', value: 40, unit: '%' },
      { wordStart: 11, wordEnd: 11, kind: 'year', text: '2020.', value: 2020 },
    ]);
  });

  it('finds no names at sentence starts', () => {
    expect(tagSpans(mk(DEMO_TEXT)).filter((s) => s.kind === 'name')).toEqual([]);
  });
});

describe('fillers inside phrases', () => {
  it('spans the filler but leaves it out of the text and the endpoints', () => {
    const spans = tagSpans(mk('Revenue grew ~um forty ~uh percent today.'));
    expect(spans.map(shape)).toEqual([cmp('grew'), num('forty percent', 40, '%')]);
    expect(spans[1]).toMatchObject({ wordStart: 3, wordEnd: 5 });
  });

  it('does not let a filler break a place name', () => {
    const spans = tagSpans(mk('We moved to New ~um York today.'));
    expect(spans.map(shape)).toEqual([place('New York')]);
    expect(spans[0]).toMatchObject({ wordStart: 3, wordEnd: 5 });
  });
});

describe('properties', () => {
  const POOL = [
    'forty',
    'percent',
    'percent.',
    '2020.',
    '2019',
    'Paris,',
    'New',
    'York',
    'the',
    'and',
    'or',
    'grew',
    'from',
    'to',
    '10',
    '40%',
    '$2.5M',
    'Alice',
    'Moreau.',
    'first',
    'second,',
    'third',
    'red,',
    'blue.',
    'I',
    'us',
    'US',
    'more',
    'than',
    'doubled',
    'Then',
    'twenty',
    'hundred',
    'one',
    'x?',
    'wow!',
  ];
  const arbWords = fc
    .array(
      fc.record({
        text: fc.constantFrom(...POOL),
        filler: fc.integer({ min: 0, max: 5 }).map((n) => n === 0),
      }),
      { maxLength: 80 },
    )
    .map((ws): SlotWord[] => ws.map((w, i) => ({ ...w, startMs: i * 400, endMs: i * 400 + 300 })));

  it('never tags a filler, never crosses a sentence, stays in bounds, text matches', () => {
    fc.assert(
      fc.property(arbWords, (words) => {
        const sentence = sentenceIndex(words);
        for (const s of tagSpans(words)) {
          expect(s.wordStart).toBeGreaterThanOrEqual(0);
          expect(s.wordStart).toBeLessThanOrEqual(s.wordEnd);
          expect(s.wordEnd).toBeLessThan(words.length);
          expect(words[s.wordStart]?.filler).toBe(false);
          expect(words[s.wordEnd]?.filler).toBe(false);
          expect(sentence[s.wordStart]).toBe(sentence[s.wordEnd]);
          const joined = words
            .slice(s.wordStart, s.wordEnd + 1)
            .filter((w) => !w.filler)
            .map((w) => w.text)
            .join(' ');
          expect(s.text).toBe(joined);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('is deterministic and ordered by start then end', () => {
    fc.assert(
      fc.property(arbWords, (words) => {
        const a = tagSpans(words);
        expect(tagSpans(words)).toEqual(a);
        for (let i = 1; i < a.length; i++) {
          const p = a[i - 1] as TaggedSpan;
          const c = a[i] as TaggedSpan;
          expect(
            p.wordStart < c.wordStart || (p.wordStart === c.wordStart && p.wordEnd <= c.wordEnd),
          ).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('does not mutate its input', () => {
    fc.assert(
      fc.property(arbWords, (words) => {
        const copy = structuredClone(words);
        tagSpans(words);
        expect(words).toEqual(copy);
      }),
      { numRuns: 100 },
    );
  });
});

describe('performance (R1.4)', () => {
  it('tags 3,000 words quickly', () => {
    const para =
      'Revenue grew forty percent since 2020. In New York and Paris, sales rose from 10 to 40 percent. Alice Moreau said we sell apples, pears and plums. First we plan, second we build, third we ship. It cost $2.5M in Japan. Then Bob left. ';
    const text = para.repeat(Math.ceil(3000 / mk(para).length) + 1);
    const words = mk(text).slice(0, 3000);
    expect(words).toHaveLength(3000);
    tagSpans(words); // warm up the JIT
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      tagSpans(words);
      runs.push(performance.now() - t0);
    }
    const best = Math.min(...runs);
    console.log(
      `tagSpans 3000 words: best ${best.toFixed(2)} ms, runs ${runs.map((r) => r.toFixed(2)).join(', ')}`,
    );
    // Shared CI runners are about 2× slower than a laptop (64 ms seen there); the budget is local.
    expect(best).toBeLessThan(process.env['CI'] ? 120 : 60);
  });
});
