import type { Word } from '@motionpop/schemas';

/** One word chunk as returned by transformers.js with `return_timestamps: "word"` (seconds; end can be null). */
export interface WhisperChunk {
  text: string;
  timestamp: readonly [number | null, number | null];
}

const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'erm', 'er', 'ah', 'hmm', 'mm', 'mhm']);

/** True for a lone hesitation sound. Context-dependent fillers ("like", "you know") are spec 05's job. */
export function isFiller(text: string): boolean {
  return FILLERS.has(
    text
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .trim(),
  );
}

/**
 * Whisper word chunks (float seconds) → our `Word[]` (integer ms).
 * Guarantees: indices are 0..n-1, every time is within [0, durationMs],
 * `endMs >= startMs`, and start times never go backwards.
 */
export function chunksToWords(chunks: readonly WhisperChunk[], durationMs: number): Word[] {
  const dur = Math.max(0, Math.round(durationMs));
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

  const words: Word[] = [];
  let prevStart = 0;
  let prevEnd = 0;
  kept.forEach((c, idx) => {
    const nextStart = kept[idx + 1]?.start ?? null;
    let startMs = clamp(c.start ?? prevEnd);
    if (startMs < prevStart) startMs = prevStart;
    let endMs = clamp(c.end ?? nextStart ?? dur);
    if (endMs < startMs) endMs = startMs;
    words.push({
      i: words.length,
      text: c.text,
      startMs,
      endMs,
      // transformers.js does not expose per-word probabilities for Whisper; 1 means "no signal", not "certain".
      conf: 1,
      filler: isFiller(c.text),
    });
    prevStart = startMs;
    prevEnd = endMs;
  });
  return words;
}
