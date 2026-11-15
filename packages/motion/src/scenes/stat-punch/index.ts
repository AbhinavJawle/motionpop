import { z } from 'zod';
import type { Format } from '../../contract';
import type { CountFormat } from '../../core/count';
import type { Box } from '../../core/safe-area';
import { enter, mark, stage, type TextSlot } from '../../engine/stage';
import { defineScene } from '../define';
import { column, columns, stack } from '../layout';

export const statPunchContent = z.object({
  value: z.number().describe('The number, exactly as spoken (40 for "forty percent")'),
  prefix: z.string().max(4).optional().describe('Text before the number, e.g. "$"'),
  suffix: z.string().max(4).optional().describe('Text after the number, e.g. "%", "M", "k"'),
  decimals: z.number().int().min(0).max(2).default(0).describe('Decimal places shown'),
  label: z
    .string()
    .min(1)
    .max(48)
    .describe('Short line that says what the number is, at most 6 words'),
  context: z.string().max(40).optional().describe('Small line above the number, e.g. "SINCE 2020"'),
  countFrom: z.number().default(0).describe('Where the count starts'),
});
export type StatPunchContent = z.infer<typeof statPunchContent>;

type Slots = { context?: TextSlot; number: TextSlot; label: TextSlot };

const FILLERS = new Set(['um', 'uh', 'erm', 'like']);
const bare = (w: string) => w.replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu, '');

/**
 * Safe default from the slot's words: the first written number (with its currency, % or
 * k/M/bn) and the few words after it as the label. Null when no number is written in digits.
 */
export function statPunchFromWords(words: readonly string[]): StatPunchContent | null {
  const clean = words.map(bare);
  const i = clean.findIndex((w) => /^[$€£]?\d[\d,]*(\.\d+)?(%|k|m|bn|b)?$/i.test(w));
  if (i < 0) return null;
  const m = /^([$€£]?)([\d,]+(?:\.\d+)?)(%|k|m|bn|b)?$/i.exec(clean[i] as string);
  if (!m) return null;
  const digits = (m[2] as string).replace(/,/g, '');
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  const decimals = Math.min(2, digits.split('.')[1]?.length ?? 0);
  const unit = m[3] ? (m[3].toLowerCase() === 'm' ? 'M' : m[3].toLowerCase()) : undefined;
  const pick = (from: number, to: number) =>
    clean.slice(from, to).filter((w) => w && !FILLERS.has(w.toLowerCase()));
  let label = pick(i + 1, i + 5);
  if (unit === undefined && /^percent$/i.test(label[0] ?? '')) label = label.slice(1);
  // "grew 40% since 2020": the words before say what the number is.
  if (label.length === 0 || /^(since|in|from|by|over|to|at|on)$/i.test(label[0] ?? ''))
    label = pick(Math.max(0, i - 4), i).length ? pick(Math.max(0, i - 4), i) : label;
  const text = label.join(' ').slice(0, 48).trim();
  if (!text) return null;
  const pct = unit === undefined && /^percent$/i.test(clean[i + 1] ?? '');
  return {
    value,
    ...(m[1] ? { prefix: m[1] } : {}),
    ...(unit || pct ? { suffix: pct ? '%' : unit } : {}),
    decimals,
    label: text,
    countFrom: 0,
  };
}

