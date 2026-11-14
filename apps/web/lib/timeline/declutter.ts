import type { Word } from '@motionpop/schemas';
import { msToX, type View } from './geometry';

/** Rough Geist 13 px advance per character, for tests and before fonts can be measured. */
export const WORD_CHAR_PX = 6;
const MIN_GAP_PX = 4;

export type MeasureText = (text: string) => number;
export const estimateText: MeasureText = (text) => text.length * WORD_CHAR_PX;

/**
 * Words that can be drawn at this zoom without overlapping (spec 04 NFR, long voiceovers):
 * greedy left to right, a word is kept when it starts after the previous kept word's
 * end (measured in the browser, estimated otherwise). At normal zoom every word is kept; zoomed out, a readable sample remains.
 */
export function declutterWords(
  words: ReadonlyArray<Word>,
  view: View,
  measure: MeasureText = estimateText,
): Word[] {
  const kept: Word[] = [];
  let freeFrom = -Infinity;
  for (const w of words) {
    const x = msToX(w.startMs, view);
    if (x < freeFrom) continue;
    kept.push(w);
    freeFrom = x + measure(w.text) + MIN_GAP_PX;
  }
  return kept;
}
