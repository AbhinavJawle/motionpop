/**
 * Shared types for slot detection (spec 06). Word indices are into the cleaned transcript and
 * `wordEnd` is inclusive, like `Slot.wordEnd`.
 */

export type SpanKind = 'number' | 'year' | 'place' | 'name' | 'comparison' | 'list';

import type { SpokenUnit } from './numbers';

/** Units `parseSpokenNumber` can attach: percent, currencies, multiplier. */
export type NumberUnit = SpokenUnit;

export interface TaggedSpan {
  wordStart: number;
  /** Inclusive. */
  wordEnd: number;
  kind: SpanKind;
  /** The exact words of the span joined by spaces, as spoken (punctuation kept). */
  text: string;
  /** Parsed value for `number` and `year` spans (and a comparison's second number). */
  value?: number;
  unit?: NumberUnit;
  /** Comparisons with two numbers ("from 10 to 40"): the first number. */
  fromValue?: number;
  /** Lists: how many items were found. */
  items?: number;
}

/** Minimal word shape the detection modules need (a subset of `Word`). */
export interface SlotWord {
  text: string;
  startMs: number;
  endMs: number;
  filler: boolean;
}
