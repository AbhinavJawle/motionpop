// Reel engine (spec 25): caption chunking (pure, shared by the runtime and tests) and the
// caption painter. Mono: black seam labels, 2 words, uppercase. Cream: 1–2 bold words.
import type { ReelLook, ReelWord } from '@motionpop/schemas';

export interface CaptionChunk {
  text: string;
  startMs: number;
  endMs: number;
}

const ENDS = /[.!?;:,…]$/;

/** Cleans a word for display: trims punctuation (keeps ? and !), applies the look's casing. */
function display(word: string, look: ReelLook, sentenceStart: boolean): string {
  let w = word.replace(/^["'“‘(]+/, '').replace(/[.,;:…"'”’)]+$/, '');
  if (look === 'mono') return w.toUpperCase();
  // Cream speaks in lowercase like the reference reels; keep "I", acronyms and mid-sentence names.
  if (sentenceStart && /^[A-Z][a-z]/.test(w) && !/^I('|$)/.test(w))
    w = w[0]!.toLowerCase() + w.slice(1);
  return w;
}

export function chunkCaptions(words: readonly ReelWord[], look: ReelLook): CaptionChunk[] {
  const maxWords = 2;
  const maxChars = look === 'mono' ? 16 : 13;
  const out: { words: string[]; startMs: number; endMs: number }[] = [];
  let cur: { words: string[]; startMs: number; endMs: number } | null = null;
  let sentenceStart = true;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const text = display(w.text.trim(), look, sentenceStart);
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
    return { text: c.words.join(' '), startMs: c.startMs, endMs: Math.max(end, c.startMs + 120) };
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
