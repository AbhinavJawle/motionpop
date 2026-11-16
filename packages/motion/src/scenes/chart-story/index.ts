import { z } from 'zod';
import type { Format } from '../../contract';
import { formatCount, type CountFormat } from '../../core/count';
import type { Box } from '../../core/safe-area';
import { enter, mark, stage, type Action, type Actor, type TextSlot } from '../../engine/stage';
import { defineScene, type SceneCue } from '../define';
import { isContentWord } from '../hook-statement';
import { column } from '../layout';

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Most values one chart shows: six columns still read in 9:16. */
export const CHART_MAX_ITEMS = 6;
/** Largest value: bigger amounts use the suffix ("4.2" + "bn"), so labels fit every format. */
export const CHART_MAX_VALUE = 999_999;
/**
 * Longest value label ("$99,999k", "$4.25bn"): six of them still fit side by side in 9:16 at a
 * readable size. motion:check found ten characters overflowing there at the minimum size.
 */
export const CHART_MAX_VALUE_CHARS = 8;

const chartLabel = z
  .string()
  .min(1)
  .max(16)
  .refine((s) => s.trim().length > 0 && wordCount(s) <= 3, 'one to three words');
const chartValue = z.number().min(0).max(CHART_MAX_VALUE);

/**
 * Labels and values are two flat lists of the same length (not a list of objects): the fill's
 * structured output stays within three object levels (ai-tasks.md schema rules).
 */
export const chartStoryContent = z
  .object({
    title: z
      .string()
      .max(48)
      .refine((s) => wordCount(s) <= 7, 'at most 7 words')
      .optional()
      .describe('What the chart shows, at most 7 words, e.g. "Average rent in the city"'),
    labels: z
      .array(chartLabel)
      .min(2)
      .max(CHART_MAX_ITEMS)
      .describe(
        'What each value is for, as spoken, in the order said: years, places or groups, 1 to 3 words each',
      ),
    values: z
      .array(chartValue)
      .min(2)
      .max(CHART_MAX_ITEMS)
      .describe(
        'The values exactly as spoken, one per label, 0 or more (40 for "forty percent"); millions go in the suffix',
      ),
    prefix: z.string().max(4).optional().describe('Text before every value, e.g. "$"'),
    suffix: z.string().max(4).optional().describe('Text after every value, e.g. "%", "M", "k"'),
    decimals: z.number().int().min(0).max(2).default(0).describe('Decimal places shown'),
    highlight: z
      .number()
      .int()
      .min(0)
      .max(CHART_MAX_ITEMS - 1)
      .optional()
      .describe('Index of the value to emphasise (0 = first); leave out for the largest or latest'),
    takeaway: z
      .string()
      .max(60)
      .refine((s) => wordCount(s) <= 8, 'at most 8 words')
      .optional()
      .describe('What the numbers mean, from the narration, at most 8 words'),
  })
  .refine((c) => c.labels.length === c.values.length, {
    message: 'one label per value',
    path: ['labels'],
  })
  .refine((c) => c.values.some((v) => v > 0), {
    message: 'at least one value above 0',
    path: ['values'],
  })
  .refine(
    (c) =>
      c.values.every(
        (v) =>
          formatCount(v, { prefix: c.prefix, suffix: c.suffix, decimals: c.decimals }).length <=
          CHART_MAX_VALUE_CHARS,
      ),
    {
      message: `every value label at most ${CHART_MAX_VALUE_CHARS} characters: use a suffix (k, M, bn) or fewer decimals`,
      path: ['values'],
    },
  )
  .refine((c) => c.highlight === undefined || c.highlight < c.values.length, {
    message: 'highlight must be the index of one of the values',
    path: ['highlight'],
  });
export type ChartStoryContent = z.infer<typeof chartStoryContent>;

/** The chart's values with their labels, in order. */
export const chartItems = (c: ChartStoryContent): { label: string; value: number }[] =>
  c.values.map((value, i) => ({ label: c.labels[i] ?? '', value }));

export const chartFormat = (c: ChartStoryContent): CountFormat => ({
  prefix: c.prefix,
  suffix: c.suffix,
  decimals: c.decimals,
});

