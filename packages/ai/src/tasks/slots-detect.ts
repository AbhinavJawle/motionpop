import { z } from 'zod';
import {
  APP_CONFIG_DEFAULTS,
  SlotSuggestionSchema,
  costOf,
  type SlotSuggestion,
} from '@motionpop/schemas';
import { SLOTS_DETECT_SYSTEM_V1, slotsDetectPromptV1 } from '../prompts/slots-detect.v1';
import type { Router, RunResult, TaskDef } from '../router';
import {
  DETECT_CATALOGUE,
  detectWorksWith,
  isDetectable,
  SKILLS,
  skillEntry,
  skillWorksWith,
} from '../slots/catalogue';
import { detectLocal, sceneDraft, slotBudget } from '../slots/detect-local';
import { detectInChunks } from '../slots/chunk-detect';
import type { SlotWord, TaggedSpan } from '../slots/types';

const CandidateSchema = z.object({
  wordStart: z.number().int().nonnegative(),
  wordEnd: z.number().int().nonnegative(),
  kind: z.enum(['number', 'year', 'place', 'name', 'comparison', 'list']),
  text: z.string(),
  value: z.number().optional(),
  unit: z.string().optional(),
  fromValue: z.number().optional(),
  items: z.number().optional(),
});

export const SlotsDetectInputSchema = z.object({
  words: z.array(z.tuple([z.number().int(), z.string(), z.number().int(), z.number().int()])),
  candidates: z.array(CandidateSchema),
  components: z.array(z.object({ id: z.string(), useWhen: z.string(), built: z.boolean() })),
  skills: z.array(
    z.object({ id: z.string(), useWhen: z.string(), worksWith: z.array(z.string()) }),
  ),
  maxSlots: z.number().int().positive(),
  language: z.string().min(2),
});
export type SlotsDetectInput = z.infer<typeof SlotsDetectInputSchema>;

/** Wrapped in an object: some structured-output backends reject a top-level array. */
export const SlotsDetectOutputSchema = z.object({ slots: z.array(SlotSuggestionSchema) });
export type SlotsDetectOutput = z.infer<typeof SlotsDetectOutputSchema>;

/** Cloud cost: 1 credit per 200 words, at least 1 (ai-tasks.md §1). */
export const slotsDetectCost = (wordCount: number): number =>
  costOf('slots-detect', Math.max(1, Math.ceil(wordCount / 200)), APP_CONFIG_DEFAULTS);

/**
 * `slots.detect`: on-device up to the configured word limit (400), cloud above. No automatic
 * cloud escalation from the device route: the caller falls back to `detectLocal` (R2.3).
 */
export const slotsDetect: TaskDef<SlotsDetectInput, SlotsDetectOutput> = {
  id: 'slots.detect',
  maxOutputTokens: 4096,
  // Cached per input (spec 13b R4.1); the prompt text is version v1.
  cacheable: true,
  promptVersion: 'v1',
  input: SlotsDetectInputSchema,
  output: SlotsDetectOutputSchema,
  mode: (input, cfg) =>
    input.words.length <= cfg.routingSlotsDetectDeviceMaxWords
      ? 'PREFER_ON_DEVICE'
      : 'PREFER_IN_CLOUD',
  model: (cfg) => cfg.modelStrong,
  system: SLOTS_DETECT_SYSTEM_V1,
  prompt: slotsDetectPromptV1,
  cloudCost: (input) => slotsDetectCost(input.words.length),
  cloudFallback: false,
  // Extraction, not reasoning: the default thinking took 12 s on the demo (2026-11-15).
  thinking: 'LOW',
};

/** Compact router input: fillers are left out (indices kept), catalogue and skills from code. */
export function slotsDetectInput(
  words: readonly SlotWord[],
  spans: readonly TaggedSpan[],
  opts: { maxSlots?: number; language?: string } = {},
): SlotsDetectInput {
  return {
    words: words.flatMap((w, i) => (w.filler ? [] : [[i, w.text, w.startMs, w.endMs]])) as [
      number,
      string,
      number,
      number,
    ][],
    candidates: spans.map((s) => ({ ...s })),
    // Scenes first, then the planned components no scene replaces (spec 07 task 27).
    components: DETECT_CATALOGUE.map((c) => ({ id: c.id, useWhen: c.useWhen, built: c.built })),
    skills: SKILLS.map((s) => ({ id: s.id, useWhen: s.useWhen, worksWith: detectWorksWith(s) })),
    maxSlots: Math.max(1, opts.maxSlots ?? slotBudget(words)),
    language: opts.language ?? 'en',
  };
}

/**
 * R2.4: keep only suggestions with a component detection offers (scenes and the components no
 * scene replaces), a skill that works with it, and word indices inside the transcript.
 * Overlaps, gaps and durations are the post-pass's job.
 */
