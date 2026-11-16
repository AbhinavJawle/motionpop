// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { assertSeekPure } from '../../testing/seek-pure';
import { countries } from './geo';
import { frameOn, mapFromWords, mapZoom, placeTarget } from './index';

describe('map-zoom places', () => {
  it('resolves countries by spoken name and alias, cities to points, continents to regions', () => {
    expect(placeTarget('Japan')).toMatchObject({ kind: 'country', neName: 'Japan' });
    expect(placeTarget('the US')).toMatchObject({
      kind: 'country',
      neName: 'United States of America',
    });
    expect(placeTarget('Britain')).toMatchObject({ kind: 'country', neName: 'United Kingdom' });
    expect(placeTarget("Côte d'Ivoire")).toMatchObject({ kind: 'country' });
    expect(placeTarget('Ivory Coast')).toMatchObject({ kind: 'country', neName: "Côte d'Ivoire" });
    expect(placeTarget('New York')).toMatchObject({ kind: 'point', name: 'New York' });
    expect(placeTarget('Singapore')).toMatchObject({ kind: 'point' });
    expect(placeTarget('Europe')).toMatchObject({ kind: 'region' });
    expect(placeTarget('Atlantis')).toBeNull();
  });

  it('every bundled country resolves by its own name', () => {
    for (const name of countries().names) expect(placeTarget(name), name).not.toBeNull();
  });

  it('takes the first drawable place from the words, longest first, never the pronoun "us"', () => {
    expect(mapFromWords(['Now', 'look', 'at', 'Japan.'])).toEqual({
      place: 'Japan',
      label: 'Japan',
    });
    expect(mapFromWords(['flights', 'to', 'New', 'York', 'doubled'])?.place).toBe('New York');
    expect(mapFromWords(['tell', 'us', 'more'])).toBeNull();
    expect(mapFromWords(['no', 'place', 'here'])).toBeNull();
  });

  it('frames the target inside the focus box at the requested share', () => {
    const f = frameOn(
      [
        [100, 100],
        [200, 150],
      ],
      { x: 0, y: 0, width: 1000, height: 500 },
      0.6,
    );
    expect(f.k).toBeCloseTo(6, 5);
    expect([f.cx, f.cy, f.fx, f.fy]).toEqual([150, 125, 500, 250]);
  });
});

describe('map-zoom seek', () => {
  for (const variant of ['zoom', 'pin', 'spotlight'] as const)
    for (const place of ['Japan', 'Tokyo', 'Europe'])
      it(`${variant} ${place} is a pure function of time in every format`, () => {
        const p = { content: { place, label: place }, beats: [], images: [], variant };
        for (const format of mapZoom.formats)
          assertSeekPure(mapZoom, p, { format, durationMs: 5000, numRuns: 40 });
      });
});