/** The value label exactly as the chart shows it once it has landed. */
export const formatValue = (c: ChartStoryContent, value: number): string =>
  formatCount(value, chartFormat(c));

/** The emphasised item: the score's, else the largest (bars, rows) or the latest (line). */
export function highlightIndex(c: ChartStoryContent, variant: string): number {
  if (c.highlight !== undefined && c.highlight < c.values.length) return c.highlight;
  if (variant === 'line') return c.values.length - 1;
  let best = 0;
  c.values.forEach((v, i) => {
    if (v > (c.values[best] as number)) best = i;
  });
  return best;
}

/**
 * Data honesty (motion principle 9): each length is proportional to its value from a zero
 * baseline, the largest value takes the full `span`. Whole pixels.
 */
export function barLengths(values: readonly number[], span: number): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? Math.round((Math.max(0, v) / max) * span) : 0));
}

export interface ChartItemSlots {
  /** The bar (bars, rows), or the dot around the point (line). */
  bar: Box;
  value: TextSlot;
  label: TextSlot;
  /** Line: the data point, the centre of its dot. */
  point?: { x: number; y: number };
}

export interface ChartSlots {
  title?: TextSlot;
  takeaway?: TextSlot;
  items: ChartItemSlots[];
  /** The zero line: under the columns, or left of the rows. */
  baseline: Box;
  /** Bars grow up ('v') or right ('h'). */
  orient: 'v' | 'h';
  /** Line thickness and dot diameter (line variant). */
  stroke: number;
  dot: number;
  /** Line: a thin rule from each point down to the zero line, so each value reads from zero. */
  drops: Box[];
}

const slot = (
  box: Box,
  max: number,
  lines: number,
  min: number,
  align: 'left' | 'center',
): TextSlot => ({
  box,
  max: Math.max(1, max),
  min: Math.max(1, Math.round(max * min)),
  lineHeight: 1.2,
  maxLines: lines,
  align,
});

/** The chart line's y at `x` (piecewise linear through the points, flat past the ends). */
function lineAt(points: readonly { x: number; y: number }[], x: number): number {
  const first = points[0] as { x: number; y: number };
  const last = points[points.length - 1] as { x: number; y: number };
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as { x: number; y: number };
    const b = points[i] as { x: number; y: number };
    if (x <= b.x) return a.y + ((b.y - a.y) * (x - a.x)) / Math.max(1, b.x - a.x);
  }
  return last.y;
}

/**
 * Per-format layout of each variant, in frame pixels inside the camera-safe area. Pure: every
 * value and category label gets its own box, and boxes never overlap (tested for random data).
 * `valueChars` is the longest formatted value, so rows reserve room for it after the bar.
 */
