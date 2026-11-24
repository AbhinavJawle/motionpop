/**
 * `reel.draft` — lightweight on-device Gemini Nano reel director (`ONLY_ON_DEVICE`, 0 credits,
 * works offline). Uses a flat 4-template schema (`headline`, `counter`, `punch`, `cta`) sized for
 * Chrome Gemini Nano's 9,216-token budget so free/offline reels get real AI-authored headlines,
 * extracted stats, and punchlines instead of keyword rules alone, while cloud `reel.direct`
 * (Gemini 4 Neon, 21 templates + 6 keyframes) remains the flagship default when online.
 */
import {
  ReelPlanSchema,
  tileReelScenes,
  type ReelLook,
  type ReelPlan,
  type ReelScene,
  type ReelWord,
} from '@motionpop/schemas';
import { z } from 'zod';
import type { Router, TaskDef } from '../router';
import { cut } from './text';

export const REEL_DRAFT_PROMPT_VERSION = 'v1';

export const ReelDraftInputSchema = z.object({
  look: z.enum(['mono', 'cream']),
  durationMs: z.number().int().positive(),
  /** Compact [wordIndex, text] list capped to fit comfortably inside Gemini Nano's window. */
  words: z.array(z.tuple([z.number().int().nonnegative(), z.string()])).min(4).max(350),
});
export type ReelDraftInput = z.infer<typeof ReelDraftInputSchema>;

const DraftBeatSchema = z.object({
  fromWord: z.number().int().nonnegative(),
  template: z.enum(['headline', 'counter', 'punch', 'cta']),
  title: z.string().max(48),
  kicker: z.string().max(28).optional(),
  value: z.number().finite().optional(),
  suffix: z.string().max(8).optional(),
});

export const ReelDraftOutputSchema = z.object({
  hook: z.string().max(48).optional(),
  beats: z.array(DraftBeatSchema).min(2).max(12),
});
export type ReelDraftOutput = z.infer<typeof ReelDraftOutputSchema>;

export const REEL_DRAFT_SYSTEM_V1 = `You direct a fast on-device draft of a vertical talking-head reel from its indexed transcript.
Reply with ONLY JSON matching the schema.

Pick 3 to 8 visual beats covering word 0 to the end of the transcript (roughly one beat every 3–5 seconds):
- "headline": bold split-screen title card (title: 2–5 punchy words, optional kicker: 1–3 words).
- "counter": big animated stat (ONLY when the speaker says a real number; set value to the number, optional suffix like "%" or "x", title to a 2–4 word label).
- "punch": bold kinetic words over the speaker (title: 2–4 words, optional kicker: 1–2 words).
- "cta": closing call-to-action at the end (title: 1–2 word keyword, optional kicker: verb like "Try" or "Follow").

Rules:
- Never invent numbers not spoken in the transcript.
- Beats must be in ascending fromWord order, starting at 0.
- Keep titles short and punchy.`;

export function reelDraftPromptV1(i: ReelDraftInput): string {
  const transcript = i.words.map(([idx, text]) => `${idx}:${text}`).join(' ');
  return `Look: ${i.look} | Duration: ${Math.round(i.durationMs / 1000)}s\nTranscript:\n${transcript}`;
}

export const reelDraftJsonSchema = (): Record<string, unknown> => ({
  type: 'object',
  properties: {
    hook: { type: 'string', maxLength: 48 },
    beats: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          fromWord: { type: 'integer' },
          template: { type: 'string', enum: ['headline', 'counter', 'punch', 'cta'] },
          title: { type: 'string', maxLength: 48 },
          kicker: { type: 'string', maxLength: 28 },
          value: { type: 'number' },
          suffix: { type: 'string', maxLength: 8 },
        },
        required: ['fromWord', 'template', 'title'],
      },
    },
  },
  required: ['beats'],
});

export function reelDraftLocalTask(): TaskDef<ReelDraftInput, ReelDraftOutput> {
  return {
    id: 'reel.draft',
    input: ReelDraftInputSchema,
    output: ReelDraftOutputSchema,
    mode: () => 'ONLY_ON_DEVICE',
    model: (cfg) => cfg.modelFast,
    system: REEL_DRAFT_SYSTEM_V1,
    prompt: reelDraftPromptV1,
    jsonSchema: reelDraftJsonSchema,
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 1,
    promptVersion: REEL_DRAFT_PROMPT_VERSION,
    maxOutputTokens: 1024,
  };
}

