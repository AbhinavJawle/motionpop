import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { activeGroup, chunkCaptions, groupLimit, type CaptionSourceWord } from './chunk';

const words = (text: string, gap = 40, len = 260): CaptionSourceWord[] => {
  let t = 300;
  return text.split(' ').map((w) => {
    const filler = w.startsWith('~');
    // A filler takes no time here, like after cleanup cut it.
    const out = { text: filler ? w.slice(1) : w, startMs: t, endMs: filler ? t : t + len, filler };
    if (!filler) t += len + gap;
    return out;
  });
};

describe('chunkCaptions', () => {
  it('drops fillers, breaks at sentence ends and keeps a number span whole', () => {
    const g = chunkCaptions(words('So ~um revenue grew forty two percent. Then it fell'), {
      format: '16:9',
      presetId: 'clean',
    });
    const texts = g.map((x) => x.words.map((w) => w.text).join(' '));
    expect(texts).toEqual(['So revenue grew', 'forty two percent.', 'Then it fell']);
    expect(g[1]!.words.find((w) => w.emphasis)?.text).toBe('forty');
  });

  it('opens at least 100 ms in and never overlaps; one group or none at any time', () => {
    const arb = fc.array(
      fc.record({
        gap: fc.integer({ min: 0, max: 600 }),
        len: fc.integer({ min: 30, max: 700 }),
        text: fc.constantFrom('alpha', 'beta.', '42', 'gamma', 'delta?', 'twenty'),
        filler: fc.boolean(),
      }),
      { maxLength: 60 },
    );
    fc.assert(
      fc.property(arb, fc.constantFrom('16:9', '9:16', '1:1' as const), (spec, format) => {
        let t = 0;
        const src = spec.map((s) => {
          const w = {
            text: s.text,
            startMs: t + s.gap,
            endMs: t + s.gap + s.len,
            filler: s.filler,
          };
          t = w.endMs;
          return w;
        });
        const g = chunkCaptions(src, { format, presetId: 'pop' });
        const shown = g.flatMap((x) => x.words).length;
        expect(shown).toBe(src.filter((w) => !w.filler).length);
        for (let i = 0; i < g.length; i++) {
          expect(g[i]!.openMs).toBeGreaterThanOrEqual(100);
          expect(g[i]!.closeMs).toBeGreaterThan(g[i]!.openMs);
          expect(g[i]!.words.length).toBeLessThanOrEqual(groupLimit(format, 'pop'));
          if (i > 0) expect(g[i]!.openMs).toBeGreaterThanOrEqual(g[i - 1]!.closeMs);
        }
        for (const x of g) expect(activeGroup(g, x.openMs)).toBe(g.indexOf(x));
      }),
    );
  });
});