export function layoutChartStory(
  variant: string,
  format: Format,
  frameH: number,
  safe: Box,
  has: { values: readonly number[]; title: boolean; takeaway: boolean; valueChars: number },
): ChartSlots {
  const wide = format === '16:9';
  const tall = format === '9:16';
  const by = <T>(w: T, t: T, s: T) => (wide ? w : tall ? t : s);
  const H = frameH;
  const n = has.values.length;
  const rule = Math.max(3, Math.round(H * 0.003));
  const textArea = column(safe, by(0.8, 1, 0.94));
  const titleLines = wide ? 1 : 2;
  const head = (k: number) => {
    const titleMax = Math.round(H * by(0.058, 0.034, 0.052) * k);
    const takeMax = Math.round(H * by(0.042, 0.026, 0.04) * k);
    return {
      titleMax,
      titleH: has.title ? Math.ceil(titleMax * 1.2 * titleLines) : 0,
      titleGap: has.title ? Math.round(titleMax * 0.75) : 0,
      takeMax,
      takeH: has.takeaway ? Math.ceil(takeMax * 1.2 * 2) : 0,
      takeGap: has.takeaway ? Math.round(takeMax * 0.9) : 0,
    };
  };
  /** Fit `total(k)` into the safe height: shrink everything together when it is too tall. */
  const fit = (total: (k: number) => number) => {
    const t = total(1);
    return t > safe.height ? (safe.height / t) * 0.98 : 1;
  };
  const titleSlot = (y: number, hd: ReturnType<typeof head>) =>
    has.title
      ? {
          title: slot(
            { x: textArea.x, y, width: textArea.width, height: hd.titleH },
            hd.titleMax,
            titleLines,
            0.6,
            'center',
          ),
        }
      : {};
  const takeSlot = (y: number, hd: ReturnType<typeof head>) =>
    has.takeaway
      ? {
          takeaway: slot(
            { x: textArea.x, y, width: textArea.width, height: hd.takeH },
            hd.takeMax,
            2,
            0.7,
            'center',
          ),
        }
      : {};

  if (variant === 'rows') return rows();

  // Columns (bars) or points (line) side by side over a zero baseline.
  const line = variant === 'line';
  const share =
    n <= 2
      ? by(0.5, 0.84, 0.7)
      : n === 3
        ? by(0.66, 1, 0.84)
        : n === 4
          ? by(0.8, 1, 1)
          : by(0.9, 1, 1);
  const area = column(safe, share);
  const dims = (k: number) => {
    const valueMax = Math.round(H * by(0.05, 0.032, 0.046) * k);
    const labelMax = Math.round(H * by(0.036, 0.023, 0.034) * k);
    const d = {
      ...head(k),
      valueMax,
      valueH: Math.ceil(valueMax * 1.2),
      valueGap: Math.round(valueMax * 0.3),
      dot: line ? Math.max(10, Math.round(H * by(0.022, 0.013, 0.02) * k)) : 0,
      plotH: Math.round(H * by(0.34, 0.31, 0.32) * k),
      labelMax,
      labelH: Math.ceil(labelMax * 1.2 * 2),
      labelGap: Math.round(labelMax * 0.6),
    };
    const total =
      d.titleH +
      d.titleGap +
      d.valueH +
      d.valueGap +
      Math.ceil(d.dot / 2) +
      d.plotH +
      rule +
      d.labelGap +
      d.labelH +
      d.takeGap +
      d.takeH;
    return { ...d, total };
  };
  const z = dims(fit((k) => dims(k).total));
  const y0 = safe.y + Math.floor(Math.max(0, safe.height - z.total) * 0.45);
  const plotTop = y0 + z.titleH + z.titleGap + z.valueH + z.valueGap + Math.ceil(z.dot / 2);
  const plotBottom = plotTop + z.plotH;
  const colW = area.width / n;
  const heights = barLengths(has.values, z.plotH);
  const cols = has.values.map((_, i) => {
    const x = Math.ceil(area.x + colW * i + colW * 0.04);
    return {
      x,
      width: Math.floor(area.x + colW * i + colW * 0.96) - x,
      cx: area.x + colW * (i + 0.5),
    };
  });
  const points = cols.map((c, i) => ({
    x: Math.round(c.cx),
    y: plotBottom - (heights[i] as number),
  }));
  const barW = Math.round(Math.min(colW * 0.58, H * by(0.14, 0.1, 0.13)));
  const labelY = plotBottom + rule + z.labelGap;
  const items: ChartItemSlots[] = cols.map((c, i) => {
    const h = heights[i] as number;
    const p = points[i] as { x: number; y: number };
    // Line: the label clears the line across its whole width, and the dot.
    const top = line
      ? Math.min(p.y, lineAt(points, c.x), lineAt(points, c.x + c.width)) - Math.ceil(z.dot / 2)
      : plotBottom - h;
    const vy = Math.floor(top - z.valueGap - z.valueH);
    return {
      bar: line
        ? { x: p.x - z.dot / 2, y: p.y - z.dot / 2, width: z.dot, height: z.dot }
        : { x: Math.round(c.cx - barW / 2), y: plotBottom - h, width: barW, height: h },
      value: slot(
        { x: c.x, y: vy, width: c.width, height: z.valueH },
        z.valueMax,
        1,
        0.4,
        'center',
      ),
      label: slot(
        { x: c.x, y: labelY, width: c.width, height: z.labelH },
        z.labelMax,
        2,
        0.6,
        'center',
      ),
      ...(line ? { point: p } : {}),
    };
  });
  return {
    ...titleSlot(y0, z),
    ...takeSlot(labelY + z.labelH + z.takeGap, z),
    items,
    baseline: { x: area.x, y: plotBottom, width: area.width, height: rule },
    orient: 'v',
    stroke: line ? Math.max(4, Math.round(H * by(0.006, 0.0035, 0.0055))) : 0,
    dot: z.dot,
    drops: line
      ? points.map((p) => {
          const w = Math.max(2, Math.round(H * 0.002));
          return { x: p.x - w / 2, y: p.y, width: w, height: plotBottom - p.y };
        })
      : [],
  };

  /** Horizontal bars, one row per value: the label beside (or, in 9:16, above) its bar. */
  function rows(): ChartSlots {
    const area = tall ? safe : column(safe, by(0.86, 1, 0.94));
    const dims = (k: number) => {
      const barT = Math.round(H * by(0.062, 0.034, 0.058) * k);
      const labelMax = Math.round(H * by(0.04, 0.026, 0.038) * k);
      const labelH = Math.ceil(labelMax * 1.2);
      const labelGap = tall ? Math.round(labelMax * 0.35) : 0;
      const rowH = tall ? labelH + labelGap + barT : Math.max(barT, labelH);
      const rowGap = Math.round(H * by(0.03, 0.022, 0.03) * k);
      const d = { ...head(k), barT, labelMax, labelH, labelGap, rowH, rowGap };
      return {
        ...d,
        total: d.titleH + d.titleGap + n * rowH + (n - 1) * rowGap + d.takeGap + d.takeH,
      };
    };
    const z = dims(fit((k) => dims(k).total));
    const y0 = safe.y + Math.floor(Math.max(0, safe.height - z.total) * 0.45);
    const rowsTop = y0 + z.titleH + z.titleGap;
    const valueMax = Math.round(z.barT * 0.78);
    const valueH = Math.ceil(valueMax * 1.2);
    const labelW = tall ? area.width - rule : Math.floor(area.width * 0.27);
    // The zero line sits just left of the track, inside the area.
    const trackX = tall ? area.x + rule : area.x + labelW + Math.round(area.width * 0.03);
    const trackW = area.x + area.width - trackX;
    const vgap = Math.round(valueMax * 0.4);
    const labelPad = Math.round(z.labelMax * 0.35);
    const valueW = Math.min(
      Math.floor(trackW * 0.42),
      Math.ceil(has.valueChars * 0.62 * valueMax + valueMax * 0.5),
    );
    const lengths = barLengths(has.values, trackW - valueW - vgap);
    const items: ChartItemSlots[] = has.values.map((_, i) => {
      const top = rowsTop + i * (z.rowH + z.rowGap);
      const barY = tall ? top + z.labelH + z.labelGap : top + Math.round((z.rowH - z.barT) / 2);
      const len = lengths[i] as number;
      return {
        bar: { x: trackX, y: barY, width: len, height: z.barT },
        value: slot(
          {
            x: trackX + len + vgap,
            y: barY + Math.round((z.barT - valueH) / 2),
            width: valueW,
            height: valueH,
          },
          valueMax,
          1,
          0.4,
          'left',
        ),
        label: slot(
          {
            // In 9:16 the label sits over its bar, clear of the zero line.
            x: tall ? trackX + labelPad : area.x,
            y: tall ? top : top + Math.round((z.rowH - z.labelH) / 2),
            width: labelW - (tall ? labelPad : 0),
            height: z.labelH,
          },
          z.labelMax,
          1,
          0.6,
          'left',
        ),
      };
    });
    const rowsBottom = rowsTop + n * z.rowH + (n - 1) * z.rowGap;
    return {
      ...titleSlot(y0, z),
      ...takeSlot(rowsBottom + z.takeGap, z),
      items,
      baseline: {
        x: trackX - rule,
        y: rowsTop - Math.round(z.rowGap / 3),
        width: rule,
        height: rowsBottom - rowsTop + Math.round((z.rowGap / 3) * 2),
      },
      orient: 'h',
      stroke: 0,
      dot: 0,
      drops: [],
    };
  }
}

