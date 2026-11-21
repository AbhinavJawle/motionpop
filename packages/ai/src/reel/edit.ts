/**
 * `reel.edit` (spec 28 R3): a cloud editor double-checks the automatic retake cuts of a raw
 * talking-head recording. It sees the numbered phrases, with the phrases our rules already cut
 * marked, and may cut more (botched takes worded differently, stumbles, off-script chatter) or
 * keep a marked phrase (a deliberate repeat). The caller enforces limits in code.
 */
import { z } from 'zod';
import type { Router, TaskDef } from '../router';

export const REEL_EDIT_PROMPT_VERSION = 'v1';
export const REEL_EDIT_MODEL = 'gemini-3.8-flash';

export const ReelEditInputSchema = z.object({
  /** [phrase id, text, already cut by the rules]. */
  phrases: z
    .array(z.tuple([z.number().int().nonnegative(), z.string().max(600), z.boolean()]))
    .min(1)
    .max(400),
});
export type ReelEditInput = z.infer<typeof ReelEditInputSchema>;

export const ReelEditOutputSchema = z.object({
  cut: z
    .array(
      z.object({
        phrase: z.number().int().nonnegative(),
        kind: z.enum(['retake', 'ramble']),
        reason: z.string().max(120),
      }),
    )
    .max(200),
  keep: z.array(z.number().int().nonnegative()).max(200),
});
export type ReelEditOutput = z.infer<typeof ReelEditOutputSchema>;

export const REEL_EDIT_SYSTEM_V1 = `You are the editor of a short vertical video made from a raw talking-head recording.
The creator talks to camera and often repeats a line until it comes out right. You get the transcript split into numbered phrases, in recording order. Phrases marked [CUT] were already removed by automatic rules.

Decide the final edit:
- "cut": phrases that must not be in the video:
  - an earlier, botched attempt at a line that is said again later (keep the LAST good take, even if the wording changed a little),
  - false starts and abandoned sentences ("So the thing is— okay."),
  - stumbles and self-corrections ("I mean, sorry"),
  - talk that is not part of the video: asides to the camera or crew ("is it recording?", "let me do that again", "okay, cut"), counting in, testing.
  Use kind "retake" for repeated or botched takes and kind "ramble" for off-script talk.
- "keep": phrases marked [CUT] that should stay after all, because the repeat is deliberate (emphasis, a callback, a list that repeats a structure on purpose).

Rules:
- Never cut a line that is said only once and belongs to the video.
- When in doubt, keep.
- Do not repeat phrases already marked [CUT] in "cut".
- Reasons are short (under 12 words).

Return ONLY JSON matching the schema.`;

export function reelEditPromptV1(input: ReelEditInput): string {
  return [
    'Phrases:',
    ...input.phrases.map(([id, text, cut]) => `${id}.${cut ? ' [CUT]' : ''} ${text}`),
  ].join('\n');
}

export const reelEditJsonSchema = (): Record<string, unknown> => ({
  type: 'object',
  properties: {
    cut: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phrase: { type: 'integer' },
          kind: { type: 'string', enum: ['retake', 'ramble'] },
          reason: { type: 'string' },
        },
        required: ['phrase', 'kind', 'reason'],
      },
    },
    keep: { type: 'array', items: { type: 'integer' } },
  },
  required: ['cut', 'keep'],
});

export function reelEditTask(): TaskDef<ReelEditInput, ReelEditOutput> {
  return {
    id: 'reel.edit',
    input: ReelEditInputSchema,
    output: ReelEditOutputSchema,
    mode: () => 'ONLY_IN_CLOUD',
    // The balanced model (tech.md): in lab runs the lite model misread the [CUT] marks and
    // restored repeated takes; the balanced one answered correctly at ~2 s.
    model: () => REEL_EDIT_MODEL,
    system: REEL_EDIT_SYSTEM_V1,
    prompt: reelEditPromptV1,
    jsonSchema: reelEditJsonSchema,
    // Part of the reel's directing (its 3 credits): no separate charge.
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 1,
    promptVersion: REEL_EDIT_PROMPT_VERSION,
    thinking: 'LOW',
    maxOutputTokens: 4096,
    check: (o, i) => {
      const ids = new Set(i.phrases.map((p) => p[0]));
      const bad = [...o.cut.map((c) => c.phrase), ...o.keep].find((id) => !ids.has(id));
      return bad === undefined ? null : `phrase ${bad} does not exist`;
    },
  };
}

/**
 * Runs the review. Null when there is no router, nothing to review, or the call fails: the
 * rule-based edit then stands on its own.
 */
export async function reviewReelEdit(
  router: Router | null,
  phrases: ReelEditInput['phrases'],
): Promise<ReelEditOutput | null> {
  if (!router || phrases.length < 2) return null;
  try {
    const input = ReelEditInputSchema.parse({ phrases: phrases.slice(0, 400) });
    const res = await router.run(reelEditTask(), input, { mode: 'ONLY_IN_CLOUD' });
    return res.output;
  } catch {
    return null;
  }
}
