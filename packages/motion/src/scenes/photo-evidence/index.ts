import { z } from 'zod';
import type { Format } from '../../contract';
import type { Box } from '../../core/safe-area';
import { enter, findPhrase, mark, stage, type Actor, type TextSlot } from '../../engine/stage';
import { defineScene } from '../define';
import { column, stack } from '../layout';

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const photoEvidenceContent = z.object({
  caption: z
    .string()
    .min(1)
    .max(72)
    .refine((s) => s.trim().length > 0 && wordCount(s) <= 10, 'at most 10 words')
    .describe(
      'What the picture shows and why it matters, at most 10 words, in the narration’s words',
    ),
  kicker: z
    .string()
    .max(28)
    .refine((s) => wordCount(s) <= 4, 'at most 4 words')
    .optional()
    .describe('Small line above the caption, at most 4 words, e.g. "EXHIBIT A" or "1912"'),
  emphasis: z
    .string()
    .max(32)
    .optional()
    .describe('One to three words copied exactly from the caption, the ones to hit hardest'),
});
export type PhotoEvidenceContent = z.infer<typeof photoEvidenceContent>;

/** Safe default: the slot's first sentence, at most 10 words. Null when nothing is left. */
export function photoFromWords(words: readonly string[]): PhotoEvidenceContent | null {
  const ws = words.map((w) => w.trim().replace(/^["“‘']+|["”’']+$/g, '')).filter(Boolean);
  const end = ws.findIndex((w) => /[.!?]$/.test(w));
  const out: string[] = [];
  for (const w of ws.slice(0, end >= 0 ? end + 1 : ws.length)) {
    if (out.length === 10 || [...out, w].join(' ').length > 72) break;
    out.push(w);
  }
  const caption = out.join(' ').replace(/[,;:.]+$/, '');
  return caption ? { caption } : null;
}

interface Slots {
  kicker?: TextSlot;
  caption: TextSlot;
  area: Box;
}

/** Layout inside whatever frame the scene gets (the text side of an image split, or the whole frame). */
export function layoutPhoto(
  variant: string,
  format: Format,
  frameH: number,
  safe: Box,
  has: { kicker: boolean; words: number },
): Slots {
  const wide = format === '16:9';
  const tall = format === '9:16';
  const by = <T>(w: T, t: T, s: T) => (wide ? w : tall ? t : s);
  const big = variant === 'statement';
  const k = has.words <= 4 ? 1.35 : has.words <= 7 ? 1.15 : 1;
  const area = column(safe, by(0.86, 1, 0.94));
  const s = stack(
    area,
    frameH,
    [
      ...(has.kicker ? [{ id: 'kicker', size: by(0.034, 0.024, 0.032), min: 0.7, gap: 0.9 }] : []),
      {
        id: 'caption',
        size: by(0.075, 0.05, 0.068) * k * (big ? 1.15 : 1),
        lines: by(3, 5, 4),
        min: 0.45 / k,
      },
    ],
    { align: variant === 'label' ? 'left' : 'center', bias: 0.45 },
  );
  return {
    ...(s['kicker'] ? { kicker: s['kicker'] } : {}),
    caption: s['caption'] as TextSlot,
    area,
  };
}

/**
 * photo-evidence: a picture of the thing the narration talks about (generated in the look's
 * style or uploaded), with a caption that lands word by word on the voice. The image takes half
 * the frame; without a ready image the caption plays alone as a title (the image-free form).
 */
export const photoEvidence = defineScene<PhotoEvidenceContent>({
  id: 'photo-evidence',
  name: 'Photo',
  category: 'text',
  useWhen:
    'the narration describes a concrete thing worth seeing: an object, place, animal, invention, artefact or scene',
  content: photoEvidenceContent,
  defaultContent: { caption: 'The ship that changed global trade', kicker: '1956' },
  variants: [
    { id: 'caption', about: 'picture with a centred caption beside or under it; the safe default' },
    { id: 'statement', about: 'picture with a larger, bolder caption; for the big moment' },
    {
      id: 'label',
      about: 'picture with a left-aligned caption on the look’s label, like a museum card',
    },
  ],
  peakVariant: 'statement',
  cues: [
    { id: 'kicker', about: 'the small line above the caption appears', optional: true, snap: true },
    { id: 'caption', about: 'the caption starts, on its first spoken word', leadMs: 500 },
    {
      id: 'emphasis',
      about: 'the emphasis words are hit, on the word that says them',
      optional: true,
      leadMs: 260,
    },
  ],
  focalCue: 'caption',
  imageRoles: [
    {
      id: 'photo',
      aspect: '1:1',
      about:
        'the concrete thing the narration describes (object, place, animal, artefact); never a real person by name, no text or logos',
    },
  ],
  imageShare: 0.5,
  safe: photoFromWords,
  durationMs: { min: 2600, ideal: 5200, max: 10000 },
  formats: ['16:9', '9:16', '1:1'],
  keyMomentMs: (durationMs) => Math.min(700, durationMs * 0.2),
  build(ctx, score, variant) {
    const c = score.content;
    const tokens = c.caption.trim().split(/\s+/).filter(Boolean);
    const capWord = score.beats.find((b) => b.cue === 'caption')?.word;
    const emphasis = c.emphasis && findPhrase(tokens, c.emphasis).length ? c.emphasis : undefined;
    const focus = emphasis ? findPhrase(tokens, emphasis) : [];
    const beats = [...score.beats];
    if (focus.length && capWord !== undefined && !beats.some((b) => b.cue === 'emphasis')) {
      const w = capWord + (focus[0] as number);
      if (ctx.words && w < ctx.words.length) beats.push({ cue: 'emphasis', word: w });
    }
    const st = stage(ctx, { cues: this.cues, anchors: beats, centre: true, decorJuice: false });
    const L = layoutPhoto(variant, ctx.format, ctx.height, st.safe, {
      kicker: Boolean(c.kicker),
      words: tokens.length,
    });
    const kicker =
      L.kicker && c.kicker ? st.text('kicker', c.kicker, L.kicker, { role: 'eyebrow' }) : null;
    const line = st.text('caption', c.caption.trim(), L.caption, {
      role: 'display',
      byWord: true,
      focal: true,
      balance: true,
      ...(emphasis ? { emphasis } : {}),
    });
    st.restack([kicker, line], L.area);
    const carried = [kicker, line].filter((a): a is Actor => a !== null);
    const label =
      variant === 'label'
        ? st.surface('label', 'label', carried, { pad: { x: 0.04, y: 0.035 } })
        : null;
    if (label) st.on('caption', enter(label, 'slam'));
    if (kicker) st.on('kicker', enter(kicker));
    st.on('caption', enter(line));
    if (focus.length) st.on('emphasis', mark(line, 'emphasis'));
    return st.compile();
  },
});
