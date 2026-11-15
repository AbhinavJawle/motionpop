import { isFiller, type Word } from '@motionpop/schemas';

export { isFiller };

/** One word chunk as returned by transformers.js with `return_timestamps: "word"` (seconds; end can be null). */
export interface WhisperChunk {
  text: string;
  timestamp: readonly [number | null, number | null];
}

/** Minimum word length in ms (R2.3). */
export const MIN_WORD_MS = 40;

/**
 * Whisper word chunks (float seconds) → our `Word[]` (integer ms).
 * Guarantees (R2.3): indices are 0..n-1, every time is an integer within [0, durationMs],
 * starts never go backwards, words never overlap (`end <= next start`) and
 * `endMs >= startMs + MIN_WORD_MS`.
 *
 * Starts are pushed forward when a word would otherwise leave the previous one shorter than
 * MIN_WORD_MS, and capped so the remaining words still fit before `durationMs`. Ends are clamped
 * to the next start.
 *
 * If the audio is too short for the word count (`n * MIN_WORD_MS > durationMs`), the minimum
 * cannot hold. The words are then squeezed evenly across [0, durationMs]: contiguous, no overlap,
 * and each shorter than MIN_WORD_MS (zero-length when durationMs is 0).
 */
export function chunksToWords(chunks: readonly WhisperChunk[], durationMs: number): Word[] {
  const dur = Math.max(0, Math.round(Number.isFinite(durationMs) ? durationMs : 0));
  const clamp = (ms: number) => Math.min(dur, Math.max(0, ms));
  const toMs = (s: number | null) =>
    s === null || !Number.isFinite(s) ? null : Math.round(s * 1000);

  // Whisper marks a new word with a leading space; a chunk without one ("%" after " 40") continues the previous word.
  const kept: { text: string; start: number | null; end: number | null }[] = [];
  for (const c of chunks) {
    const text = c.text.trim();
    if (text.length === 0) continue;
    const prev = kept[kept.length - 1];
    const end = toMs(c.timestamp[1]);
    if (prev && !/^\s/.test(c.text)) {
      prev.text += text;
      prev.end = end ?? prev.end;
      continue;
    }
    kept.push({ text, start: toMs(c.timestamp[0]), end });
  }

  const n = kept.length;
  const starts: number[] = [];
  const ends: number[] = [];

  if (n * MIN_WORD_MS > dur) {
    // Too short for the minimum: squeeze evenly.
    for (let i = 0; i < n; i++) {
      starts.push(Math.round((i * dur) / n));
      ends.push(Math.round(((i + 1) * dur) / n));
    }
  } else {
    // Raw, possibly messy times first.
    const rawStarts: number[] = [];
    const rawEnds: number[] = [];
    let prevRawStart = 0;
    let prevRawEnd = 0;
    kept.forEach((c, idx) => {
      const nextStart = kept[idx + 1]?.start ?? null;
      const rs = Math.max(prevRawStart, clamp(c.start ?? prevRawEnd));
      const re = Math.max(rs, clamp(c.end ?? nextStart ?? dur));
      rawStarts.push(rs);
      rawEnds.push(re);
      prevRawStart = rs;
      prevRawEnd = re;
    });
    // Starts: spaced at least MIN_WORD_MS apart, capped so the remaining words still fit.
    for (let i = 0; i < n; i++) {
      const floor = i === 0 ? 0 : starts[i - 1]! + MIN_WORD_MS;
      const cap = dur - (n - i) * MIN_WORD_MS;
      starts.push(Math.min(Math.max(rawStarts[i]!, floor), cap));
    }
    // Ends: at least start + MIN_WORD_MS, at most the next start (or the audio end).
    for (let i = 0; i < n; i++) {
      const limit = i + 1 < n ? starts[i + 1]! : dur;
      ends.push(Math.min(Math.max(rawEnds[i]!, starts[i]! + MIN_WORD_MS), limit));
    }
  }

  return kept.map((c, i) => ({
    i,
    text: c.text,
    startMs: starts[i]!,
    endMs: ends[i]!,
    // transformers.js does not expose per-word probabilities for Whisper; 1 means "no signal", not "certain".
    conf: 1,
    filler: isFiller(c.text),
  }));
}