/** Per-format layout of each variant, in frame pixels inside the camera-safe area. */
export function layoutStatPunch(
  variant: string,
  format: Format,
  frameH: number,
  safe: Box,
  hasContext: boolean,
): Slots {
  const wide = format === '16:9';
  const tall = format === '9:16';
  const ctx = (size: number) => (hasContext ? [{ id: 'context', size, min: 0.75, gap: 1.2 }] : []);
  const pick = (s: Record<string, TextSlot>): Slots => ({
    ...(s['context'] ? { context: s['context'] } : {}),
    number: s['number'] as TextSlot,
    label: s['label'] as TextSlot,
  });

  if (variant === 'hero') {
    // Everything centred, the number as large as the frame allows.
    const num = wide ? 0.34 : tall ? 0.2 : 0.28;
    return pick(
      stack(
        column(safe, wide ? 0.9 : 1),
        frameH,
        [
          ...ctx(wide ? 0.03 : tall ? 0.018 : 0.028),
          { id: 'number', size: num, min: tall ? 0.2 : 0.3, gap: 0.08 },
          { id: 'label', size: wide ? 0.045 : tall ? 0.03 : 0.042, lines: tall ? 3 : 2 },
        ],
        { align: 'center', bias: 0.42 },
      ),
    );
  }

  if (variant === 'side' && wide) {
    // Number on the left, the words that explain it in a column on the right.
    const [left, right] = columns(safe, 0.54);
    const n = stack(left, frameH, [{ id: 'number', size: 0.3, min: 0.2 }], {
      align: 'left',
      bias: 0.45,
    });
    const r = stack(right, frameH, [...ctx(0.03), { id: 'label', size: 0.06, lines: 3 }], {
      align: 'left',
      bias: 0.45,
    });
    return pick({ ...n, ...r });
  }

  if (variant === 'side') {
    // Narrow frames: number high in the frame, a larger left-aligned label under it.
    return pick(
      stack(
        safe,
        frameH,
        [
          ...ctx(tall ? 0.018 : 0.028),
          { id: 'number', size: tall ? 0.14 : 0.2, min: 0.3, gap: 0.14 },
          { id: 'label', size: tall ? 0.04 : 0.055, lines: 3 },
        ],
        { align: 'left', bias: 0.3 },
      ),
    );
  }

  // 'stack': the classic column (matches the original big-number component).
  return pick(
    stack(
      column(safe, wide ? 1 : tall ? 1 : 0.92),
      frameH,
      [
        ...ctx(wide ? 0.03 : tall ? 0.018 : 0.028),
        {
          id: 'number',
          size: wide ? 0.26 : tall ? 0.15 : 0.22,
          min: wide ? 0.42 : 0.25,
          gap: 0.12,
        },
        { id: 'label', size: wide ? 0.05 : tall ? 0.032 : 0.05, lines: tall ? 3 : 2 },
      ],
      { align: wide ? 'left' : 'center', bias: wide ? 0.45 : 0.42 },
    ),
  );
}

/**
 * stat-punch: one number made to feel undeniable. A context line sets it up, the number counts
 * up and lands on the spoken word, the look's emphasis mark hits it, then the label explains it.
 */
export const statPunch = defineScene<StatPunchContent>({
  id: 'stat-punch',
  name: 'Stat punch',
  category: 'data',
  useWhen: 'the narration states one striking number, percentage, money amount or count',
  content: statPunchContent,
  defaultContent: {
    value: 40,
    suffix: '%',
    decimals: 0,
    label: 'Revenue growth since 2020',
    countFrom: 0,
  },
  variants: [
    { id: 'stack', about: 'context, number and label in one column; the safe default' },
    { id: 'hero', about: 'number centred and as large as possible; best for the biggest moment' },
    { id: 'side', about: 'number on one side, label beside or under it; best with a longer label' },
  ],
  peakVariant: 'hero',
  cues: [
    { id: 'context', about: 'the small set-up line appears', optional: true, snap: true },
    { id: 'number', about: 'the number lands, on the word that says it', leadMs: 900 },
    {
      id: 'label',
      about: 'the label that explains the number appears',
      optional: true,
      snap: true,
    },
  ],
  focalCue: 'number',
  imageRoles: [],
  safe: statPunchFromWords,
  // ideal: the longest label allowed (9 words) still gets its full read time after a default key moment.
  durationMs: { min: 2600, ideal: 4600, max: 8000 },
  formats: ['16:9', '9:16', '1:1'],
  build(ctx, score, variant) {
    const c = score.content;
    const st = stage(ctx, { cues: this.cues, anchors: score.beats, centre: true });
    const slots = layoutStatPunch(variant, ctx.format, ctx.height, st.safe, Boolean(c.context));
    const fmt: CountFormat = { prefix: c.prefix, suffix: c.suffix, decimals: c.decimals };
    if (slots.context && c.context) {
      st.on('context', enter(st.text('context', c.context, slots.context, { role: 'eyebrow' })));
    }
    const num = st.number('number', c.value, fmt, slots.number, { countFrom: c.countFrom });
    st.on('number', enter(num), mark(num, 'emphasis'));
    const label = st.text('label', c.label, slots.label, { role: 'label' });
    // The look's strip under the label (a torn paper clipping, a cut colour strip), if any.
    const strip = st.surface('label-strip', 'strip', label);
    st.on('label', ...(strip ? [enter(strip, 'wipe')] : []), enter(label));
    return st.compile();
  },
});