export function keepKnown(slots: readonly SlotSuggestion[], wordCount: number): SlotSuggestion[] {
  return slots.filter((s) => {
    const skill = skillEntry(s.skillId);
    return (
      isDetectable(s.componentId) &&
      skill !== undefined &&
      skillWorksWith(skill, s.componentId) &&
      s.wordStart <= s.wordEnd &&
      s.wordEnd < wordCount
    );
  });
}

export type DetectSlotsResult =
  | { source: 'ai'; slots: SlotSuggestion[]; run: Omit<RunResult<SlotsDetectOutput>, 'output'> }
  | { source: 'local'; slots: SlotSuggestion[]; error?: string };

export interface DetectSlotsOptions {
  maxSlots?: number;
  language?: string;
  /** The on-device model is available (the caller knows; the router does not). */
  deviceReady?: boolean;
  /** Longest transcript the device takes in one call (`routingSlotsDetectDeviceMaxWords`). */
  deviceMaxWords?: number;
}

/** Input for one chunk: its words and spans, with indices relative to the chunk. */
function chunkInput(
  chunk: readonly SlotWord[],
  offset: number,
  spans: readonly TaggedSpan[],
  opts: DetectSlotsOptions,
): SlotsDetectInput {
  const end = offset + chunk.length;
  const chunkSpans = spans
    .filter((s) => s.wordStart >= offset && s.wordEnd < end)
    .map((s) => ({ ...s, wordStart: s.wordStart - offset, wordEnd: s.wordEnd - offset }));
  return slotsDetectInput(chunk, chunkSpans, {
    maxSlots: slotBudget(chunk),
    ...(opts.language === undefined ? {} : { language: opts.language }),
  });
}

/** One chunk on the device, with one retry (spec 13b R4.3: a chunk that fails twice ends the chunks). */
async function runChunk(
  router: Router,
  input: SlotsDetectInput,
): Promise<RunResult<SlotsDetectOutput>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await router.run(slotsDetect, input, { mode: 'ONLY_ON_DEVICE' });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * The long transcript on the device, in chunks (spec 13b R4.3). Null when chunking does not apply:
 * the device isn't ready, or the transcript fits in one call. Throws when a chunk fails twice.
 */
async function detectOnDeviceInChunks(
  router: Router,
  words: readonly SlotWord[],
  spans: readonly TaggedSpan[],
  opts: DetectSlotsOptions,
): Promise<{ slots: SlotSuggestion[]; run: Omit<RunResult<SlotsDetectOutput>, 'output'> } | null> {
  const maxWords = opts.deviceMaxWords ?? APP_CONFIG_DEFAULTS.routingSlotsDetectDeviceMaxWords;
  if (opts.deviceReady !== true || words.length <= maxWords) return null;
  const runs: RunResult<SlotsDetectOutput>[] = [];
  const slots = await detectInChunks(words, maxWords, async (chunk, offset) => {
    const r = await runChunk(router, chunkInput(chunk, offset, spans, opts));
    runs.push(r);
    return r.output.slots;
  });
  const first = runs[0];
  return {
    slots,
    run: {
      ranOn: 'device',
      model: first?.model ?? '',
      costCredits: 0,
      latencyMs: runs.reduce((n, r) => n + r.latencyMs, 0),
      attempts: runs.reduce((n, r) => n + r.attempts, 0),
      cached: runs.length > 0 && runs.every((r) => r.cached),
    },
  };
}

/**
 * R2.2 + R2.3: AI detection through the router when available, else (or on any failure, or when
 * nothing usable comes back) the deterministic detector. Never throws. A transcript longer than the
 * device limit is detected on the device in chunks when the device is ready (spec 13b R4.3); if a
 * chunk fails twice, the whole transcript goes to the cloud as before.
 */
export async function detectSlots(
  router: Router | null,
  words: readonly SlotWord[],
  spans: readonly TaggedSpan[],
  opts: DetectSlotsOptions = {},
): Promise<DetectSlotsResult> {
  const local = (error?: string): DetectSlotsResult => ({
    source: 'local',
    slots: detectLocal(
      words,
      spans,
      opts.maxSlots === undefined ? {} : { maxSlots: opts.maxSlots },
    ),
    ...(error === undefined ? {} : { error }),
  });
  if (!router || words.length === 0) return local();
  try {
    let found = await detectOnDeviceInChunks(router, words, spans, opts).catch(() => null);
    if (!found) {
      const { output, ...run } = await router.run(
        slotsDetect,
        slotsDetectInput(words, spans, opts),
      );
      found = { slots: output.slots, run };
    }
    // Scene params are written by code from the words (sceneDraft), never taken from the model.
    const slots = keepKnown(found.slots, words.length).flatMap((s) => {
      const d = sceneDraft(s, words, spans);
      return d ? [d] : [];
    });
    return slots.length > 0
      ? { source: 'ai', slots, run: found.run }
      : local('no usable AI suggestions');
  } catch (err) {
    return local(err instanceof Error ? err.message : String(err));
  }
}
