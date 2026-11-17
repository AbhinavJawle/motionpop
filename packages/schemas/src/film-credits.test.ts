import { describe, expect, it } from 'vitest';
import { APP_CONFIG_DEFAULTS } from './config';
import { costOf } from './cost';
import { SpendRequestSchema } from './credits';
import { ProjectFilmSchema, filmUnits, type Storyboard } from './film';

describe('filmUnits', () => {
  it('counts started 30 s units, at least one', () => {
    expect(filmUnits(0)).toBe(1);
    expect(filmUnits(30_000)).toBe(1);
    expect(filmUnits(30_001)).toBe(2);
    expect(filmUnits(180_000)).toBe(6);
  });
});

describe('film credit cost', () => {
  it('is 5 credits per unit by default', () => {
    expect(costOf('film', 6, APP_CONFIG_DEFAULTS)).toBe(30);
    expect(costOf('film', 1, APP_CONFIG_DEFAULTS)).toBe(5);
  });

  it('uses the remote config override', () => {
    const cfg = { ...APP_CONFIG_DEFAULTS, creditCosts: { film: 7 } };
    expect(costOf('film', 2, cfg)).toBe(14);
  });
});

describe('SpendRequestSchema for film', () => {
  it('accepts a film with units', () => {
    const r = SpendRequestSchema.safeParse({ action: 'film', units: 6, key: 'abcdefgh12' });
    expect(r.success).toBe(true);
  });

  it('still rejects units above 1 for a fixed-price action', () => {
    const r = SpendRequestSchema.safeParse({ action: 'generate', units: 2, key: 'abcdefgh12' });
    expect(r.success).toBe(false);
  });
});

const storyboard: Storyboard = {
  title: 'A film',
  thesis: 'One idea that holds',
  world: 'A harbour at dawn',
  carrier: 'the ship',
  props: [{ id: 'ship', draw: 'a small ship seen from the side', width: 100, height: 60 }],
  beats: [
    {
      id: 'b1',
      wordStart: 0,
      wordEnd: 3,
      lead: 'picture',
      idea: 'A ship leaves the harbour',
      text: ['Leaving'],
      landsOn: 0,
      staging: 'the ship slides in on the first word',
      seam: { kind: 'push', note: 'the ship carries the cut' },
    },
  ],
};

describe('ProjectFilmSchema', () => {
  it('parses a storyboard with props', () => {
    const r = ProjectFilmSchema.safeParse({
      storyboard,
      props: { ship: '<svg viewBox="0 0 100 60"></svg>' },
      madeAt: 1_700_000_000_000,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a film with no storyboard', () => {
    const r = ProjectFilmSchema.safeParse({ props: {}, madeAt: 1 });
    expect(r.success).toBe(false);
  });
});
