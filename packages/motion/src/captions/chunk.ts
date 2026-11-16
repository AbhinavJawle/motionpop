import type { Format } from '../contract';

/**
 * Caption grouping (spec 12 R4, design §4.1). Pure and model-free, so the editor preview and the
 * render job compute the same groups from the same transcript (R4.4, R4.5).
 */
export type CaptionPresetId = 'pop' | 'clean' | 'boxed';

export interface CaptionSourceWord {
  text: string;
  startMs: number;
  endMs: number;
  filler: boolean;
}

export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
  emphasis: boolean;
}

export interface CaptionGroup {
  openMs: number;
  closeMs: number;
  words: CaptionWord[];
}

export interface ChunkOptions {
  format: Format;
  presetId: CaptionPresetId;
  /** Prosody stress per source word (0–100), aligned with `words`. */
  stress?: readonly number[];
}

/** Words per group (R4.1): 3 in 9:16, 4 in 1:1, 5 in 16:9; the pop preset is 3 everywhere. */
export function groupLimit(format: Format, presetId: CaptionPresetId): number {
  if (presetId === 'pop' || format === '9:16') return 3;
  return format === '1:1' ? 4 : 5;
}

const PAUSE_BREAK_MS = 150;
const LEAD_MS = 100;
const TAIL_MS = 200;
const MIN_SHOW_MS = 500;
const FIRST_OPEN_MS = 100;

const NUMBER_WORDS = new Set(
  (
    'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen ' +
    'sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety ' +
    'hundred thousand million billion trillion percent half double triple'
  ).split(' '),
);

const bare = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}%$€£.,-]/gu, '');

/** A numeric word: digits, currency, percent, or a spelled-out number. */
export function isNumberWord(text: string): boolean {
  const b = bare(text);
  if (/\d/.test(b)) return true;
  return NUMBER_WORDS.has(b.replace(/[.,-]/g, ''));
}

const endsSentence = (t: string) => /[.?!…]["')\]]*$/.test(t.trim());

/** Indices of runs of number words (a "number span" kept whole when it fits the limit). */
function numberRunEnd(words: readonly CaptionSourceWord[], i: number): number {
  let j = i;
  while (j + 1 < words.length && isNumberWord(words[j + 1]!.text)) j++;
  return j;
}

export function chunkCaptions(
  source: readonly CaptionSourceWord[],
  opts: ChunkOptions,
): CaptionGroup[] {
  const limit = groupLimit(opts.format, opts.presetId);
  const words: { w: CaptionSourceWord; stress: number }[] = [];
  source.forEach((w, i) => {
    if (w.filler || w.text.trim() === '') return;
    words.push({ w, stress: opts.stress?.[i] ?? 0 });
  });

  // 1. Split into raw groups of word indices.
  const raw: number[][] = [];
  let cur: number[] = [];
  const flush = () => {
    if (cur.length) raw.push(cur);
    cur = [];
  };
  const plain = words.map((x) => x.w);
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!.w;
    const prev = i > 0 ? words[i - 1]!.w : null;
    if (prev && (endsSentence(prev.text) || w.startMs - prev.endMs >= PAUSE_BREAK_MS)) flush();
    if (isNumberWord(w.text) && (i === 0 || !isNumberWord(words[i - 1]!.w.text))) {
      const runLen = numberRunEnd(plain, i) - i + 1;
      // A number span that fits a group is never split: break before it instead.
      if (runLen <= limit && cur.length + runLen > limit) flush();
    }
    if (cur.length >= limit) flush();
    cur.push(i);
  }
  flush();

  // 2. Times and emphasis.
  const groups: CaptionGroup[] = [];
  for (let g = 0; g < raw.length; g++) {
    const idx = raw[g]!;
    const first = words[idx[0]!]!.w;
    const last = words[idx[idx.length - 1]!]!.w;
    const prevClose = groups.length ? groups[groups.length - 1]!.closeMs : 0;
    const next = raw[g + 1] ? words[raw[g + 1]![0]!]!.w : null;
    const openMs = Math.max(prevClose, first.startMs - LEAD_MS, FIRST_OPEN_MS);
    const ceiling = next ? next.startMs - LEAD_MS : Number.POSITIVE_INFINITY;
    let closeMs = Math.max(last.endMs, Math.min(last.endMs + TAIL_MS, ceiling));
    if (closeMs - openMs < MIN_SHOW_MS)
      closeMs = Math.max(closeMs, Math.min(openMs + MIN_SHOW_MS, ceiling));
    closeMs = Math.max(closeMs, openMs + 1);

    let emphasis = idx.findIndex((k) => isNumberWord(words[k]!.w.text));
    if (emphasis < 0) {
      let best = -1;
      let bestStress = 70;
      idx.forEach((k, n) => {
        if (words[k]!.stress > bestStress) {
          bestStress = words[k]!.stress;
          best = n;
        }
      });
      emphasis = best;
    }
    groups.push({
      openMs: Math.round(openMs),
      closeMs: Math.round(closeMs),
      words: idx.map((k, n) => {
        const w = words[k]!.w;
        return {
          text: w.text.trim(),
          startMs: w.startMs,
          endMs: w.endMs,
          emphasis: n === emphasis,
        };
      }),
    });
  }
  return groups;
}

/** The group visible at `tMs`, or null (exactly one or none, R4.2). */
export function activeGroup(groups: readonly CaptionGroup[], tMs: number): number {
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    if (tMs >= g.openMs && tMs < g.closeMs) return i;
  }
  return -1;
}
