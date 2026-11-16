import { describe, expect, it } from 'vitest';
import { AMBIGUOUS_PLACES, MAX_PLACE_WORDS, PLACES, normalizePlaceKey } from './gazetteer';

describe('PLACES', () => {
  it('has the countries and cities the demo needs', () => {
    for (const p of [
      'france',
      'japan',
      'south korea',
      'united states',
      'united kingdom',
      'usa',
      'uk',
      'new york',
      'paris',
      'tokyo',
      'sao paulo',
      "cote d'ivoire",
      'democratic republic of the congo',
    ]) {
      expect(PLACES.has(p), p).toBe(true);
    }
  });

  it('is large enough: all countries plus about 150 cities', () => {
    expect(PLACES.size).toBeGreaterThanOrEqual(350);
  });

  it('stores only normalised entries (lowercase, ascii, single spaces)', () => {
    for (const p of PLACES) {
      const again = p.split(' ').map(normalizePlaceKey).join(' ');
      expect(again, p).toBe(p);
      expect(p).toBe(p.trim());
      expect(p).not.toMatch(/\s{2,}/);
    }
  });

  it('leaves out the pronoun "us"', () => {
    expect(PLACES.has('us')).toBe(false);
  });

  it('keeps ambiguous names inside the set and caps the n-gram length', () => {
    for (const p of AMBIGUOUS_PLACES) expect(PLACES.has(p), p).toBe(true);
    expect(MAX_PLACE_WORDS).toBe(5);
  });
});

describe('normalizePlaceKey', () => {
  it.each([
    ['Paris,', 'paris'],
    ['"York"', 'york'],
    ['U.S.', 'us'],
    ['U.S.A.', 'usa'],
    ['Côte', 'cote'],
    ['Sao', 'sao'],
    ['D’Ivoire', "d'ivoire"],
    ['Guinea-Bissau.', 'guinea-bissau'],
    ['D.C.', 'dc'],
    ['…', ''],
  ])('%s → %s', (input, expected) => {
    expect(normalizePlaceKey(input)).toBe(expected);
  });
});

describe('gazetteer and the map scene', () => {
  it('every place the tagger finds is one the map-zoom scene can draw', async () => {
    const { placeTarget } = await import('@motionpop/motion');
    const missing = [...PLACES].filter((p) => placeTarget(p) === null);
    expect(missing).toEqual([]);
  });
});