const NUM = /^([$€£]?)(\d[\d,]*(?:\.\d+)?)(%|k|m|bn|b)?$/i;
const FILLERS = new Set(['um', 'uh', 'erm', 'like']);
const bare = (w: string) => w.replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu, '');

/**
 * Safe default from the slot's words (spec 07 R1.4): the values written in digits, in the
 * order spoken, in the unit of the first one. Years ("2020") become the labels when there is
 * one per value; otherwise each value takes the content word nearest before it. Null when the
 * words give fewer than two values with labels, so no number or label is ever invented.
 */
export function chartFromWords(words: readonly string[]): ChartStoryContent | null {
  const clean = words.map(bare);
  const nums: { i: number; value: number; prefix: string; suffix: string; decimals: number }[] = [];
  const years: string[] = [];
  clean.forEach((w, i) => {
    const m = NUM.exec(w);
    if (!m) return;
    const digits = (m[2] as string).replace(/,/g, '');
    const value = Number(digits);
    if (!Number.isFinite(value)) return;
    const pct = !m[3] && /^percent$/i.test(clean[i + 1] ?? '');
    if (!m[1] && !m[3] && !pct && /^(19|20)\d\d$/.test(digits)) {
      years.push(digits);
      return;
    }
    const unit = m[3] ? (m[3].toLowerCase() === 'm' ? 'M' : m[3].toLowerCase()) : pct ? '%' : '';
    nums.push({
      i,
      value,
      prefix: m[1] ?? '',
      suffix: unit,
      decimals: Math.min(2, digits.split('.')[1]?.length ?? 0),
    });
  });
  const first = nums[0];
  if (!first) return null;
  const same = nums
    .filter((x) => x.prefix === first.prefix && x.suffix === first.suffix)
    .slice(0, CHART_MAX_ITEMS);
  if (same.length < 2 || same.some((x) => x.value > CHART_MAX_VALUE)) return null;
  if (!same.some((x) => x.value > 0)) return null;
  const isValue = (k: number) => same.some((x) => x.i === k) || NUM.test(clean[k] ?? '');
  const usable = (k: number) => {
    const w = clean[k] ?? '';
    return w && !FILLERS.has(w.toLowerCase()) && !/\d/.test(w) && isContentWord(w) ? w : null;
  };
  const ends = (k: number) => /[.,;:!?]$/.test(words[k]?.trim() ?? '');
  /**
   * A value's label: a name right after it ("12 in March"), else the nearest name before it
   * ("Europe recycles 48%"), else the nearest content word before it; never across another
   * value or punctuation, so a value never takes its neighbour's label.
   */
  const nearLabel = (i: number): string | null => {
    for (let k = i + 1; k <= Math.min(clean.length - 1, i + 3) && !isValue(k); k++) {
      // A capitalised name after "in", "for"…: grammar lists don't apply ("in May").
      const t = clean[k] ?? '';
      if (/^(in|for|at|by|during|on)$/i.test(clean[k - 1] ?? '') && /^\p{Lu}\p{L}*$/u.test(t))
        return t.length <= 16 ? t : null;
      if (ends(k)) break;
    }
    const near: string[] = [];
    for (let k = i - 1; k >= Math.max(0, i - 3) && !isValue(k) && !ends(k); k--) {
      const t = usable(k);
      if (t && !/^percent$/i.test(t)) near.push(t);
    }
    const w = near.find((x) => /^\p{Lu}/u.test(x)) ?? near[0];
    return w && w.length <= 16 ? w[0]!.toUpperCase() + w.slice(1) : null;
  };
  const labels =
    years.length >= same.length ? years.slice(0, same.length) : same.map((x) => nearLabel(x.i));
  if (labels.some((l) => !l)) return null;
  // Two values under one label would be a guess: no chart.
  if (new Set(labels).size !== labels.length) return null;
  return {
    labels: labels as string[],
    values: same.map((x) => x.value),
    ...(first.prefix ? { prefix: first.prefix } : {}),
    ...(first.suffix ? { suffix: first.suffix } : {}),
    decimals: Math.max(...same.map((x) => x.decimals)),
  };
}

