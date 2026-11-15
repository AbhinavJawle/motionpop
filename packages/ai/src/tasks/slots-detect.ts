import { z } from 'zod';
import { SlotSuggestionSchema, type SlotSuggestion } from '@motionpop/schemas';
import { SLOTS_DETECT_SYSTEM_V1, slotsDetectPromptV1 } from '../prompts/slots-detect.v1';
import type { Router, RunResult, TaskDef } from '../router';
import { CATALOGUE, catalogueEntry, SKILLS, skillEntry } from '../slots/catalogue';
import { detectLocal, slotBudget } from '../slots/detect-local';
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
  Math.max(1, Math.ceil(wordCount / 200));

/**
 * `slots.detect`: on-device up to the configured word limit (400), cloud above. No automatic
 * cloud escalation from the device route: the caller falls back to `detectLocal` (R2.3).
 */
export const slotsDetect: TaskDef<SlotsDetectInput, SlotsDetectOutput> = {
  id: 'slots.detect',
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
    components: CATALOGUE.map((c) => ({ id: c.id, useWhen: c.useWhen, built: c.built })),
    skills: SKILLS.map((s) => ({ id: s.id, useWhen: s.useWhen, worksWith: [...s.worksWith] })),
    maxSlots: Math.max(1, opts.maxSlots ?? slotBudget(words)),
    language: opts.language ?? 'en',
  };
}

/**
 * R2.4: keep only suggestions with a catalogue component, a skill that works with it, and word
 * indices inside the transcript. Overlaps, gaps and durations are the post-pass's job.
 */
export function keepKnown(slots: readonly SlotSuggestion[], wordCount: number): SlotSuggestion[] {
  return slots.filter((s) => {
    const skill = skillEntry(s.skillId);
    return (
      catalogueEntry(s.componentId) !== undefined &&
      skill !== undefined &&
      skill.worksWith.includes(s.componentId) &&
      s.wordEnd < wordCount
    );
  });
}

export type DetectSlotsResult =
  | { source: 'ai'; slots: SlotSuggestion[]; run: Omit<RunResult<SlotsDetectOutput>, 'output'> }
  | { source: 'local'; slots: SlotSuggestion[]; error?: string };

/**
 * R2.2 + R2.3: AI detection through the router when available, else (or on any failure, or when
 * nothing usable comes back) the deterministic detector. Never throws.
 */
export async function detectSlots(
  router: Router | null,
  words: readonly SlotWord[],
  spans: readonly TaggedSpan[],
  opts: { maxSlots?: number; language?: string } = {},
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
    const { output, ...run } = await router.run(slotsDetect, slotsDetectInput(words, spans, opts));
    const slots = keepKnown(output.slots, words.length);
    return slots.length > 0 ? { source: 'ai', slots, run } : local('no usable AI suggestions');
  } catch (err) {
    return local(err instanceof Error ? err.message : String(err));
  }
}
