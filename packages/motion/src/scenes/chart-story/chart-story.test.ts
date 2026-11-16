// @vitest-environment happy-dom
import fc from 'fast-check';
import { FORMATS, type StylePack } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import type { Format } from '../../contract';
import { formatCount } from '../../core/count';
import { contains, insetForCamera, safeArea, type Box } from '../../core/safe-area';
import { editorialExplainer, fieldNotes, paperCollage } from '../../styles';
import { assertSeekPure } from '../../testing/seek-pure';
import { arbitrary } from './samples';
import {
  barLengths,
  chartFromWords,
  chartStory,
  formatValue,
  highlightIndex,
  layoutChartStory,
  type ChartStoryContent,
} from './index';

const FORMAT_IDS: Format[] = ['16:9', '9:16', '1:1'];
const VARIANTS = chartStory.variants.map((v) => v.id);
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const SHOW: ChartStoryContent = {
  title: 'Average monthly rent',
  labels: ['2010', '2015', '2020', 'Today'],
  values: [900, 1150, 1600, 2100],
  prefix: '$',
  decimals: 0,
  takeaway: 'More than double in fifteen years',
};

function layoutOf(c: ChartStoryContent, variant: string, format: Format) {
  const { width, height } = FORMATS[format];
  const safe = insetForCamera(safeArea(format, width, height), width, height, 1.14);
  const fmt = { prefix: c.prefix, suffix: c.suffix, decimals: c.decimals };
  const values = c.values;
  const L = layoutChartStory(variant, format, height, safe, {
    values,
    title: Boolean(c.title),
    takeaway: Boolean(c.takeaway),
    valueChars: Math.max(...values.map((v) => formatCount(v, fmt).length)),
  });
  return { L, safe, values };
}

function build(
  content: ChartStoryContent,
  variant: string,
  o: { format?: Format; style?: StylePack } = {},
) {
  const format = o.format ?? '16:9';
  const root = document.createElement('div');
  document.body.append(root);
  const comp = chartStory.build(
    {
      root,
      ...FORMATS[format],
      format,
      style: o.style ?? editorialExplainer,
      durationMs: chartStory.durationMs.ideal,
      keyMomentMs: 1200,
      fps: 30,
      seed: 7,
      warn: () => {},
    },
    chartStory.params.parse({ variant, content }),
  );
  return { root, comp, done: () => (comp.dispose(), root.remove()) };
}

const scores = arbitrary.map((s) => ({ ...s, content: chartStory.content.parse(s.content) }));

describe('chart-story schema', () => {
  it('accepts the defaults and every sample, and rejects dishonest or unknown content', () => {
    expect(chartStory.params.safeParse(chartStory.defaults).success).toBe(true);
    const bad = (content: unknown, variant?: string) =>
      chartStory.params.safeParse({ ...(variant ? { variant } : {}), content }).success;
    expect(bad(SHOW, 'pie')).toBe(false);
    expect(bad({ ...SHOW, highlight: 4 })).toBe(false);
    expect(bad({ ...SHOW, values: SHOW.values.map(() => 0) })).toBe(false);
    expect(bad({ ...SHOW, labels: ['A', ...SHOW.labels], values: [-3, ...SHOW.values] })).toBe(
      false,
    );
    expect(bad({ ...SHOW, labels: SHOW.labels.slice(0, 1), values: SHOW.values.slice(0, 1) })).toBe(
      false,
    );
    // One label per value.
    expect(bad({ ...SHOW, labels: SHOW.labels.slice(0, 3) })).toBe(false);
    // "$999,999.00bn" is longer than any label fits beside five others in 9:16.
    expect(
      bad({
        ...SHOW,
        suffix: 'bn',
        decimals: 2,
        labels: [...SHOW.labels, 'X'],
        values: [...SHOW.values, 999_999],
      }),
    ).toBe(false);
    expect(
      chartStory.params.safeParse({ content: SHOW, beats: [{ cue: 'v9', word: 0 }] }).success,
    ).toBe(false);
  });

  it('highlights the score’s index, else the largest bar or the latest point', () => {
    expect(highlightIndex({ ...SHOW, highlight: 1 }, 'bars')).toBe(1);
    expect(highlightIndex({ ...SHOW, values: [...SHOW.values].reverse() }, 'bars')).toBe(0);
    expect(highlightIndex(SHOW, 'line')).toBe(3);
  });
});

describe('chart-story safe default from words', () => {
  it('reads values in one unit and labels them with years or the word before', () => {
    expect(chartFromWords('Rent was 900 in 2010 and 2,100 in 2025.'.split(' '))).toEqual({
      labels: ['2010', '2025'],
      values: [900, 2100],
      decimals: 0,
    });
    expect(chartFromWords('Europe recycles 48% of its plastic and Japan 25%.'.split(' '))).toEqual({
      labels: ['Europe', 'Japan'],
      values: [48, 25],
      suffix: '%',
      decimals: 0,
    });
    // A label after its value ("12 in March"), never the neighbour's.
    expect(
      chartFromWords('We shipped 12 in March, 19 in April and 31 in May.'.split(' ')),
    ).toMatchObject({ labels: ['March', 'April', 'May'], values: [12, 19, 31] });
    expect(chartFromWords('only 40% agree'.split(' '))).toBeNull();
    expect(chartFromWords('no digits at all'.split(' '))).toBeNull();
  });
});

