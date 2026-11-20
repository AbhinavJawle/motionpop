import { FormatSchema } from '@motionpop/schemas';
import { z } from 'zod';
import {
  FILM_VISION_CRITIC_SYSTEM_V1,
  filmVisionCriticPromptV1,
} from '../prompts/film-vision-critic.v1';
import type { Router, TaskDef } from '../router';

export const VisionCriticBeatMetaSchema = z.object({
  id: z.string().min(1).max(16),
  videoStage: z.string().max(32).optional(),
  archetype: z.string().max(32).optional(),
  text: z.array(z.string().max(100)).max(4).default([]),
});
export type VisionCriticBeatMeta = z.infer<typeof VisionCriticBeatMetaSchema>;

export const FilmVisionCriticInputSchema = z.object({
  format: FormatSchema,
  lookName: z.string().min(1).max(80),
  beats: z.array(VisionCriticBeatMetaSchema).min(1).max(6),
  contactSheetBase64: z.string().min(32),
});
export type FilmVisionCriticInput = z.infer<typeof FilmVisionCriticInputSchema>;

export const VisionFlaggedBeatSchema = z.object({
  beatId: z.string().min(1).max(16),
  severity: z.enum(['fix', 'note']),
  issue: z.string().min(1).max(200),
  fixHint: z.string().min(1).max(260),
});
export type VisionFlaggedBeat = z.infer<typeof VisionFlaggedBeatSchema>;

export const FilmVisionCriticOutputSchema = z.object({
  pass: z.boolean(),
  summary: z.string().min(1).max(240),
  flagged: z.array(VisionFlaggedBeatSchema).max(4),
});
export type FilmVisionCriticOutput = z.infer<typeof FilmVisionCriticOutputSchema>;

/** Clean Vertex-safe JSON Schema for Gemini 4 Neon structured output. */
export function filmVisionCriticJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      pass: { type: 'boolean' },
      summary: { type: 'string' },
      flagged: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            beatId: { type: 'string' },
            severity: { type: 'string', enum: ['fix', 'note'] },
            issue: { type: 'string' },
            fixHint: { type: 'string' },
          },
          required: ['beatId', 'severity', 'issue', 'fixHint'],
        },
      },
    },
    required: ['pass', 'summary', 'flagged'],
  };
}

/**
 * `film.vision-critic` (spec 22 R1.1): single-call multimodal visual QA over a contact sheet of
 * rendered beats using `gemini-4-neon` (`thinking: 'LOW'`).
 */
export function filmVisionCriticTask(): TaskDef<FilmVisionCriticInput, FilmVisionCriticOutput> {
  return {
    id: 'film.vision-critic',
    input: FilmVisionCriticInputSchema,
    output: FilmVisionCriticOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    model: () => 'gemini-3.8-flash',
    system: FILM_VISION_CRITIC_SYSTEM_V1,
    prompt: (i) =>
      filmVisionCriticPromptV1({
        format: i.format,
        lookName: i.lookName,
        beats: i.beats,
      }),
    mediaList: (i) => [{ mimeType: 'image/jpeg' as const, base64: i.contactSheetBase64 }],
    jsonSchema: filmVisionCriticJsonSchema,
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 0,
    thinking: 'LOW',
    maxOutputTokens: 1536,
  };
}

/**
 * Runs the single-call Vision Critic contact-sheet QA pass. Never throws: returns a passing
 * no-op verdict if the router is offline or the call fails, and caps `'fix'` flags to at most 2
 * valid beat ids so post-build polish stays fast and surgical.
 */
export async function critiqueContactSheet(
  router: Router | null,
  input: FilmVisionCriticInput,
  opts?: { model?: string },
): Promise<FilmVisionCriticOutput> {
  if (!router) {
    return { pass: true, summary: 'Vision QA skipped offline', flagged: [] };
  }
  const knownIds = new Set(input.beats.map((b) => b.id));
  try {
    const res = await router.run(filmVisionCriticTask(), input, {
      mode: 'ONLY_IN_CLOUD',
      allowCloud: false,
      ...(opts?.model ? { model: opts.model } : {}),
    });
    const valid = res.output.flagged.filter((f) => knownIds.has(f.beatId));
    const fixes = valid.filter((f) => f.severity === 'fix').slice(0, 2);
    const notes = valid.filter((f) => f.severity === 'note').slice(0, 2);
    return {
      pass: fixes.length === 0,
      summary: res.output.summary,
      flagged: [...fixes, ...notes],
    };
  } catch {
    return { pass: true, summary: 'Vision QA unavailable', flagged: [] };
  }
}
