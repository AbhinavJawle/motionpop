import { rngFor } from '@motionpop/motion';
import { EditorProjectSchema, type EditorProject, type Slot, type Word } from '@motionpop/schemas';

/**
 * The performance project behind `/editor/perf` (spec 04 NFR): 3,000 words and 50 slots, about
 * 16 minutes. Deterministic (seeded), so timings in the E2E perf test are comparable run to run.
 * The voice is synthesized at a low sample rate to keep the WAV small.
 */

export const PERF_PROJECT_ID = 'perf';
export const PERF_VOICE_SRC = 'synth:perf';
export const PERF_WORDS = 3000;
export const PERF_SLOTS = 50;

const WORD_MS = 320;
const SLOT_WORDS = 12; // ≈ 3.8 s, inside every component's limits
const VOCAB = [
  'the',
  'market',
  'grew',
  'fast',
  'and',
  'then',
  'prices',
  'fell',
  'across',
  'every',
  'region',
  'while',
  'demand',
  'kept',
  'rising',
  'so',
  'we',
  'looked',
  'at',
  'why',
];

export function perfProject(now = 0): EditorProject {
  const rng = rngFor(7, 'perf-fixture');
  const words: Word[] = Array.from({ length: PERF_WORDS }, (_, i) => {
    const startMs = i * WORD_MS;
    const n = Math.floor(rng() * VOCAB.length);
    const text = i % 97 === 0 ? `${10 + (i % 90)}%` : (VOCAB[n] ?? 'the');
    return {
      i,
      text,
      startMs,
      endMs: startMs + 200 + Math.floor(rng() * 80),
      conf: 0.95,
      filler: false,
    };
  });
  const durationMs = PERF_WORDS * WORD_MS + 1000;

  const every = Math.floor(PERF_WORDS / PERF_SLOTS);
  const slots: Slot[] = Array.from({ length: PERF_SLOTS }, (_, k) => {
    const wordStart = k * every + 2;
    const wordEnd = wordStart + SLOT_WORDS - 1;
    const ready = k % 2 === 0;
    return {
      id: `perf-${k + 1}`,
      startMs: words[wordStart]?.startMs ?? 0,
      endMs: words[wordEnd]?.endMs ?? 0,
      wordStart,
      wordEnd,
      reason: `Perf slot ${k + 1}`,
      componentId: ready ? 'big-number' : 'title-card',
      skillId: 'manual',
      prompt: '',
      params: ready ? { value: k + 1, suffix: '%', label: `Slot ${k + 1}` } : {},
      status: ready ? 'ready' : 'suggested',
      notes: [],
    };
  });

  return EditorProjectSchema.parse({
    schemaVersion: 1,
    id: PERF_PROJECT_ID,
    title: 'Performance check',
    format: '16:9',
    fps: 30,
    styleId: 'editorial-explainer',
    durationMs,
    voiceover: { src: PERF_VOICE_SRC, durationMs },
    transcript: { words, language: 'en', ranOn: 'device', timingQuality: 'word', cleaned: true },
    slots,
    versions: [],
    createdAt: now,
    updatedAt: now,
  });
}
