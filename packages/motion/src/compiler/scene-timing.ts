import type { CompileSlot } from './types';

/** What `sceneTiming` reads from a slot and its transcript (subsets of the project schemas). */
export interface TimedSlot {
  startMs: number;
  endMs: number;
  wordStart: number;
  /** Inclusive. */
  wordEnd: number;
}
export interface TimedTranscript {
  words: readonly { text: string; startMs: number; endMs: number }[];
  prosody?:
    | {
        stress: readonly number[];
        pauses: readonly { startMs: number; endMs: number }[];
      }
    | undefined;
}

/**
 * A scene's view of the voice (spec 07 task 27): the slot's words with times relative to the
 * slot start, their stress, and the pauses inside the slot. Word `k` here is the beat index `k`
 * of the slot's score. Preview, gates and render all build it here, so a scene is timed the same
 * everywhere. Times are clamped into the slot; integer ms. Pure.
 */
export function sceneTiming(
  slot: TimedSlot,
  transcript: TimedTranscript,
): Pick<CompileSlot, 'words' | 'stress' | 'pauses'> & { text: string[] } {
  const len = slot.endMs - slot.startMs;
  const clamp = (ms: number) => Math.min(len, Math.max(0, Math.round(ms - slot.startMs)));
  const picked = transcript.words.slice(slot.wordStart, slot.wordEnd + 1);
  const words = picked.map((w) => {
    const startMs = clamp(w.startMs);
    return { startMs, endMs: Math.max(startMs, clamp(w.endMs)) };
  });
  const stress = transcript.prosody?.stress.slice(slot.wordStart, slot.wordEnd + 1);
  const pauses = transcript.prosody?.pauses
    .filter((p) => p.endMs > slot.startMs && p.startMs < slot.endMs)
    .map((p) => ({ startMs: clamp(p.startMs), endMs: clamp(p.endMs) }))
    .filter((p) => p.endMs > p.startMs);
  return {
    text: picked.map((w) => w.text),
    words,
    ...(stress && stress.length === words.length ? { stress: [...stress] } : {}),
    ...(pauses ? { pauses } : {}),
  };
}
