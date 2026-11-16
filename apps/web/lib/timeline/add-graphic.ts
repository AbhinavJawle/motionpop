import { clauseRanges, sentenceIndex } from '@motionpop/ai';
import type { EditorProject, Slot } from '@motionpop/schemas';
import { templateParams } from '@/lib/slots/template';
import { slotForWords } from './create';

/**
 * A new slot that plays at once: its type from the words (slotForWords), drafted from them like
 * a picked type (templateParams, loose), ready. Falls back to a hook statement when the first
 * choice can't be drafted. Null when nothing fits.
 */
export function draftedSlotForWords(
  project: EditorProject,
  a: number,
  b: number,
  id: string,
  doc?: Document,
): Slot | null {
  const base = slotForWords(project, a, b, id);
  if (!base) return null;
  for (const componentId of [base.componentId, 'hook-statement']) {
    const slot = { ...base, componentId };
    const params = templateParams(project, slot, doc, true);
    if (params) return { ...slot, params, status: 'ready' };
  }
  return base;
}

/** The clause (a sentence, or a piece of a long one) holding word `i`, as a word range. */
function clauseAt(project: EditorProject, i: number): { start: number; end: number } | null {
  const words = project.transcript.words;
  const sentence = sentenceIndex(words);
  const s = sentence[i];
  if (s === undefined) return null;
  let start = i;
  let end = i;
  while (start > 0 && sentence[start - 1] === s) start--;
  while (end < words.length - 1 && sentence[end + 1] === s) end++;
  return (
    clauseRanges(words, { start, end }).find((c) => c.start <= i && i <= c.end) ?? { start, end }
  );
}

/**
 * "Add graphic" (founder 2026-11-16: a visible add button): the clause at the playhead, or the
 * next clause with room when that one already has a graphic, as a drafted slot.
 */
export function slotAtPlayhead(
  project: EditorProject,
  playheadMs: number,
  id: string,
  doc?: Document,
): Slot | null {
  const words = project.transcript.words;
  if (words.length === 0) return null;
  let i = words.findIndex((w) => w.endMs > playheadMs);
  if (i < 0) i = words.length - 1;
  const tried = new Set<number>();
  // Forward from the playhead, then wrap to the start: the first clause with room wins.
  for (let k = 0; k < words.length; k++) {
    const at = (i + k) % words.length;
    const c = clauseAt(project, at);
    if (!c || tried.has(c.start)) continue;
    tried.add(c.start);
    const slot = draftedSlotForWords(project, c.start, c.end, id, doc);
    if (slot) return slot;
  }
  return null;
}
