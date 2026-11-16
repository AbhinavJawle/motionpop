import { StartDraftSchema, type StartDraft, type Word } from '@motionpop/schemas';
import { encodeWav } from '../audio/wav';
import type { HandOffResult } from './hand-off';
import { readDraft, setPending } from './pending';

/** One line, one graphic: long enough for a sentence, short enough to stay one graphic. */
export const SINGLE_MAX_WORDS = 24;
const RATE = 16_000;
const LEAD_MS = 400;
const TAIL_MS = 1_800;
const MIN_MS = 4_000;

/** The words span at least this long: every scene a line can become fits (map-zoom needs 3.5 s). */
const MIN_SPAN_MS = 4_000;

/**
 * Timings for a typed line, as if read at an easy pace: longer words take longer, with a small
 * gap between words. A short line is spread to `MIN_SPAN_MS`, since a slot can't outlast its
 * words. The graphic lands on these words exactly as it would on spoken ones.
 */
export function singleWords(line: string): Word[] {
  const texts = line.trim().split(/\s+/).filter(Boolean).slice(0, SINGLE_MAX_WORDS);
  let t = 0;
  const raw = texts.map((text) => {
    const len = Math.min(600, 200 + 45 * text.length);
    const span = { text, start: t, end: t + len };
    t += len + 70;
    return span;
  });
  const natural = raw.length ? raw[raw.length - 1]!.end : 0;
  const k = natural > 0 && natural < MIN_SPAN_MS ? MIN_SPAN_MS / natural : 1;
  return raw.map((r, i) => ({
    i,
    text: r.text,
    startMs: LEAD_MS + Math.round(r.start * k),
    endMs: LEAD_MS + Math.round(r.end * k),
    conf: 1,
    filler: false,
  }));
}

/** How long the silent track runs for these words. */
export function singleDurationMs(words: readonly Word[]): number {
  const last = words[words.length - 1];
  return Math.max(MIN_MS, (last?.endMs ?? 0) + TAIL_MS);
}

/**
 * "Or just make a single graphic": the typed line becomes a short project with one graphic on a
 * silent track (no voice, no captions), through the same Processing as a voiceover. The line
 * titles the project.
 */
export async function handOffSingle(
  line: string,
  draft: StartDraft = readDraft(),
): Promise<HandOffResult> {
  const words = singleWords(line);
  if (words.length === 0) return { ok: false, message: 'Type a line for the graphic first.' };
  const samples = new Float32Array(Math.round((singleDurationMs(words) * RATE) / 1000));
  const file = new Blob([encodeWav(samples, RATE)], { type: 'audio/wav' });
  const title = words
    .map((w) => w.text)
    .join(' ')
    .slice(0, 80);
  try {
    await setPending(
      file,
      { source: 'upload', name: 'Single graphic.wav', cleanup: false, single: true, words },
      StartDraftSchema.parse({ ...draft, title }),
    );
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't start the graphic in this browser. Try again." };
  }
}
