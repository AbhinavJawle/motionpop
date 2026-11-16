import type { Word } from '@motionpop/schemas';

export interface PanelWord {
  word: Word;
  /** Where the word plays in the active (cleaned) audio; null for a removed filler. */
  atMs: number | null;
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/**
 * The Voice panel's transcript (spec 11 §12): with cleanup on, the original words in order,
 * each kept word paired with its cleaned twin (cleanup only removes words, so the k-th kept
 * original word is cleaned word k) and each removed filler marked. Otherwise the active words.
 */
export function panelWords(
  active: readonly Word[],
  original: readonly Word[] | undefined,
  cleaned: boolean,
): PanelWord[] {
  if (!cleaned || !original || original.length <= active.length) {
    return active.map((word) => ({ word, atMs: word.startMs }));
  }
  const out: PanelWord[] = [];
  let j = 0;
  for (const word of original) {
    const twin = active[j];
    if (twin && norm(twin.text) === norm(word.text)) {
      out.push({ word, atMs: twin.startMs });
      j += 1;
    } else out.push({ word, atMs: null });
  }
  // Words that never matched (an edited transcript): fall back to the active words as they are.
  return j === active.length ? out : active.map((word) => ({ word, atMs: word.startMs }));
}

/** "Interview" → "Interview (take 2)"; "Interview (take 2)" → "Interview (take 3)". */
export function nextTakeTitle(title: string): string {
  const m = /^(.*) \(take (\d+)\)$/.exec(title);
  const next = m ? `${m[1]} (take ${Number(m[2]) + 1})` : `${title} (take 2)`;
  return next.slice(0, 80);
}