const valueCue = (k: number): SceneCue => ({
  id: `v${k}`,
  about:
    k === 1
      ? 'the first bar or point lands with its value, on the word that says the value'
      : `value ${k} lands, on the word that says it`,
  // A bar grows quickly; the values arrive one per spoken value (or as a fast cascade).
  leadMs: 300,
});

/**
 * chart-story: 2 to 6 values that tell one story. Each bar or point lands with its value on the
 * word that says it, the highlight fills the one that matters in the accent with the look's
 * emphasis mark, and the takeaway says what it means. Geometry is proportional from zero.
 */
export const chartStory = defineScene<ChartStoryContent>({
  id: 'chart-story',
  name: 'Chart story',
  category: 'data',
  useWhen:
    'the narration gives 2 to 6 values to compare or a trend over time (years, places, groups)',
  content: chartStoryContent,
  defaultContent: {
    title: 'Average monthly rent',
    labels: ['2010', '2015', '2020', 'Today'],
    values: [900, 1150, 1600, 2100],
    prefix: '$',
    decimals: 0,
    takeaway: 'More than double in fifteen years',
  },
  variants: [
    { id: 'bars', about: 'columns over a zero line; the safe default' },
    { id: 'rows', about: 'horizontal bars with the labels beside them; best for longer labels' },
    { id: 'line', about: 'a line through the points from zero; best for a trend over time' },
  ],
  peakVariant: 'bars',
  cues: [
    { id: 'title', about: 'the title of the chart appears', optional: true, snap: true },
    ...Array.from({ length: CHART_MAX_ITEMS }, (_, i) => valueCue(i + 1)),
    {
      id: 'highlight',
      about: 'the highlighted value fills with the accent and gets the emphasis mark',
      optional: true,
      leadMs: 300,
      words: 0,
    },
    {
      id: 'takeaway',
      about: 'the takeaway line appears under the chart',
      optional: true,
      snap: true,
    },
  ],
  focalCue: 'v1',
  imageRoles: [],
  safe: chartFromWords,
  // min: six bars with three-word labels each read in full before the exit. ideal: also a
  // 7-word title and an 8-word takeaway, after a default key moment.
  durationMs: { min: 5000, ideal: 7200, max: 12000 },
  formats: ['16:9', '9:16', '1:1'],
  build(ctx, score, variant) {
    const c = score.content;
    // Only the cues this chart uses are scheduled: a 3-value chart has no v4 to wait for.
    const used = new Set([
      ...(c.title ? ['title'] : []),
      ...c.values.map((_, i) => `v${i + 1}`),
      'highlight',
      ...(c.takeaway ? ['takeaway'] : []),
    ]);
    const st = stage(ctx, {
      cues: this.cues.filter((q) => used.has(q.id)),
      anchors: score.beats,
      centre: true,
      // The highlight is the chart's one mark: no engine underline under a category label.
      decorJuice: false,
    });
    const fmt = chartFormat(c);
    const items = chartItems(c);
    const values = c.values;
    const L = layoutChartStory(variant, ctx.format, ctx.height, st.safe, {
      values,
      title: Boolean(c.title),
      takeaway: Boolean(c.takeaway),
      valueChars: Math.max(...values.map((v) => formatCount(v, fmt).length)),
    });
    const hi = highlightIndex(c, variant);
    const line = variant === 'line';

    const title =
      L.title && c.title
        ? st.text('title', c.title, L.title, { role: 'display', balance: true })
        : null;
    // Shapes first, so the text sits on top of them.
    const baseline = st.shape('baseline', L.baseline, {
      color: 'muted',
      radius: 0,
      ...(L.orient === 'h' ? { origin: 'bottom' as const } : {}),
    });
    const origin = L.orient === 'v' ? ('bottom' as const) : ('left' as const);
    const radius = Math.max(2, Math.round(Math.min(ctx.width, ctx.height) * 0.004));
    const bars = line
      ? []
      : L.items.map((s, i) =>
          st.shape(`bar-${i + 1}`, s.bar, { color: 'chart-1', radius, origin }),
        );
    const hiBar = line
      ? null
      : st.shape('bar-highlight', (L.items[hi] as ChartItemSlots).bar, {
          color: 'accent',
          radius,
          origin,
        });
    const drops = L.drops.map((b, i) =>
      st.shape(`drop-${i + 1}`, b, { color: 'chart-0', radius: 0, origin: 'bottom' }),
    );
    const segments: (Actor | null)[] = line
      ? L.items.map((s, i) => {
          const a = L.items[i - 1]?.point;
          const b = s.point;
          if (!a || !b) return null;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          return st.shape(
            `segment-${i}`,
            { x: a.x, y: a.y - L.stroke / 2, width: Math.round(len), height: L.stroke },
            {
              color: 'ink',
              radius: Math.round(L.stroke / 2),
              rotate: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
            },
          );
        })
      : [];
    const dots = line
      ? L.items.map((s, i) =>
          st.shape(`dot-${i + 1}`, s.bar, { color: 'ink', radius: L.dot, origin: 'center' }),
        )
      : [];
    const hiDot = line
      ? (() => {
          const b = (L.items[hi] as ChartItemSlots).bar;
          const d = Math.round(L.dot * 1.7);
          return st.shape(
            'dot-highlight',
            { x: b.x + b.width / 2 - d / 2, y: b.y + b.height / 2 - d / 2, width: d, height: d },
            { color: 'accent', radius: d, origin: 'center' },
          );
        })()
      : null;
    const labels = items.map((it, i) =>
      st.text(`label-${i + 1}`, it.label, (L.items[i] as ChartItemSlots).label, {
        role: 'body',
        balance: true,
        keepWords: true,
      }),
    );
    const valueActors = items.map((it, i) =>
      st.number(`value-${i + 1}`, it.value, fmt, (L.items[i] as ChartItemSlots).value, {
        focal: i === 0,
      }),
    );
    // One size per kind: every category label (and every value) takes the size of the one that
    // had to shrink most, so the labels read as one row instead of a ragged mix (9:16 review).
    for (const list of [labels, valueActors]) {
      const size = Math.min(...list.map((a) => a.size).filter((s) => s > 0));
      if (!Number.isFinite(size)) continue;
      for (const a of list) {
        if (a.size <= size) continue;
        a.el.style.fontSize = `${size}px`;
        a.size = size;
      }
    }
    const takeaway =
      L.takeaway && c.takeaway
        ? st.text('takeaway', c.takeaway, L.takeaway, { role: 'label', balance: true })
        : null;

    // Layout only: titles and labels that set fewer lines than their boxes reserve close up, so
    // the chart doesn't float between empty bands.
    const setH = (a: Actor) => a.el.offsetHeight;
    if (labels.every((a) => setH(a) > 0)) {
      const spare = Math.min(...labels.map((a) => a.box.height - setH(a)));
      if (takeaway && L.orient === 'v' && spare > 0) st.nudge(takeaway, -spare);
      if (title && setH(title) > 0 && title.box.height - setH(title) > 0)
        st.nudge(title, title.box.height - setH(title));
    }
    const strip = takeaway ? st.surface('takeaway-strip', 'strip', takeaway) : null;

    if (title) st.on('title', enter(title));
    items.forEach((_, i) => {
      const actions: Action[] = [];
      if (i === 0) actions.push(enter(baseline, 'draw'));
      const bar = bars[i];
      if (bar) actions.push(enter(bar, 'draw'));
      const drop = drops[i];
      if (drop) actions.push(enter(drop, 'draw'));
      const seg = segments[i];
      if (seg) actions.push(enter(seg, 'draw'));
      const dot = dots[i];
      if (dot) actions.push(enter(dot, 'pop'));
      actions.push(enter(labels[i] as Actor), enter(valueActors[i] as Actor));
      st.on(`v${i + 1}`, ...actions);
    });
    st.on(
      'highlight',
      ...(hiBar ? [enter(hiBar, 'draw')] : []),
      ...(hiDot ? [enter(hiDot, 'pop')] : []),
      mark(valueActors[hi] as Actor, 'emphasis'),
    );
    if (takeaway) st.on('takeaway', ...(strip ? [enter(strip, 'wipe')] : []), enter(takeaway));
    return st.compile();
  },
});
