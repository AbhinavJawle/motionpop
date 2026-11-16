import { z } from 'zod';
import type { Format } from '../../contract';
import type { Box } from '../../core/safe-area';
import { enter, findPhrase, mark, stage, type Actor, type TextSlot } from '../../engine/stage';
import { defineScene } from '../define';
import { column, stack } from '../layout';

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const hookStatementContent = z.object({
  eyebrow: z
    .string()
    .max(32)
    .optional()
    .describe('Tiny label above the line, e.g. "CHAPTER 2" or "THE PROBLEM"'),
  line: z
    .string()
    .min(1)
    .max(90)
    .refine((s) => wordCount(s) <= 14, 'at most 14 words')
    .describe('The statement, using the spoken words in order, at most 14 words'),
  emphasis: z
    .string()
    .max(32)
    .optional()
    .describe('One to three words copied exactly from the line, the ones to hit hardest'),
  subline: z
    .string()
    .max(60)
    .refine((s) => wordCount(s) <= 8, 'at most 8 words')
    .optional()
    .describe('Short line under the statement, at most 8 words'),
});
export type HookStatementContent = z.infer<typeof hookStatementContent>;

/** Safe default from the slot's words: its first words, at most 8 and 90 characters. */
export function hookFromWords(words: readonly string[]): HookStatementContent | null {
  const out: string[] = [];
  for (const w of words.map((x) => x.trim()).filter(Boolean)) {
    if (out.length === 8 || [...out, w].join(' ').length > 90) break;
    out.push(w);
  }
  // End on a sentence when one ends inside the cut (never "…the beginning. Here's what"); a
  // question mark stays, a full stop goes, like the detector's draft.
  const end = out.findIndex((w) => /[.!?]["')\]]*$/.test(w));
  const kept = end >= 2 && end < out.length - 1 ? out.slice(0, end + 1) : out;
  const line = kept.join(' ').replace(/[.,;:!]+$/, '');
  return line ? { line } : null;
}

/** A word spoken at least this hard becomes the emphasis when the score names none. */
export const AUTO_EMPHASIS_STRESS = 70;

/**
 * Words that carry grammar, not meaning: auto-emphasis never picks them, however hard they are
 * spoken ("Let's look at the numbers" emphasises "numbers", not "Let's"). Lower case, curly
 * apostrophes folded to straight ones.
 */
const FUNCTION_WORDS = new Set(
  (
    'a an the and or but nor so yet if then than as of at by for from in into on onto to up ' +
    'with without about over under after before since until via per off out ' +
    'i me my mine we us our ours you your yours he him his she her hers it its they them ' +
    'their theirs this that these those there here who whom whose which what when where why how ' +
    'is am are was were be been being do does did done have has had having will would shall ' +
    "should can could may might must let let's lets it's that's there's here's what's who's " +
    "i'm you're we're they're i've you've we've they've i'll you'll we'll they'll i'd you'd " +
    "he's she's isn't aren't wasn't weren't don't doesn't didn't won't can't just very really " +
    'also too not no all any some each every much many more most such own same other only'
  ).split(' '),
);

/** Whether a line token can carry the emphasis: it has a letter or digit and isn't grammar. */
export function isContentWord(token: string): boolean {
  const w = token
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%']+$/gu, '')
    .replace(/'+$/, '');
  return /[\p{L}\p{N}]/u.test(w) && !FUNCTION_WORDS.has(w);
}
/** Most words the punch variant sets huge (the emphasis and what follows it). */
export const PUNCH_MAX = 4;

type Slots = {
  eyebrow?: TextSlot;
  line: TextSlot;
  big?: TextSlot;
  subline?: TextSlot;
  /** The column the rows were stacked in: the build re-stacks them by what they really set. */
  area: Box;
};

export function layoutHookStatement(
  variant: string,
  format: Format,
  frameH: number,
  safe: Box,
  has: { eyebrow: boolean; subline: boolean },
): Slots & { bar?: Box } {
  const wide = format === '16:9';
  const tall = format === '9:16';
  const by = <T>(w: T, t: T, s: T) => (wide ? w : tall ? t : s);
  const eyebrow = has.eyebrow ? [{ id: 'eyebrow', size: by(0.028, 0.02, 0.026), gap: 1 }] : [];
  const subline = has.subline
    ? [{ id: 'subline', size: by(0.04, 0.03, 0.038), lines: 2, min: 0.7 }]
    : [];
  const pick = (s: Record<string, TextSlot>, area: Box): Slots => ({
    ...(s['eyebrow'] ? { eyebrow: s['eyebrow'] } : {}),
    line: s['line'] as TextSlot,
    ...(s['big'] ? { big: s['big'] } : {}),
    ...(s['subline'] ? { subline: s['subline'] } : {}),
    area,
  });

  if (variant === 'punch') {
    // A smaller lead-in, then the emphasised words as large as the frame allows.
    const area = column(safe, by(0.9, 1, 1));
    return pick(
      stack(
        area,
        frameH,
        [
          ...eyebrow,
          // Gaps clear the look's strip under the big words (its pad is 0.22 of their size),
          // so it never covers the lead-in or the subline once the rows are re-stacked.
          { id: 'line', size: by(0.05, 0.036, 0.046), lines: 2, min: 0.6, gap: 1.2 },
          { id: 'big', size: by(0.2, 0.11, 0.16), lines: by(2, 3, 2), min: 0.3, gap: 0.34 },
          ...subline,
        ],
        { align: tall ? 'left' : 'center', bias: 0.45 },
      ),
      area,
    );
  }

  const rows = [
    ...eyebrow,
    { id: 'line', size: by(0.1, 0.068, 0.085), lines: by(3, 5, 4), min: 0.5, gap: 0.25 },
    ...subline,
  ];

  if (variant === 'left') {
    // Left-aligned with an accent bar that draws down beside the line.
    const barW = Math.max(4, Math.round(frameH * 0.008));
    const gutter = Math.round(frameH * 0.03);
    const inner = { ...safe, x: safe.x + barW + gutter, width: safe.width - barW - gutter };
    const area = by(column(inner, 0.92), inner, inner);
    const s = pick(stack(area, frameH, rows, { align: 'left' }), area);
    const lb = s.line.box;
    return { ...s, bar: { x: safe.x, y: lb.y, width: barW, height: lb.height } };
  }

  // 'center': the safe default.
  const area = column(safe, by(0.84, 1, 1));
  return pick(stack(area, frameH, rows, { align: 'center', bias: 0.45 }), area);
}

/**
 * hook-statement: an opening line or claim, word by word on the voice. The look's emphasis
 * mark hits the words spoken hardest; an eyebrow and a subline frame it.
 */
export const hookStatement = defineScene<HookStatementContent>({
  id: 'hook-statement',
  name: 'Hook statement',
  category: 'text',
  useWhen: 'an opening line, a bold claim, a question to the viewer or a new chapter',
  content: hookStatementContent,
  defaultContent: {
    line: 'Nobody tells you the real reason prices keep going up',
    emphasis: 'real reason',
  },
  variants: [
    { id: 'center', about: 'the line centred, emphasis marked in place; the safe default' },
    { id: 'left', about: 'left-aligned with an accent bar; calmer, for chapters and claims' },
    {
      id: 'punch',
      about: 'a small lead-in, then the emphasis words huge; best when the line ends on them',
    },
  ],
  peakVariant: 'punch',
  cues: [
    { id: 'eyebrow', about: 'the tiny label above appears', optional: true, snap: true },
    { id: 'line', about: 'the line starts, on its first spoken word' },
    {
      id: 'emphasis',
      about: 'the emphasis words are hit, on the word that says them',
      optional: true,
      // A mark or a slam: quick by nature.
      leadMs: 260,
    },
    { id: 'subline', about: 'the short line under it appears', optional: true, snap: true },
  ],
  focalCue: 'line',
  imageRoles: [],
  safe: hookFromWords,
  // ideal: a 14-word line at speaking pace, then the emphasis and an 8-word subline read in full.
  durationMs: { min: 2400, ideal: 8400, max: 12000 },
  formats: ['16:9', '9:16', '1:1'],
  keyMomentMs: (durationMs) => Math.min(600, durationMs * 0.15),
  build(ctx, score, variant) {
    const c = score.content;
    const tokens = c.line.trim().split(/\s+/).filter(Boolean);
    const lineWord = score.beats.find((b) => b.cue === 'line')?.word;

    // Emphasis: the score's, else the line's most stressed spoken word (code refines the plan).
    let emphasis = c.emphasis && findPhrase(tokens, c.emphasis).length ? c.emphasis : undefined;
    if (!emphasis && lineWord !== undefined && ctx.stress) {
      let best = -1;
      tokens.forEach((t, k) => {
        const s = ctx.stress?.[lineWord + k] ?? 0;
        if (!isContentWord(t)) return;
        if (s >= AUTO_EMPHASIS_STRESS && (best < 0 || s > (ctx.stress?.[lineWord + best] ?? 0)))
          best = k;
      });
      if (best >= 0) emphasis = tokens[best];
    }
    const focus = emphasis ? findPhrase(tokens, emphasis) : [];
    // punch needs a lead-in before the emphasis and a short tail; otherwise it reads as `center`.
    const v =
      variant === 'punch' && ((focus[0] ?? 0) === 0 || tokens.length - (focus[0] ?? 0) > PUNCH_MAX)
        ? 'center'
        : variant;

    // The emphasis lands on the word that says it.
    const beats = [...score.beats];
    if (focus.length && lineWord !== undefined && !beats.some((b) => b.cue === 'emphasis')) {
      const w = lineWord + (focus[0] as number);
      if (ctx.words && w < ctx.words.length) beats.push({ cue: 'emphasis', word: w });
    }

    const st = stage(ctx, { cues: this.cues, anchors: beats, centre: true });
    const slots = layoutHookStatement(v, ctx.format, ctx.height, st.safe, {
      eyebrow: Boolean(c.eyebrow),
      subline: Boolean(c.subline),
    });
    const eyebrow =
      slots.eyebrow && c.eyebrow
        ? st.text('eyebrow', c.eyebrow, slots.eyebrow, { role: 'eyebrow' })
        : null;
    const subline =
      slots.subline && c.subline
        ? st.text('subline', c.subline, slots.subline, { role: 'label', balance: true })
        : null;
    if (v === 'punch' && slots.big) {
      const cut = focus[0] as number;
      const lead = st.text('line', tokens.slice(0, cut).join(' '), slots.line, {
        role: 'body',
        byWord: true,
        focal: true,
        balance: true,
      });
      const big = st.text('big', tokens.slice(cut).join(' '), slots.big, {
        role: 'display',
        emphasis,
        truncatable: false,
        balance: true,
      });
      st.restack([eyebrow, lead, big, subline], slots.area);
      if (eyebrow) st.on('eyebrow', enter(eyebrow));
      st.on('line', enter(lead));
      // The look's strip under the punch words (a cut colour strip, a torn clipping), if any.
      const strip = st.surface('big-strip', 'strip', big);
      st.on('emphasis', ...(strip ? [enter(strip, 'wipe')] : []), enter(big, 'slam'));
    } else {
      const line = st.text('line', c.line, slots.line, {
        role: 'display',
        byWord: true,
        focal: true,
        balance: true,
        ...(emphasis ? { emphasis } : {}),
      });
      // A short line sets fewer lines than its box reserves: re-stack by what it set, so the
      // block sits at the optical centre instead of in the upper third.
      st.restack([eyebrow, line, subline], slots.area);
      // The look's card under the whole statement (paper on the desk). It arrives with the line,
      // and the eyebrow rides in on it, so nothing floats before its card lands.
      const carried = [eyebrow, line, subline].filter((a): a is Actor => a !== null);
      const card = st.surface('card', 'card', carried, { pad: { x: 0.04, y: 0.035 } });
      if (eyebrow) st.on(card ? 'line' : 'eyebrow', enter(eyebrow));
      if (card) st.on('line', enter(card, 'slam'));
      if (slots.bar) {
        // The bar runs beside the line as it is set (after the re-stack).
        const bar = { ...slots.bar, y: line.box.y, height: line.box.height };
        st.on('line', enter(st.shape('bar', bar, { color: 'accent' }), 'mask'));
      }
      st.on('line', enter(line));
      if (focus.length) st.on('emphasis', mark(line, 'emphasis'));
    }
    if (subline) st.on('subline', enter(subline));
    return st.compile();
  },
});
