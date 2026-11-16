// @vitest-environment happy-dom
import type { EditorProject, Slot } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { sceneFor } from '../motion/registry';
import { demoProject, demoWords } from '../projects/fixture';
import { GRAPHIC_TYPES } from './graphic-types';
import { looseContent } from './loose';
import { templateParams } from './template';

/** "Our revenue grew forty percent since 2020. And this is only the beginning." */
const ws = demoWords.findIndex((w) => w.text === 'Our');
const we = demoWords.findIndex((w) => w.text === 'beginning.');
const slot: Slot = {
  id: 's1',
  startMs: demoWords[ws]!.startMs,
  endMs: demoWords[we]!.endMs + 1200,
  wordStart: ws,
  wordEnd: we,
  reason: 'x',
  componentId: 'hook-statement',
  skillId: 'calm-explanation',
  prompt: '',
  params: {},
  status: 'ready',
  notes: [],
};
const project = (): EditorProject => ({ ...demoProject(), slots: [slot], versions: [] });

describe('picking a graphic type (founder 2026-11-16: "Couldn’t switch to that one")', () => {
  it('every type the picker offers drafts from plain narration, except what would need inventing', () => {
    const results = Object.fromEntries(
      GRAPHIC_TYPES.map((t) => [
        t.id,
        templateParams(project(), { ...slot, componentId: t.id }, document, true) !== null,
      ]),
    );
    // No place is named, so no map; one number, so a stat but no chart.
    const expected = Object.fromEntries(
      GRAPHIC_TYPES.map((t) => [t.id, t.id !== 'map-zoom' && t.id !== 'chart-story']),
    );
    expect(results).toEqual(expected);
  });

  it('a loose draft parses as the scene’s own params', () => {
    for (const t of GRAPHIC_TYPES) {
      const params = templateParams(project(), { ...slot, componentId: t.id }, document, true);
      if (!params) continue;
      expect(sceneFor(t.id)?.params.safeParse(params).success, t.id).toBe(true);
    }
  });

  it('never invents numbers: no chart from one number, no stat from none', () => {
    expect(looseContent('chart-story', ['It', 'grew', 'forty', 'percent'])).toBeNull();
    expect(
      looseContent('stat-punch', ['And', 'this', 'is', 'only', 'the', 'beginning']),
    ).toBeNull();
    expect(
      looseContent('stat-punch', ['rates', 'hit', 'six', 'percent']),
    ).toMatchObject({
      value: 6,
      suffix: '%',
    });
    expect(
      looseContent('chart-story', 'Rates rose from two percent to six percent'.split(' ')),
    ).toMatchObject({ values: [2, 6] });
  });

  it('a versus takes the two sides of "than" or "but", else the two halves', () => {
    expect(
      looseContent('versus', 'Renting costs less than buying a house'.split(' ')),
    ).toMatchObject({
      left: expect.any(String),
      right: expect.any(String),
    });
  });
});
