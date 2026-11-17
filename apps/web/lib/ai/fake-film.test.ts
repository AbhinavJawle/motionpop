import type { FilmBuildInput, FilmDirectInput } from '@motionpop/ai';
import { customParams, lintCustom } from '@motionpop/motion';
import { storyboardIssues, type FilmWord } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { demoProject } from '@/lib/projects/fixture';
import { filmBuildAnswer, filmDirectAnswer } from './fake-film';

const directInput = (words: FilmWord[], durationMs: number): FilmDirectInput =>
  ({
    words,
    durationMs,
    format: '16:9',
    look: { name: 'Editorial', description: 'plain' },
  }) as FilmDirectInput;

const demoWords = (): FilmWord[] =>
  demoProject(0).transcript.words.map((w) => ({
    text: w.text,
    startMs: w.startMs,
    endMs: w.endMs,
  }));

describe('filmDirectAnswer', () => {
  it('writes a storyboard with no issues for the demo transcript', () => {
    const words = demoWords();
    const durationMs = demoProject(0).durationMs;
    const board = filmDirectAnswer(directInput(words, durationMs));
    expect(storyboardIssues(board, words, durationMs)).toEqual([]);
    expect(board.beats.length).toBeGreaterThan(0);
  });

  it('writes a storyboard with no issues for random word lists', () => {
    const wordArb = fc.record({
      text: fc.stringMatching(/^[a-z]{2,8}$/),
      sentenceEnd: fc.boolean(),
      gapMs: fc.integer({ min: 0, max: 900 }),
    });
    fc.assert(
      fc.property(fc.array(wordArb, { minLength: 12, maxLength: 40 }), (raw) => {
        let t = 0;
        const words: FilmWord[] = raw.map((w) => {
          const startMs = t + w.gapMs;
          const endMs = startMs + 350;
          t = endMs;
          return { text: w.sentenceEnd ? `${w.text}.` : w.text, startMs, endMs };
        });
        const durationMs = Math.max(8000, t + 400);
        const board = filmDirectAnswer(directInput(words, durationMs));
        expect(storyboardIssues(board, words, durationMs)).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});

describe('filmBuildAnswer', () => {
  it('writes a beat that passes the custom lint and parses as a custom graphic', () => {
    const input = {
      beat: { text: ['72%', 'of the market'], keyMomentMs: 900 },
      durationMs: 4000,
    } as unknown as FilmBuildInput;
    const out = filmBuildAnswer(input);
    expect(lintCustom(out)).toEqual([]);
    const parsed = customParams.safeParse({
      title: out.title,
      html: out.html,
      css: out.css,
      script: out.script,
      keyMomentMs: out.keyMomentMs,
    });
    expect(parsed.success).toBe(true);
  });

  it('escapes the beat text it puts in the markup', () => {
    const input = {
      beat: { text: ['<b>x</b>', '"q"'], keyMomentMs: 0 },
      durationMs: 3000,
    } as unknown as FilmBuildInput;
    const out = filmBuildAnswer(input);
    expect(out.html).not.toContain('<b>x</b>');
    expect(out.html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(lintCustom(out)).toEqual([]);
  });
});
