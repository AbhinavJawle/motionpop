// Reel engine (spec 25): caption chunking (pure, shared by the runtime and tests) and the
// caption painter. Mono: black seam labels, 2 words, uppercase. Cream: 1–2 bold words.
// Spec 39 R5.2: five selectable styles; absent = the look's own (seam for mono, pop for cream).
import type { ReelCaptionStyle, ReelLook, ReelWord } from '@motionpop/schemas';

type Casing = 'upper' | 'lower-sentence' | 'sentence';

/** Chunk limits and casing per caption style (9:16: 1–3 words a line, ai-tasks.md). */
export const CAPTION_STYLES: Readonly<
  Record<ReelCaptionStyle, { maxWords: number; maxChars: number; casing: Casing }>
> = {
  seam: { maxWords: 2, maxChars: 16, casing: 'upper' },
  pop: { maxWords: 2, maxChars: 13, casing: 'lower-sentence' },
  editorial: { maxWords: 3, maxChars: 20, casing: 'sentence' },
  boxed: { maxWords: 2, maxChars: 14, casing: 'upper' },
  clean: { maxWords: 3, maxChars: 22, casing: 'sentence' },
};

/** The style a plan without `captionStyle` draws (stored reels keep their exact captions). */
export function captionStyleOf(look: ReelLook, style?: ReelCaptionStyle): ReelCaptionStyle {
  return style ?? (look === 'mono' ? 'seam' : 'pop');
}

export interface CaptionChunk {
  text: string;
  startMs: number;
  endMs: number;
}

const ENDS = /[.!?;:,…]$/;

/** Cleans a word for display: trims punctuation (keeps ? and !), applies the style's casing. */
function display(word: string, casing: Casing, sentenceStart: boolean): string {
  let w = word.replace(/^["'“‘(]+/, '').replace(/[.,;:…"'”’)]+$/, '');
  if (casing === 'upper') return w.toUpperCase();
  if (casing === 'sentence') return w;
  // Cream speaks in lowercase like the reference reels; keep "I", acronyms and mid-sentence names.
  if (sentenceStart && /^[A-Z][a-z]/.test(w) && !/^I('|$)/.test(w))
    w = w[0]!.toLowerCase() + w.slice(1);
  return w;
}

export function chunkCaptions(
  words: readonly ReelWord[],
  look: ReelLook,
  style?: ReelCaptionStyle,
): CaptionChunk[] {
  const { maxWords, maxChars, casing } = CAPTION_STYLES[captionStyleOf(look, style)];
  const out: { words: string[]; startMs: number; endMs: number }[] = [];
  let cur: { words: string[]; startMs: number; endMs: number } | null = null;
  let sentenceStart = true;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const text = display(w.text.trim(), casing, sentenceStart);
    sentenceStart = /[.!?]$/.test(w.text.trim());
    if (!text) continue;
    const prev = words[i - 1];
    const gap = prev ? w.startMs - prev.endMs : 0;
    const len = cur ? cur.words.join(' ').length + 1 + text.length : text.length;
    const breakHere =
      !cur ||
      cur.words.length >= maxWords ||
      len > maxChars ||
      gap > 380 ||
      (prev !== undefined && ENDS.test(prev.text.trim()));
    if (breakHere) {
      cur = { words: [text], startMs: w.startMs, endMs: w.endMs };
      out.push(cur);
    } else if (cur) {
      cur.words.push(text);
      cur.endMs = w.endMs;
    }
  }
  return out.map((c, i) => {
    const next = out[i + 1];
    const end = next ? Math.min(next.startMs, c.endMs + 700) : c.endMs + 700;
    // At least 120 ms on screen, but never into the next chunk (very short words would overlap).
    const endMs = Math.max(end, c.startMs + 120);
    return {
      text: c.words.join(' '),
      startMs: c.startMs,
      endMs: next ? Math.min(endMs, next.startMs) : endMs,
    };
  });
}

/** Index of the chunk on screen at `t`, or -1. */
export function chunkAt(chunks: readonly CaptionChunk[], t: number): number {
  let lo = 0;
  let hi = chunks.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chunks[mid]!.startMs <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return -1;
  return t < chunks[found]!.endMs ? found : -1;
}
