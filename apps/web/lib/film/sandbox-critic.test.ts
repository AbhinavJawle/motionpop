import type { CriticReport, CriticSummary } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import { verdictOf } from './sandbox-critic';

const STATS = {
  textWords: 2,
  texts: ['Hero'],
  shapes: 0,
  hasMap: false,
  hasPaper: false,
  distinctFrames: 5,
  samples: 5,
};

/** A summary with these reports. Only `reports` is read by `verdictOf`. */
const summaryOf = (reports: CriticReport[]): CriticSummary =>
  ({ reports, stats: STATS }) as unknown as CriticSummary;

const fix = (hint: string): CriticReport => ({
  rule: 'late-start',
  level: 'fix',
  atMs: 0,
  hint,
});
const note = (hint: string): CriticReport => ({
  rule: 'late-start',
  level: 'note',
  atMs: 0,
  hint,
});

describe('verdictOf', () => {
  it('passes a beat with no fix reports: no fixes, nothing blocking, not broken', () => {
    const v = verdictOf(summaryOf([]), [], []);
    expect(v).toEqual({ fixes: null, blocking: 0, broken: false });
  });

  it('counts only fix reports as blocking, and notes never block', () => {
    const v = verdictOf(summaryOf([fix('the frame is empty'), note('a small label')]), [], []);
    expect(v.blocking).toBe(1);
    expect(v.fixes).toContain('the frame is empty');
    expect(v.fixes).toContain('a small label');
    expect(v.broken).toBe(false);
  });

  it('is broken when the summary is missing', () => {
    expect(verdictOf(null, [], [])).toEqual({ fixes: null, blocking: 0, broken: true });
  });

  it('is broken when the composition reported an error', () => {
    const errorReport = {
      rule: 'error',
      level: 'fix',
      atMs: 0,
      hint: 'the script threw',
    } as unknown as CriticReport;
    const v = verdictOf(summaryOf([errorReport]), [], []);
    expect(v.broken).toBe(true);
  });

  it('appends the kit warnings after the fixes', () => {
    const v = verdictOf(summaryOf([fix('open on the picture')]), ['a word is not spoken', 'x'], []);
    const lines = (v.fixes ?? '').split('\n');
    expect(lines[0]).toBe('- open on the picture');
    expect(lines.slice(1)).toEqual(['- a word is not spoken', '- x']);
  });

  it('keeps warnings out when the beat passes', () => {
    const v = verdictOf(summaryOf([]), ['a word is not spoken'], []);
    expect(v.fixes).toBeNull();
  });

  it('keeps only the five known sound kinds, rounded, at most 16', () => {
    const sounds = [
      { kind: 'whoosh', atMs: 10.4 },
      { kind: 'bell', atMs: 20 },
      { kind: 'pop', atMs: 30.6 },
      { kind: 'impact', atMs: Number.NaN },
      ...Array.from({ length: 20 }, (_, i) => ({ kind: 'tick', atMs: 100 + i })),
    ];
    const v = verdictOf(summaryOf([]), [], sounds);
    expect(v.cues).toHaveLength(16);
    expect(v.cues?.every((c) => ['whoosh', 'pop', 'tick', 'rise', 'impact'].includes(c.kind))).toBe(
      true,
    );
    expect(v.cues?.[0]).toEqual({ kind: 'whoosh', atMs: 10 });
    expect(v.cues?.[1]).toEqual({ kind: 'pop', atMs: 31 });
    expect(v.cues?.some((c) => c.kind === 'impact')).toBe(false);
  });
});
