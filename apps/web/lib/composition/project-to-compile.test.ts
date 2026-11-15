import { describe, expect, it } from 'vitest';
import type { Slot } from '@motionpop/schemas';
import { demoProject } from '../projects/fixture';
import { isRenderable, previewCompileInput } from './project-to-compile';

const STAT: Slot = {
  id: 'slot-s',
  startMs: 4200,
  endMs: 8800,
  wordStart: 6,
  wordEnd: 11,
  reason: "You said 'revenue grew forty percent since 2020'",
  componentId: 'stat-punch',
  skillId: 'shocking-stat-reveal',
  prompt: '',
  params: {
    content: { value: 40, suffix: '%', decimals: 0, label: 'Our revenue grew', countFrom: 0 },
    beats: [{ cue: 'number', word: 2 }],
    images: [],
  },
  status: 'ready',
  notes: [],
};

describe('previewCompileInput (spec 07 task 27)', () => {
  it('renders a ready scene and gives it the slot words relative to its start', () => {
    const p = { ...demoProject(), slots: [STAT] };
    expect(isRenderable(STAT)).toBe(true);
    const [slot] = previewCompileInput(p).slots;
    expect(slot).toMatchObject({ id: 'slot-s', componentId: 'stat-punch', params: STAT.params });
    // revenue 4200, grew 4980, forty 5580, …: word 2 ("forty") lands 1380 ms in.
    expect(slot?.words?.slice(0, 3)).toEqual([
      { startMs: 0, endMs: 580 },
      { startMs: 780, endMs: 1280 },
      { startMs: 1380, endMs: 1850 },
    ]);
    expect(slot?.words).toHaveLength(6);
  });

  it('leaves component slots as they were (no voice fields)', () => {
    const slots = previewCompileInput(demoProject()).slots;
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) expect(s.words).toBeUndefined();
  });

  it('skips a scene whose score does not parse', () => {
    expect(isRenderable({ ...STAT, params: { content: { value: 40 } } })).toBe(false);
  });
});