/** Converts a compact `reel.draft` output into a strict, tiled `ReelPlan`. */
export function draftToReelPlan(
  out: ReelDraftOutput,
  words: readonly ReelWord[],
  durationMs: number,
  look: ReelLook,
): ReelPlan {
  const safeDuration = Math.max(1200, Math.round(Number.isFinite(durationMs) ? durationMs : 4000));
  const n = Math.max(1, words.length);
  const sorted = [...out.beats]
    .map((b) => ({
      ...b,
      fromWord: Math.max(
        0,
        Math.min(n - 1, Math.round(Number.isFinite(b.fromWord) ? b.fromWord : 0)),
      ),
    }))
    .sort((a, b) => a.fromWord - b.fromWord);

  // Deduplicate identical start words while preserving order.
  const uniq: typeof sorted = [];
  for (const b of sorted) {
    if (!uniq.length || uniq.at(-1)!.fromWord !== b.fromWord) uniq.push(b);
  }
  if (uniq.length && uniq[0]!.fromWord > 0) uniq[0] = { ...uniq[0]!, fromWord: 0 };

  const fit = (s: string | undefined, max: number, fallback = ''): string => {
    const trimmed = cut(s, max)?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : fallback;
  };
  const rawScenes: ReelScene[] = uniq.map((b, idx) => {
    const startMs =
      idx === 0 ? 0 : Math.max(0, Math.min(safeDuration - 600, words[b.fromWord]?.startMs ?? 0));
    const nextWord = uniq[idx + 1]?.fromWord;
    const endMs =
      nextWord !== undefined
        ? Math.min(safeDuration, Math.max(startMs + 600, words[nextWord]?.startMs ?? safeDuration))
        : safeDuration;
    const id = `rd-${idx + 1}`;
    const bg = look === 'cream' ? ('cream' as const) : ('light' as const);
    const tag = cut(b.kicker, 24)?.toUpperCase();

    if (
      b.template === 'counter' &&
      typeof b.value === 'number' &&
      Number.isFinite(b.value) &&
      Math.abs(b.value) <= 1e12
    ) {
      const kicker = cut(b.kicker, 36);
      return {
        id,
        startMs,
        endMs,
        layout: 'split',
        bg,
        ...(tag ? { tag } : {}),
        content: {
          template: 'counter',
          value: b.value,
          decimals: Number.isInteger(b.value) ? 0 : 1,
          prefix: '',
          suffix: fit(b.suffix, 8),
          label: fit(b.title, 36, 'Key stat'),
          ...(kicker ? { kicker } : {}),
        },
      };
    }
    if (b.template === 'punch') {
      const top = cut(b.kicker, 28);
      return {
        id,
        startMs,
        endMs,
        layout: 'speaker',
        content: {
          template: 'punch',
          ...(top ? { top } : {}),
          text: fit(b.title, 28, 'Key point'),
        },
      };
    }
    if (b.template === 'cta') {
      return {
        id,
        startMs,
        endMs,
        layout: 'speaker',
        content: {
          template: 'cta',
          verb: fit(b.kicker, 14, 'Try'),
          keyword: fit(b.title, 16, 'NOW'),
        },
      };
    }
    const kicker = cut(b.kicker, 40);
    return {
      id,
      startMs,
      endMs,
      layout: 'split',
      bg,
      ...(tag ? { tag } : {}),
      content: {
        template: 'headline',
        ...(kicker ? { kicker } : {}),
        title: fit(b.title, 60, 'Key takeaway'),
      },
    };
  });

  const tiled = tileReelScenes(rawScenes, safeDuration);
  const hook = cut(out.hook, 48);
  return ReelPlanSchema.parse({
    v: 1,
    look,
    focus: { x: 0.5, y: 0.32 },
    captions: true,
    ...(hook ? { hook } : {}),
    scenes: tiled,
    by: 'gemini-nano',
  });
}

/** Runs `reel.draft` on-device (0 credits, works offline); returns null if Nano is unavailable or fails. */
export async function draftReelOnDevice(
  router: Router | null,
  params: { look: ReelLook; words: readonly ReelWord[]; durationMs: number },
): Promise<ReelPlan | null> {
  if (!router || params.words.length < 4) return null;
  try {
    const input: ReelDraftInput = {
      look: params.look,
      durationMs: params.durationMs,
      words: params.words.slice(0, 350).map((w, i) => [i, w.text] as [number, string]),
    };
    const res = await router.run(reelDraftLocalTask(), input, {
      mode: 'ONLY_ON_DEVICE',
      allowCloud: false,
    });
    return draftToReelPlan(res.output, params.words, params.durationMs, params.look);
  } catch {
    return null;
  }
}
