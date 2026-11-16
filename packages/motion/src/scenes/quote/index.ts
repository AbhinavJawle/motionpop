import { z } from 'zod';
import type { Format } from '../../contract';
import type { Box } from '../../core/safe-area';
import { enter, findPhrase, mark, stage, type Actor, type TextSlot } from '../../engine/stage';
import { defineScene } from '../define';
import { column, stack } from '../layout';

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const QUOTE_MAX_WORDS = 24;

export const quoteContent = z.object({
  quote: z
    .string()
    .min(1)
    .max(140)
    .refine((s) => s.trim().length > 0 && wordCount(s) <= QUOTE_MAX_WORDS, 'at most 24 words')
    .describe('The quoted words exactly as spoken, in order, at most 24 words, no quote marks'),
  attribution: z
    .string()
    .max(48)
    .refine((s) => wordCount(s) <= 6, 'at most 6 words')
    .optional()
    .describe('Who said it, as the narration names them, at most 6 words, e.g. "A night nurse"'),
  emphasis: z
    .string()
    .max(32)
    .optional()
    .describe('One to four words copied exactly from the quote, the ones to hit hardest'),
});
export type QuoteContent = z.infer<typeof quoteContent>;

const QUOTE_OPEN = /^["“‘']/;
const QUOTE_CLOSE = /["”’']["')\].,!?;:]*$/;
const strip = (w: string) => w.replace(/^["“‘']+/, '').replace(/["”’']+(?=[.,!?;:]*$)/, '');

/**
 * Safe default from the slot's words (spec 07 R1.4): the words inside quote marks when the
 * transcript has them, else the slot's first sentence. At most 24 words and 140 characters;
 * no attribution (the words don't say who reliably). Null when nothing is left.
 */
export function quoteFromWords(words: readonly string[]): QuoteContent | null {
  const ws = words.map((w) => w.trim()).filter(Boolean);
  const open = ws.findIndex((w) => QUOTE_OPEN.test(w));
  let picked: string[];
  if (open >= 0) {
    const close = ws.findIndex(
      (w, i) => i >= open && QUOTE_CLOSE.test(w) && (i > open || w.length > 1),
    );
    picked = ws.slice(open, close >= 0 ? close + 1 : ws.length).map(strip);
  } else {
    const end = ws.findIndex((w) => /[.!?]["')\]]*$/.test(w));
    picked = ws.slice(0, end >= 0 ? end + 1 : ws.length);
  }
  const out: string[] = [];
  for (const w of picked.filter(Boolean)) {
    if (out.length === QUOTE_MAX_WORDS || [...out, w].join(' ').length > 140) break;
    out.push(w);
  }
  const quote = out.join(' ').replace(/[,;:]+$/, '');
  return quote ? { quote } : null;
}

export interface QuoteSlots {
  quote: TextSlot;
  attribution?: TextSlot;
  /** `left`: the accent bar beside the quote. */
  bar?: Box;
  area: Box;
}

/** Per-format layout of each variant, in frame pixels inside the camera-safe area. */
export function layoutQuote(
  variant: string,
  format: Format,
  frameH: number,
  safe: Box,
  has: { attribution: boolean; words: number },
): QuoteSlots {
  const wide = format === '16:9';
  const tall = format === '9:16';
  const by = <T>(w: T, t: T, s: T) => (wide ? w : tall ? t : s);
  const left = variant === 'left';
  // Short quotes set larger, so a four-word line fills the frame like a long one.
  const k = has.words <= 4 ? 1.6 : has.words <= 8 ? 1.35 : has.words <= 14 ? 1.15 : 1;
  const rows = [
    {
      id: 'quote',
      size: by(0.08, 0.054, 0.07) * k,
      // Reserve only the lines a short quote can need, so its larger size isn't scaled back down.
      lines: Math.min(by(4, 7, 5), Math.max(2, Math.ceil(has.words / 3))),
      min: 0.45 / k,
      gap: 0.6 / k,
    },
    ...(has.attribution
      ? [{ id: 'attribution', size: by(0.042, 0.03, 0.04), lines: 1, min: 0.7 }]
      : []),
  ];
  const barW = Math.max(4, Math.round(frameH * 0.008));
  const gutter = Math.round(frameH * 0.03);
  const inner = left
    ? { ...safe, x: safe.x + barW + gutter, width: safe.width - barW - gutter }
    : safe;
  const area = column(inner, left ? by(0.86, 1, 1) : by(0.8, 1, 0.94));
  const s = stack(area, frameH, rows, { align: left ? 'left' : 'center', bias: 0.45 });
  const quote = s['quote'] as TextSlot;
  return {
    quote,
    ...(s['attribution'] ? { attribution: s['attribution'] } : {}),
    ...(left ? { bar: { x: safe.x, y: quote.box.y, width: barW, height: quote.box.height } } : {}),
    area,
  };
}

/**
 * quote: a pull quote in quote marks, word by word on the voice. The look's emphasis
 * mark hits the words spoken hardest, and the attribution follows. `card` puts it on the look's
 * card; `left` sets it beside an accent bar.
 */
export const quote = defineScene<QuoteContent>({
  id: 'quote',
  name: 'Quote',
  category: 'text',
  useWhen: 'the narration quotes someone or reads out words someone said or wrote',
  content: quoteContent,
  defaultContent: {
    quote: 'The quiet hours are the hardest ones',
    attribution: 'A night nurse',
    emphasis: 'hardest',
  },
  variants: [
    { id: 'center', about: 'the quote centred, in quote marks; the safe default' },
    { id: 'card', about: 'the quote on the look’s card, like a clipping; for the big moment' },
    { id: 'left', about: 'left-aligned beside an accent bar; calmer, for longer quotes' },
  ],
  peakVariant: 'card',
  cues: [
    { id: 'quote', about: 'the quote starts, on its first spoken word' },
    {
      id: 'emphasis',
      about: 'the emphasis words are hit, on the word that says them',
      optional: true,
      leadMs: 260,
    },
    { id: 'attribution', about: 'who said it appears under the quote', optional: true, snap: true },
  ],
  focalCue: 'quote',
  imageRoles: [],
  safe: quoteFromWords,
  // ideal: a 24-word quote at speaking pace, the emphasis, then a 6-word attribution read in
  // full (motion:check measured the attribution dropped at 9.6 s).
  durationMs: { min: 3000, ideal: 10800, max: 15000 },
  formats: ['16:9', '9:16', '1:1'],
  keyMomentMs: (durationMs) => Math.min(600, durationMs * 0.15),
  build(ctx, score, variant) {
    const c = score.content;
    const tokens = c.quote.trim().split(/\s+/).filter(Boolean);
    const quoteWord = score.beats.find((b) => b.cue === 'quote')?.word;
    const emphasis = c.emphasis && findPhrase(tokens, c.emphasis).length ? c.emphasis : undefined;
    const focus = emphasis ? findPhrase(tokens, emphasis) : [];
    // The emphasis lands on the word that says it.
    const beats = [...score.beats];
    if (focus.length && quoteWord !== undefined && !beats.some((b) => b.cue === 'emphasis')) {
      const w = quoteWord + (focus[0] as number);
      if (ctx.words && w < ctx.words.length) beats.push({ cue: 'emphasis', word: w });
    }
    const st = stage(ctx, {
      cues: this.cues,
      anchors: beats,
      centre: true,
      // The emphasis is the quote's one mark: no engine underline under a line already read.
      decorJuice: false,
    });
    const L = layoutQuote(variant, ctx.format, ctx.height, st.safe, {
      attribution: Boolean(c.attribution),
      words: tokens.length,
    });
    // The quote marks ride on the first and last words, so the words still match the voice
    // one to one (findPhrase ignores the marks).
    const line = st.text('quote', `“${c.quote.trim()}”`, L.quote, {
      role: 'display',
      byWord: true,
      focal: true,
      balance: true,
      ...(emphasis ? { emphasis } : {}),
    });
    const by =
      L.attribution && c.attribution
        ? st.text('attribution', `— ${c.attribution}`, L.attribution, {
            role: 'label',
            balance: true,
          })
        : null;
    // Re-stack by the lines the quote really sets, so a short quote sits at the optical centre.
    st.restack([line, by], L.area);
    const carried = [line, by].filter((a): a is Actor => a !== null);
    const card =
      variant === 'card'
        ? st.surface('card', 'card', carried, { pad: { x: 0.045, y: 0.04 } })
        : null;
    if (card) st.on('quote', enter(card, 'slam'));
    if (L.bar) {
      const bar = { ...L.bar, y: line.box.y, height: line.box.height };
      st.on('quote', enter(st.shape('bar', bar, { color: 'accent' }), 'mask'));
    }
    st.on('quote', enter(line));
    if (focus.length) st.on('emphasis', mark(line, 'emphasis'));
    if (by) st.on('attribution', enter(by));
    return st.compile();
  },
});
