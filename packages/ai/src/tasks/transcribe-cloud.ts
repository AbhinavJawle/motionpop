import { z } from 'zod';
import type { Transcript, Word } from '@motionpop/schemas';
import {
  TRANSCRIBE_CLOUD_SYSTEM_V1,
  transcribeCloudPromptV1,
} from '../prompts/transcribe-cloud.v1';
import type { MediaMimeType, TaskDef } from '../router';

const AUDIO_MIME_TYPES = [
  'audio/wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'audio/ogg',
] as const satisfies readonly MediaMimeType[];

export const TranscribeCloudInputSchema = z.object({
  audio: z.object({ mimeType: z.enum(AUDIO_MIME_TYPES), base64: z.string().min(1) }),
  durationMs: z.number().int().positive(),
  language: z.string().min(2).optional(),
});
export type TranscribeCloudInput = z.infer<typeof TranscribeCloudInputSchema>;

export const TranscribeCloudOutputSchema = z.object({
  words: z.array(
    z.object({
      text: z.string().min(1),
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().nonnegative(),
      conf: z.number().min(0).max(1),
    }),
  ),
});
export type TranscribeCloudOutput = z.infer<typeof TranscribeCloudOutputSchema>;

/** 1 credit per started minute, at least 1 (ai-tasks.md cost table). */
export function transcribeCloudCost(durationMs: number): number {
  return Math.max(1, Math.ceil(durationMs / 60_000));
}

/** Slack for a model that rounds the last word's end a little past the real duration. */
const END_SLACK_MS = 500;
/** Audio at or under this length may legitimately have no words. */
const SILENT_MAX_MS = 2000;

/** Semantic check for the router: a non-null message triggers the repair prompt. */
export function checkTranscription(out: TranscribeCloudOutput, input: TranscribeCloudInput) {
  const { words } = out;
  if (words.length === 0) {
    return input.durationMs > SILENT_MAX_MS
      ? 'the word list is empty but the audio is longer than 2 seconds; transcribe the speech'
      : null;
  }
  const limit = input.durationMs + END_SLACK_MS;
  let prevEnd = 0;
  for (const [i, w] of words.entries()) {
    if (w.startMs >= w.endMs) return `word ${i} ("${w.text}") has startMs >= endMs`;
    if (w.endMs > limit) {
      return `word ${i} ("${w.text}") ends at ${w.endMs} ms, beyond the audio duration of ${input.durationMs} ms`;
    }
    if (w.startMs < prevEnd) {
      return `word ${i} ("${w.text}") starts at ${w.startMs} ms, before the previous word ends at ${prevEnd} ms; words must be in order and not overlap`;
    }
    prevEnd = w.endMs;
  }
  return null;
}

/**
 * `transcribe.cloud`: Gemini audio understanding through Firebase AI Logic. Cloud only (Nano takes
 * no audio), no fallback. 1 credit per started minute (R2.5, ai-tasks.md §9).
 * Thinking 'LOW': transcription is extraction, not reasoning; the Gemini docs don't ask for more
 * for audio timestamps. If timings come back coarse, `toTranscript` marks them `approx`.
 */
export const transcribeCloud: TaskDef<TranscribeCloudInput, TranscribeCloudOutput> = {
  id: 'transcribe.cloud',
  input: TranscribeCloudInputSchema,
  output: TranscribeCloudOutputSchema,
  mode: () => 'ONLY_IN_CLOUD',
  model: (cfg) => cfg.modelFast,
  system: TRANSCRIBE_CLOUD_SYSTEM_V1,
  prompt: transcribeCloudPromptV1,
  cloudCost: (input) => transcribeCloudCost(input.durationMs),
  cloudFallback: false,
  thinking: 'LOW',
  check: checkTranscription,
  media: (input) => input.audio,
};

/**
 * Hesitation sounds only. Mirrors `isFiller` in apps/web/lib/transcribe/whisper-chunks.ts, which
 * this package must not import; keep the two lists in step.
 */
const FILLERS = new Set([
  'um',
  'umm',
  'uh',
  'uhh',
  'erm',
  'er',
  'ah',
  'hmm',
  'mm',
  'mhm',
  'uhm',
  'ehm',
  'err',
  'hm',
  'hmmm',
  'mmm',
  'ahh',
]);
export const isFillerWord = (text: string): boolean =>
  FILLERS.has(text.toLowerCase().replace(/[^a-z]/g, ''));

/**
 * Timings are "coarse" (`approx`) when any of these holds, over words with the clamped times:
 * 1. at least 50 % of word durations are multiples of 500 ms (the model rounded to half seconds);
 * 2. the median word duration is above 1500 ms (sentence-level spans spread over words);
 * 3. the audio is longer than 5 s and has fewer than 0.5 words per second (words were skipped).
 * Real speech has 150 to 300 ms words at 2 to 4 words per second, so none of these fire on it.
 * Rule 1 needs at least 4 words so one lucky 500 ms word doesn't decide.
 */
export function hasCoarseTimings(
  words: readonly { startMs: number; endMs: number }[],
  durationMs: number,
): boolean {
  if (words.length === 0) return false;
  const durations = words.map((w) => w.endMs - w.startMs);
  if (words.length >= 4) {
    const rounded = durations.filter((d) => d > 0 && d % 500 === 0).length;
    if (rounded / words.length >= 0.5) return true;
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  if (median > 1500) return true;
  return durationMs > 5000 && words.length / (durationMs / 1000) < 0.5;
}

/**
 * Checked output → schemas `Transcript`. Pure. Times are clamped into [0, durationMs]; a word
 * never ends before it starts and never starts before the previous one ends (the router check
 * already guarantees order, the clamp keeps it true after clamping).
 */
export function toTranscript(
  output: TranscribeCloudOutput,
  opts: { durationMs: number; language: string },
): Transcript {
  const { durationMs } = opts;
  let prevEnd = 0;
  const words: Word[] = output.words.map((w, i) => {
    const startMs = Math.min(Math.max(w.startMs, prevEnd), durationMs);
    const endMs = Math.min(Math.max(w.endMs, startMs), durationMs);
    prevEnd = endMs;
    return { i, text: w.text, startMs, endMs, conf: w.conf, filler: isFillerWord(w.text) };
  });
  return {
    words,
    language: opts.language,
    ranOn: 'cloud',
    timingQuality: hasCoarseTimings(words, durationMs) ? 'approx' : 'word',
    cleaned: false,
  };
}
