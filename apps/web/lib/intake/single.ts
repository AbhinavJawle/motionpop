import { StartDraftSchema, type ReelLook, type StartDraft, type Word } from '@motionpop/schemas';
import { encodeWav } from '../audio/wav';
import type { HandOffResult } from './hand-off';
import { readDraft, setPending } from './pending';

/** Legacy word limit kept for backwards-compatible callers. */
export const SINGLE_MAX_WORDS = 24;
/** Max prompt length when describing a standalone motion graphic. */
export const SINGLE_MAX_CHARS = 500;
const RATE = 16_000;
const LEAD_MS = 400;
const TAIL_MS = 1_800;
const MIN_MS = 4_000;
const DEFAULT_GRAPHIC_MS = 5_000;

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
 * "Or just make a single graphic": the user describes the motion graphic they want in a prompt.
 * Directed with the Reel engine (no video, no voiceover, full alpha WebM export support).
 */
export async function handOffSingle(
  prompt: string,
  draft: StartDraft = readDraft(),
  look: ReelLook = 'mono',
): Promise<HandOffResult> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) return { ok: false, message: 'Describe the motion graphic first.' };
  const words = singleWords(cleanPrompt);
  const samples = new Float32Array(Math.round((DEFAULT_GRAPHIC_MS * RATE) / 1000));
  const file = new Blob([encodeWav(samples, RATE)], { type: 'audio/wav' });
  const title = cleanPrompt.replace(/\s+/g, ' ').slice(0, 80);
  try {
    await setPending(
      file,
      {
        source: 'upload',
        name: 'Motion graphic.wav',
        cleanup: false,
        single: true,
        graphicPrompt: cleanPrompt.slice(0, 1000),
        graphicLook: look,
        words,
      },
      StartDraftSchema.parse({ ...draft, title }),
    );
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't start the graphic in this browser. Try again." };
  }
}
