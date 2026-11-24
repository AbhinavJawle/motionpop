import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildSrt,
  buildVtt,
  exportStageSteps,
  formatFileSize,
  formatSrtTimestamp,
  formatVttTimestamp,
  groupWordsForSubtitles,
  hasSubtitleWords,
} from './subtitles';

describe('subtitles & export studio helpers (spec 46)', () => {
  it('formats SRT and VTT timestamps accurately', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
    expect(formatSrtTimestamp(65_432)).toBe('00:01:05,432');
    expect(formatSrtTimestamp(3_661_005)).toBe('01:01:01,005');
    expect(formatVttTimestamp(65_432)).toBe('00:01:05.432');
  });

  it('builds valid .srt and .vtt output with sentence breaks and gap splits', () => {
    const words = [
      { text: 'Welcome', startMs: 0, endMs: 400 },
      { text: 'back.', startMs: 420, endMs: 800 },
      { text: 'Here', startMs: 1600, endMs: 1850 },
      { text: 'is', startMs: 1860, endMs: 2000 },
      { text: 'the', startMs: 2010, endMs: 2150 },
      { text: 'demo', startMs: 2160, endMs: 2550 },
    ];
    const srt = buildSrt(words);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:00,800\nWelcome back.');
    expect(srt).toContain('2\n00:00:01,600 --> 00:00:02,550\nHere is the demo');

    const vtt = buildVtt(words);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:00.000 --> 00:00:00.800\nWelcome back.');
  });

  it('formats file sizes cleanly', () => {
    expect(formatFileSize(undefined)).toBeNull();
    expect(formatFileSize(0)).toBeNull();
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(430_080)).toBe('420 KB');
    expect(formatFileSize(4_823_450)).toBe('4.6 MB');
    expect(formatFileSize(1_500_000_000)).toBe('1.40 GB');
  });

  it('advances pipeline stepper cleanly through queued -> rendering -> encoding -> done', () => {
    expect(exportStageSteps(undefined, 0).map((s) => s.state)).toEqual([
      'active',
      'pending',
      'pending',
      'pending',
    ]);
    expect(exportStageSteps('rendering', 40).map((s) => s.state)).toEqual([
      'done',
      'active',
      'pending',
      'pending',
    ]);
    expect(exportStageSteps('encoding', 85, { hasStockLayers: true }).map((s) => s.state)).toEqual([
      'done',
      'done',
      'active',
      'pending',
    ]);
    expect(exportStageSteps('encoding', 96).map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'active',
    ]);
    expect(exportStageSteps('done', 100).map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
    ]);
  });

  it('sanitizes newlines, --> tokens, non-finite timestamps, and overlapping word spans', () => {
    expect(hasSubtitleWords([{ text: '   \n\t  ', startMs: 0, endMs: 200 }])).toBe(false);
    expect(hasSubtitleWords([{ text: 'Hi', startMs: 0, endMs: 200 }])).toBe(true);

    const words = [
      { text: 'Hello\n\nworld', startMs: Number.NaN, endMs: 2400 },
      { text: 'a --> b', startMs: 200, endMs: 500 },
      { text: '   ', startMs: 600, endMs: 700 },
    ];
    const cues = groupWordsForSubtitles(words);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toEqual({
      index: 1,
      startMs: 0,
      endMs: 2400,
      text: 'Hello world a -> b',
    });
    const vtt = buildVtt(words);
    expect(vtt.split('-->')).toHaveLength(2); // only the single cue timestamp arrow
  });

  it('property: groupWordsForSubtitles always emits strictly monotonic, non-overlapping cues', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            text: fc.constantFrom('hello', 'world.', 'motion', 'pop!', 'fast', 'render'),
            startMs: fc.integer({ min: 0, max: 60_000 }),
            durMs: fc.integer({ min: 20, max: 900 }),
          }),
          { maxLength: 40 },
        ),
        (raw) => {
          const words = raw.map((w) => ({
            text: w.text,
            startMs: w.startMs,
            endMs: w.startMs + w.durMs,
          }));
          const cues = groupWordsForSubtitles(words);
          for (let i = 0; i < cues.length; i++) {
            const c = cues[i]!;
            expect(c.index).toBe(i + 1);
            expect(c.endMs).toBeGreaterThan(c.startMs);
            if (i > 0) expect(c.startMs).toBeGreaterThanOrEqual(cues[i - 1]!.endMs);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
