import type { EditorProject, Slot } from '@motionpop/schemas';
import { limitsFor } from './constraints';
import { wordsInRange } from './invariants';

/**
 * A suggested slot spanning words `a..b` (either order), for shift-drag "Add graphic here"
 * (spec 04 R6.2). Starts on the first word's start and ends on the last word's end, widened
 * to the minimum duration where the neighbours allow it. Returns null when it can't fit.
 */
export function slotForWords(
  project: EditorProject,
  a: number,
  b: number,
  id: string,
): Slot | null {
  const words = project.transcript.words;
  const i0 = Math.max(0, Math.min(a, b));
  const i1 = Math.min(words.length - 1, Math.max(a, b));
  const first = words[i0];
  const last = words[i1];
  if (!first || !last) return null;

  // Free gap around the words.
  let gapStart = 0;
  let gapEnd = project.durationMs;
  for (const s of project.slots) {
    if (s.endMs <= first.startMs) gapStart = Math.max(gapStart, s.endMs);
    else if (s.startMs >= last.endMs) gapEnd = Math.min(gapEnd, s.startMs);
    else return null; // the words are already covered by a slot
  }

  const spoken = words
    .slice(i0, i1 + 1)
    .map((w) => w.text)
    .join(' ');
  const wantsNumber = /\d|percent|million|billion|thousand|hundred/i.test(spoken);
  // A number gets a big number if its limits fit the gap; otherwise a title card (global limits).
  const candidates = wantsNumber ? ['big-number', 'title-card'] : ['title-card'];

  for (const componentId of candidates) {
    const { minMs, maxMs } = limitsFor(componentId);
    let startMs = first.startMs;
    let endMs = last.endMs;
    if (endMs - startMs < minMs) endMs = Math.min(gapEnd, startMs + minMs);
    if (endMs - startMs < minMs) startMs = Math.max(gapStart, endMs - minMs);
    if (endMs - startMs < minMs) continue;
    if (endMs - startMs > maxMs) endMs = startMs + maxMs;

    const range = wordsInRange(words, startMs, endMs) ?? { wordStart: i0, wordEnd: i1 };
    const said = words
      .slice(range.wordStart, range.wordEnd + 1)
      .map((w) => w.text)
      .join(' ')
      .replace(/[.,!?;:]+$/, '');
    return {
      id,
      startMs,
      endMs,
      wordStart: range.wordStart,
      wordEnd: range.wordEnd,
      reason: `You said '${said}'`,
      componentId,
      skillId: 'manual',
      prompt: '',
      params: {},
      status: 'suggested',
      notes: [],
    };
  }
  return null;
}
