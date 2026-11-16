// @vitest-environment happy-dom
import fc from 'fast-check';
import { FORMATS, type StylePack } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import type { Format } from '../../contract';
import { contains, insetForCamera, safeArea, type Box } from '../../core/safe-area';
import { editorialExplainer, fieldNotes, paperCollage } from '../../styles';
import { assertSeekPure } from '../../testing/seek-pure';
import { arbitrary, edgeCases } from './samples';
import { layoutQuote, quote, quoteFromWords } from './index';

const FORMAT_IDS: Format[] = ['16:9', '9:16', '1:1'];
const VARIANTS = quote.variants.map((v) => v.id);
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('quote schema and words', () => {
  it('accepts every sample and rejects quotes over 24 words', () => {
    for (const s of Object.values(edgeCases)) expect(quote.params.safeParse(s).success).toBe(true);
    const long = Array.from({ length: 25 }, () => 'word').join(' ');
    expect(quote.params.safeParse({ content: { quote: long } }).success).toBe(false);
    expect(quote.params.safeParse({ variant: 'banner', content: { quote: 'Hi' } }).success).toBe(
      false,
    );
  });

  it('reads the quoted words, else the first sentence', () => {
    expect(
      quoteFromWords(
        'Our first customer told us, "I would pay double for this," and left.'.split(' '),
      ),
    ).toEqual({ quote: 'I would pay double for this' });
    expect(quoteFromWords('Ship small, ship often. Then rest.'.split(' '))).toEqual({
      quote: 'Ship small, ship often.',
    });
  });
});

describe('quote layout', () => {
  it('keeps every box inside the camera-safe area and apart, for every variant and format', () => {
    for (const format of FORMAT_IDS) {
      const { width, height } = FORMATS[format];
      const safe = insetForCamera(safeArea(format, width, height), width, height, 1.14);
      for (const variant of VARIANTS)
        for (const [attribution, words] of [
          [true, 24],
          [false, 4],
          [true, 9],
        ] as const) {
          const tag = `${variant} ${format} attribution=${attribution} words=${words}`;
          const L = layoutQuote(variant, format, height, safe, { attribution, words });
          const boxes = [L.quote.box, ...(L.attribution ? [L.attribution.box] : [])];
          for (const b of [...boxes, ...(L.bar ? [L.bar] : [])])
            expect(contains(safe, b, 1), `${tag} ${JSON.stringify(b)}`).toBe(true);
          boxes.forEach((a, i) =>
            boxes.slice(i + 1).forEach((b) => expect(overlaps(a, b), tag).toBe(false)),
          );
        }
    }
  });
});

describe('quote build', () => {
  it('starts on the first quoted word and hits the emphasis on its spoken word', () => {
    const words = Array.from({ length: 12 }, (_, i) => ({
      startMs: 200 + i * 320,
      endMs: 450 + i * 320,
    }));
    const root = document.createElement('div');
    document.body.append(root);
    const comp = quote.build(
      {
        root,
        ...FORMATS['9:16'],
        format: '9:16',
        style: fieldNotes,
        look: fieldNotes,
        durationMs: 7000,
        keyMomentMs: 600,
        fps: 30,
        seed: 3,
        warn: () => {},
        words,
      },
      quote.params.parse({
        variant: 'card',
        content: { quote: 'The quiet hours are the hardest ones', emphasis: 'hardest' },
        beats: [{ cue: 'quote', word: 5 }],
      }),
    );
    expect(comp.report.plan.cues.find((q) => q.id === 'quote')?.landMs).toBe(words[5]!.startMs);
    expect(comp.report.plan.cues.find((q) => q.id === 'emphasis')?.landMs).toBe(words[10]!.startMs);
    expect(root.querySelector('[data-focal]')?.getAttribute('data-actor')).toBe('quote');
    comp.dispose();
    root.remove();
  });

  it('seeks purely for random quotes in every format and look', () => {
    fc.assert(
      fc.property(
        arbitrary,
        fc.constantFrom(...FORMAT_IDS),
        fc.constantFrom<StylePack>(editorialExplainer, fieldNotes, paperCollage),
        (score, format, style) => {
          assertSeekPure(quote, quote.params.parse(score), { format, numRuns: 5, style });
        },
      ),
      { numRuns: 20 },
    );
  });
});
