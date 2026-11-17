/**
 * Chunked detection for long transcripts (spec 13b R4.3). The on-device model takes at most
 * `maxWords` words per call, so a long transcript is cut into chunks at sentence ends. A sentence
 * longer than the limit is cut at the limit. Each chunk is detected on its own, and the answers
 * are merged in transcript order. The caller runs the post-pass once on the merged list.
 */

const SENTENCE_END = /[.!?…]["'”’)\]]*$/;

export interface WordRange {
  /** First word index, inclusive. */
  start: number;
  /** One past the last word index. */
  end: number;
}

/**
 * Splits `words` into contiguous ranges of at most `maxWords` words that cover every word once,
 * in order. Ranges end at sentence ends where the limit allows.
 */
export function chunkRanges(words: readonly { text: string }[], maxWords: number): WordRange[] {
  if (!Number.isInteger(maxWords) || maxWords < 1) {
    throw new RangeError('maxWords must be a positive integer');
  }
  const sentences: WordRange[] = [];
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const text = words[i]?.text ?? '';
    if (SENTENCE_END.test(text) || i === words.length - 1) {
      sentences.push({ start, end: i + 1 });
      start = i + 1;
    }
  }

  const out: WordRange[] = [];
  let current: WordRange | null = null;
  for (const sentence of sentences) {
    let from = sentence.start;
    // A sentence longer than the limit is cut into limit-sized pieces of its own.
    while (sentence.end - from > maxWords) {
      if (current) {
        out.push(current);
        current = null;
      }
      out.push({ start: from, end: from + maxWords });
      from += maxWords;
    }
    const length = sentence.end - from;
    if (current && current.end - current.start + length > maxWords) {
      out.push(current);
      current = null;
    }
    if (current) {
      current.end = sentence.end;
    } else {
      current = { start: from, end: sentence.end };
    }
  }
  if (current) out.push(current);
  return out;
}

/** A detected slot with word indices (`wordEnd` inclusive, as in the detectors). */
export interface IndexedSlot {
  wordStart: number;
  wordEnd: number;
}

/**
 * Runs `run` on each chunk and merges the answers in transcript order. `run` receives the chunk's
 * words and the index of its first word, and answers with indices relative to the chunk. Those
 * are shifted to transcript indices here. Answers that fall outside their chunk are dropped.
 * A thrown error from `run` stops the whole detection (the caller decides the fallback).
 */
export async function detectInChunks<T extends { text: string }, S extends IndexedSlot>(
  words: readonly T[],
  maxWords: number,
  run: (chunk: readonly T[], offset: number) => Promise<readonly S[]>,
): Promise<S[]> {
  const merged: S[] = [];
  for (const range of chunkRanges(words, maxWords)) {
    const chunk = words.slice(range.start, range.end);
    const answers = await run(chunk, range.start);
    for (const s of answers) {
      if (s.wordStart < 0 || s.wordEnd < s.wordStart || s.wordEnd >= chunk.length) continue;
      merged.push({
        ...s,
        wordStart: s.wordStart + range.start,
        wordEnd: s.wordEnd + range.start,
      });
    }
  }
  return merged;
}