describe('chart-story layout', () => {
  it('keeps every box inside the camera-safe area for every variant and format', () => {
    for (const format of FORMAT_IDS)
      for (const variant of VARIANTS) {
        const { L, safe } = layoutOf(SHOW, variant, format);
        const boxes = [
          ...(L.title ? [L.title.box] : []),
          ...(L.takeaway ? [L.takeaway.box] : []),
          ...L.items.flatMap((s) => [s.bar, s.value.box, s.label.box]),
          L.baseline,
        ];
        for (const b of boxes) expect(contains(safe, b, 1), `${variant} ${format}`).toBe(true);
      }
  });

  // Property (task 24): geometry is proportional to the data from a zero baseline.
  it('draws every bar and point proportional to its value from zero', () => {
    fc.assert(
      fc.property(scores, fc.constantFrom(...FORMAT_IDS), (score, format) => {
        const c = score.content;
        const variant = score.variant ?? 'bars';
        const { L, values } = layoutOf(c, variant, format);
        const max = Math.max(...values);
        const base = L.baseline;
        L.items.forEach((s, i) => {
          const v = values[i] as number;
          if (variant === 'rows') {
            // Bars start at the zero line and their lengths share one scale.
            expect(s.bar.x).toBe(base.x + base.width);
            const span = Math.max(...L.items.map((x) => x.bar.width));
            expect(Math.abs(s.bar.width - (v / max) * span)).toBeLessThanOrEqual(1);
          } else if (variant === 'line') {
            const p = s.point!;
            const span = Math.max(...L.items.map((x) => base.y - x.point!.y));
            expect(Math.abs(base.y - p.y - (v / max) * span)).toBeLessThanOrEqual(1);
          } else {
            expect(s.bar.y + s.bar.height).toBe(base.y);
            const span = Math.max(...L.items.map((x) => x.bar.height));
            expect(Math.abs(s.bar.height - (v / max) * span)).toBeLessThanOrEqual(1);
          }
        });
        // A zero value draws nothing above the zero line.
        expect(barLengths([0, 5], 100)).toEqual([0, 100]);
      }),
      { numRuns: 200 },
    );
  });

  // Property (task 24): value and category labels never overlap each other or the titles.
  it('never overlaps two labels, for random data in every variant and format', () => {
    fc.assert(
      fc.property(scores, fc.constantFrom(...FORMAT_IDS), (score, format) => {
        const c = score.content;
        const { L } = layoutOf(c, score.variant ?? 'bars', format);
        const boxes = [
          ...(L.title ? [L.title.box] : []),
          ...(L.takeaway ? [L.takeaway.box] : []),
          ...L.items.flatMap((s) => [s.value.box, s.label.box]),
        ];
        boxes.forEach((a, i) =>
          boxes.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
        );
        // Bars and points stay clear of every label too.
        for (const s of L.items)
          for (const b of boxes)
            if (s.bar.height > 0 && s.bar.width > 0) expect(overlaps(s.bar, b)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

describe('chart-story build', () => {
  // Property (task 24): once landed, every value label shows exactly its formatted value.
  it('shows every value label equal to its formatted value once it has landed', () => {
    fc.assert(
      fc.property(scores, fc.constantFrom(...FORMAT_IDS), (score, format) => {
        const c = score.content;
        const b = build(c, score.variant ?? 'bars', { format });
        b.comp.seek(Math.max(0, b.comp.report.plan.exitStartMs - 1));
        c.values.forEach((v, i) => {
          const el = b.root.querySelector(`[data-actor="value-${i + 1}"]`);
          expect(el?.textContent).toBe(formatValue(c, v));
        });
        b.done();
      }),
      { numRuns: 60 },
    );
  });

  it('schedules only the cues the chart uses, and lands the first value on the key moment', () => {
    const b = build(
      { ...SHOW, labels: SHOW.labels.slice(0, 3), values: SHOW.values.slice(0, 3) },
      'bars',
    );
    const ids = b.comp.report.plan.cues.map((q) => q.id);
    expect(ids).toEqual(['title', 'v1', 'v2', 'v3', 'highlight', 'takeaway']);
    expect(b.comp.report.plan.cues.find((q) => q.id === 'v1')?.landMs).toBe(1200);
    expect(b.root.querySelector('[data-focal]')?.getAttribute('data-actor')).toBe('value-1');
    b.done();
  });

  it('lands each value on the word that says it', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const words = Array.from({ length: 12 }, (_, i) => ({
      startMs: 200 + i * 350,
      endMs: 450 + i * 350,
    }));
    const comp = chartStory.build(
      {
        root,
        ...FORMATS['16:9'],
        format: '16:9',
        style: fieldNotes,
        look: fieldNotes,
        durationMs: 7200,
        keyMomentMs: 1200,
        fps: 30,
        seed: 3,
        warn: () => {},
        words,
      },
      chartStory.params.parse({
        variant: 'line',
        content: SHOW,
        beats: [
          { cue: 'v1', word: 2 },
          { cue: 'v2', word: 5 },
          { cue: 'v3', word: 8 },
          { cue: 'v4', word: 11 },
        ],
      }),
    );
    for (const [cue, word] of [
      ['v1', 2],
      ['v2', 5],
      ['v3', 8],
      ['v4', 11],
    ] as const)
      expect(comp.report.plan.cues.find((q) => q.id === cue)?.landMs).toBe(words[word]!.startMs);
    comp.dispose();
    root.remove();
  });

  it('seeks purely for random charts in every format and look', () => {
    fc.assert(
      fc.property(
        scores,
        fc.constantFrom(...FORMAT_IDS),
        fc.constantFrom<StylePack>(editorialExplainer, fieldNotes, paperCollage),
        (score, format, style) => {
          assertSeekPure(chartStory, chartStory.params.parse(score), { format, numRuns: 5, style });
        },
      ),
      { numRuns: 20 },
    );
  });
});
