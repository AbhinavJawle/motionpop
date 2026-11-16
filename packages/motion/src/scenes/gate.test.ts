// @vitest-environment happy-dom
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Format } from '../contract';
import { editorialExplainer, fieldNotes } from '../styles';
import { gateRepairText, gateSlot, repairable, safeScore, safeScoreFromWords } from './gate';
import { hookFromWords, hookStatement } from './hook-statement';
import { statPunch, statPunchFromWords } from './stat-punch';

const FORMATS_: Format[] = ['16:9', '9:16', '1:1'];
const words = (n: number, stepMs = 300) =>
  Array.from({ length: n }, (_, i) => ({ startMs: 100 + i * stepMs, endMs: 340 + i * stepMs }));
const base = { format: '16:9' as Format, style: fieldNotes, look: fieldNotes, durationMs: 4600 };

describe('gateSlot', () => {
  it('passes a good score', () => {
    expect(gateSlot(statPunch, statPunch.defaults, base)).toEqual([]);
  });

  it('names the actor and rule for schema problems and unknown ids', () => {
    const r = gateSlot(statPunch, { content: { value: 4, label: '' } }, base);
    expect(r[0]).toMatchObject({ actor: 'label', rule: 'content-invalid' });
    const v = gateSlot(statPunch, { ...statPunch.defaults, variant: 'sideways' }, base);
    expect(v[0]).toMatchObject({ actor: 'variant', rule: 'unknown-id' });
    expect(gateRepairText(v)).toContain('variant (unknown-id)');
  });

  it('reports a beat outside the slot', () => {
    const r = gateSlot(
      statPunch,
      { ...statPunch.defaults, beats: [{ cue: 'number', word: 12 }] },
      { ...base, words: words(5) },
    );
    expect(r).toEqual([
      expect.objectContaining({
        actor: 'number',
        rule: 'anchor-out-of-range',
        measured: 12,
        limit: 4,
      }),
    ]);
  });

  it('reports a cue the slot has no room for, with a hint that says what to do', () => {
    // The number is spoken late in an ideal-length slot: the label can't be read before the exit.
    const r = gateSlot(
      statPunch,
      { ...statPunch.defaults, beats: [{ cue: 'number', word: 7 }] },
      { ...base, durationMs: 4600, words: words(8, 560) },
    );
    const dropped = r.find((x) => x.rule === 'cue-dropped');
    expect(dropped).toMatchObject({ actor: 'label' });
    expect(dropped!.hint).toMatch(/shorten|leave label out/);
    expect(r.every((x) => x.hint.length <= 200 && x.slot === 'slot')).toBe(true);
    // Shorter than ideal, a dropped optional cue is the designed fallback, not a failure.
    const short = gateSlot(
      statPunch,
      { ...statPunch.defaults, beats: [{ cue: 'number', word: 7 }] },
      { ...base, durationMs: 2600, words: words(8) },
    );
    expect(short.filter((x) => x.rule === 'cue-dropped')).toEqual([]);
  });

  it('does not report unused optional cues', () => {
    // No context line in the content: its cue has no actor, so nothing to report.
    const r = gateSlot(statPunch, statPunch.defaults, { ...base, durationMs: 2600 });
    expect(r.filter((x) => x.actor === 'context')).toEqual([]);
  });
});

describe('safe defaults', () => {
  it('reads a number and its label from the words', () => {
    expect(statPunchFromWords('Our revenue grew 40% since 2020.'.split(' '))).toMatchObject({
      value: 40,
      suffix: '%',
      label: 'Our revenue grew',
    });
    expect(statPunchFromWords('about $2.5M in new revenue'.split(' '))).toMatchObject({
      value: 2.5,
      prefix: '$',
      suffix: 'M',
      decimals: 1,
      label: 'about',
    });
    expect(statPunchFromWords('40 percent of people agree'.split(' '))).toMatchObject({
      value: 40,
      suffix: '%',
      label: 'of people agree',
    });
    expect(statPunchFromWords('no digits here'.split(' '))).toBeNull();
    expect(
      hookFromWords('So, why does this keep happening to us every single year?'.split(' ')),
      // Changed 2026-11-16: the whole question fits the line's 14 words, so it is no longer cut at 8.
    ).toEqual({ line: 'So, why does this keep happening to us every single year?' });
  });

  it('always passes the repairable gates, for random words, scenes, formats and durations', () => {
    const word = fc.constantFrom(
      'the',
      'revenue',
      '40%',
      '$12bn',
      'internationalisation',
      'why',
      'um',
    );
    fc.assert(
      fc.property(
        fc.array(word, { maxLength: 20 }),
        fc.constantFrom(statPunch, hookStatement),
        fc.constantFrom(...FORMATS_),
        fc.constantFrom('min', 'ideal', 'max'),
        fc.boolean(),
        (ws, scene, format, len, plain) => {
          const o = {
            format,
            style: plain ? editorialExplainer : fieldNotes,
            ...(plain ? {} : { look: fieldNotes }),
            durationMs: scene.durationMs[len as 'min' | 'ideal' | 'max'],
          };
          const score = safeScore(scene as never, ws, o);
          expect(gateSlot(scene as never, score, o).filter(repairable)).toEqual([]);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('safeScoreFromWords (spec 07 task 27)', () => {
  const o = { ...base, words: words(8) };

  it('builds the safe default from the spoken words and keeps given beats', () => {
    const text = 'Profit rose 12% this year after cuts'.split(' ');
    const beats = [{ cue: 'number', word: 2 }];
    const s = safeScoreFromWords(statPunch, text, o, beats);
    expect(s).toMatchObject({ variant: 'stack', content: { value: 12, suffix: '%' }, beats });
    expect(gateSlot(statPunch, s, o).some(repairable)).toBe(false);
    expect(safeScoreFromWords(hookStatement, text, o)?.content).toEqual(hookFromWords(text));
  });

  it("returns null instead of the scene's example content when the words give none", () => {
    // Spelled-out numbers are not parsed here: never fall back to the default "40 %".
    expect(safeScoreFromWords(statPunch, 'it grew forty percent'.split(' '), o)).toBeNull();
    expect(safeScoreFromWords(hookStatement, [], o)).toBeNull();
    // safeScore itself still always answers (property-tested in gate.property.test.ts).
    expect(safeScore(statPunch, 'it grew forty percent'.split(' '), o).content).toEqual(
      statPunch.defaultContent,
    );
  });
});
