import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bareWord,
  companionSig,
  iconFor,
  lineCompanion,
  numberCompanion,
  picturableNouns,
  type NumberFacts,
} from './companion';

const facts = (over: Partial<NumberFacts> & { value: number }): NumberFacts => ({
  label: '',
  spoken: [],
  ...over,
});

describe('numberCompanion (spec 07c R2.1 derivation table)', () => {
  it('draws a percentage as a unit grid filled to that share', () => {
    expect(
      numberCompanion(
        facts({ value: 42, suffix: '%', spoken: ['42', 'percent', 'of', 'workers'] }),
      ),
    ).toEqual({ kind: 'units', filled: 42, icon: 'percent' });
    expect(numberCompanion(facts({ value: 100, suffix: '%' }))).toEqual({
      kind: 'units',
      filled: 100,
    });
  });

  it('draws a length as a ruler, with the thing it measures as the icon when it has one', () => {
    expect(numberCompanion(facts({ value: 400, spoken: ['400', 'metres', 'long'] }))).toEqual({
      kind: 'ruler',
    });
    expect(
      numberCompanion(facts({ value: 81, spoken: ['81', 'kilometres', 'of', 'canal'] })),
    ).toEqual({ kind: 'ruler', icon: 'ship' });
  });

  it('draws money and k/M/B amounts as a stamp with a money icon', () => {
    expect(numberCompanion(facts({ value: 12, prefix: '$', suffix: 'bn' }))).toEqual({
      kind: 'stamp',
      icon: 'coins',
    });
    expect(numberCompanion(facts({ value: 5, suffix: 'k', spoken: ['5k', 'goods'] }))).toEqual({
      kind: 'stamp',
      icon: 'banknote',
    });
    expect(numberCompanion(facts({ value: 3, suffix: 'M' }))).toEqual({
      kind: 'stamp',
      icon: 'coins',
    });
  });

  it('draws a small count of a nameable thing as that many icons', () => {
    expect(numberCompanion(facts({ value: 6, spoken: ['6', 'ships', 'waiting'] }))).toEqual({
      kind: 'icons',
      n: 6,
      icon: 'ship',
    });
    expect(numberCompanion(facts({ value: 12, spoken: ['12', 'trucks'] }))).toEqual({
      kind: 'icons',
      n: 12,
      icon: 'truck',
    });
  });

  it('draws larger whole counts as dots, with no icon when the words name none', () => {
    expect(numberCompanion(facts({ value: 300, spoken: ['300', 'seats'] }))).toEqual({
      kind: 'dots',
      n: 300,
    });
    expect(numberCompanion(facts({ value: 20, spoken: ['20', 'ships'] }))).toEqual({
      kind: 'dots',
      n: 20,
      icon: 'ship',
    });
  });

  it('never draws a year as dots', () => {
    expect(numberCompanion(facts({ value: 1914, spoken: ['1914', 'war'] }))).toEqual({
      kind: 'stamp',
      icon: 'swords',
    });
    expect(numberCompanion(facts({ value: 1914, spoken: ['1914'] }))).toBeNull();
  });

  it('draws a single number as a stamp with the first icon the words name', () => {
    expect(numberCompanion(facts({ value: 1, spoken: ['1', 'ship'] }))).toEqual({
      kind: 'stamp',
      icon: 'ship',
    });
  });

  it('draws nothing when no honest form exists', () => {
    expect(numberCompanion(facts({ value: 700, spoken: ['700', 'sheep'] }))).toBeNull();
    expect(numberCompanion(facts({ value: 1 }))).toBeNull();
    // Zero is not a count the dots or icons can show, so it falls to the stamp (spec 07c R2.1, "otherwise").
    expect(numberCompanion(facts({ value: 0, spoken: ['0', 'ships'] }))).toEqual({
      kind: 'stamp',
      icon: 'ship',
    });
  });

  it('is a pure function of its input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3000 }),
        fc.array(fc.constantFrom('ships', 'users', 'the', 'metres', 'coins', 'x'), {
          maxLength: 4,
        }),
        (value, words) => {
          const f = facts({ value, spoken: [String(value), ...words] });
          expect(numberCompanion(f)).toEqual(numberCompanion({ ...f }));
        },
      ),
    );
  });
});

describe('lineCompanion and companionSig', () => {
  it('stamps a line with its first concrete noun, or nothing', () => {
    expect(lineCompanion(['The', 'factory', 'closed', 'in', 'May'])).toEqual({
      kind: 'stamp',
      icon: 'factory',
    });
    expect(lineCompanion(['Growth', 'and', 'time'])).toEqual({
      kind: 'stamp',
      icon: 'trending-up',
    });
    expect(lineCompanion(['nothing', 'to', 'see'])).toBeNull();
  });

  it('signs a companion by kind, stamps by icon, and none as "type"', () => {
    expect(companionSig(null)).toBe('type');
    expect(companionSig({ kind: 'units', filled: 5 })).toBe('units');
    expect(companionSig({ kind: 'stamp', icon: 'ship' })).toBe('stamp:ship');
    expect(companionSig({ kind: 'stamp', icon: 'ship' })).not.toBe(
      companionSig({ kind: 'stamp', icon: 'coins' }),
    );
  });
});

describe('picturableNouns (spec 07c R1.2)', () => {
  it('keeps concrete nouns in order without repeats', () => {
    expect(picturableNouns(['The', 'ships', 'left', 'the', 'canal', 'ships'])).toEqual([
      'ships',
      'canal',
    ]);
  });

  it('excludes abstract icons (ideas you cannot photograph)', () => {
    expect(picturableNouns(['growth', 'time', 'people', 'trust', 'heart', 'decades'])).toEqual([]);
    expect(picturableNouns(['factory', 'growth'])).toEqual(['factory']);
  });

  it('never returns a word that has no lexicon icon', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 12 }), (words) => {
        for (const n of picturableNouns(words)) {
          const icon = iconFor(n);
          expect(icon).not.toBeNull();
        }
      }),
    );
  });

  it('normalises edge punctuation and case', () => {
    expect(bareWord('“Ships,”')).toBe('ships');
    expect(picturableNouns(['“Ships,”'])).toEqual(['ships']);
  });
});
