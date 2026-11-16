import { describe, expect, it } from 'vitest';
import { ProgressThrottle, mapProgress, stageOf } from './progress';

describe('stageOf', () => {
  it('maps the producer statuses to our two stages', () => {
    for (const s of ['queued', 'preprocessing', 'rendering']) expect(stageOf(s)).toBe('rendering');
    for (const s of ['encoding', 'assembling']) expect(stageOf(s)).toBe('encoding');
    expect(stageOf('something-new')).toBe('rendering');
  });
});

describe('mapProgress', () => {
  it('fills 1–85 while rendering and 85–99 while encoding', () => {
    expect(mapProgress('rendering', 0)).toBe(1);
    expect(mapProgress('rendering', 100)).toBe(85);
    expect(mapProgress('encoding', 0)).toBe(85);
    expect(mapProgress('encoding', 100)).toBe(99);
    expect(mapProgress('rendering', 50)).toBe(43);
  });

  it('clamps and rounds anything the producer reports', () => {
    expect(mapProgress('rendering', -20)).toBe(1);
    expect(mapProgress('rendering', 400)).toBe(85);
    expect(mapProgress('encoding', Number.NaN)).toBe(85);
    expect(mapProgress('encoding', Number.POSITIVE_INFINITY)).toBe(85);
    expect(Number.isInteger(mapProgress('rendering', 33.3333))).toBe(true);
  });
});

describe('ProgressThrottle (R4.2)', () => {
  it('writes the first move of 2 points, then at most once a second', () => {
    const t = new ProgressThrottle();
    expect(t.offer('rendering', 1, 0)).toEqual({ write: false });
    expect(t.offer('rendering', 5, 10)).toEqual({ write: true, stage: 'rendering', progress: 5 });
    expect(t.offer('rendering', 20, 500)).toEqual({ write: false });
    expect(t.offer('rendering', 20, 1010)).toEqual({
      write: true,
      stage: 'rendering',
      progress: 20,
    });
    expect(t.offer('rendering', 21, 3000)).toEqual({ write: false });
    expect(t.offer('rendering', 22, 3000)).toEqual({
      write: true,
      stage: 'rendering',
      progress: 22,
    });
  });

  it('writes a change of stage at once, even inside the interval or with a small move', () => {
    const t = new ProgressThrottle();
    t.offer('rendering', 40, 0);
    expect(t.offer('encoding', 85, 10)).toEqual({ write: true, stage: 'encoding', progress: 85 });
  });

  it('never lowers progress and never goes back to an earlier stage', () => {
    const t = new ProgressThrottle();
    t.offer('encoding', 90, 0);
    expect(t.offer('rendering', 10, 5000)).toEqual({ write: false });
    expect(t.written).toEqual({ stage: 'encoding', progress: 90 });
    expect(t.offer('rendering', 95, 9000)).toEqual({
      write: true,
      stage: 'encoding',
      progress: 95,
    });
  });

  it('ignores non-numbers', () => {
    const t = new ProgressThrottle();
    expect(t.offer('rendering', Number.NaN, 0)).toEqual({ write: false });
    expect(t.written.progress).toBe(0);
  });
});
