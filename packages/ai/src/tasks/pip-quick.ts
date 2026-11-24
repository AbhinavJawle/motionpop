/**
 * `pip.quick` — compact on-device Gemini Nano planner for straightforward Pip commands (toggle
 * captions, switch reel look, set reel theme colours, change format, toggle SFX/music, toggle
 * auto-cuts, switch style, clear a reel scene, or quick-edit one voiceover slot). Runs free and
 * offline via Firebase AI Logic (`ONLY_ON_DEVICE`) and returns `escalate: true` for complex
 * multi-step or creative requests so the caller hands those to cloud `pip.plan` (Gemini 4 Neon).
 */
import { PipModelOutputSchema, type PipModelOutput } from '@motionpop/schemas';
import { z } from 'zod';
import type { Router, TaskDef } from '../router';
import type { PipPlanInput } from './pip-plan';

export const PIP_QUICK_PROMPT_VERSION = 'v2';

export const PipQuickInputSchema = z.object({
  message: z.string().trim().min(1).max(600),
  format: z.enum(['16:9', '9:16', '1:1']),
  styleId: z.string().max(40),
  captionsOn: z.boolean(),
  hasReel: z.boolean(),
  reelLook: z.enum(['mono', 'cream']).optional(),
  reelCaptions: z.boolean().optional(),
  sceneRefs: z.array(z.string().max(60)).max(12).default([]),
  slotRefs: z.array(z.string().max(60)).max(12).default([]),
});
export type PipQuickInput = z.infer<typeof PipQuickInputSchema>;

const QuickStepSchema = z.object({
  action: z.enum([
    'setReelLook',
    'setCaptions',
    'setReelTheme',
    'setSound',
    'setMusic',
    'setStyle',
    'setFormat',
    'toggleCuts',
    'clearScene',
    'updateSlot',
  ]),
  label: z.string().max(90),
  choice: z.string().max(120).optional(),
  slot: z.string().max(16).optional(),
  instruction: z.string().max(160).optional(),
});

export const PipQuickOutputSchema = z.object({
  escalate: z.boolean(),
  reply: z.string().max(180),
  steps: z.array(QuickStepSchema).max(4).default([]),
});
export type PipQuickOutput = z.infer<typeof PipQuickOutputSchema>;

export const PIP_QUICK_SYSTEM_V1 = `You are Pip's fast on-device planner (Gemini Nano). Reply with ONLY JSON.

Handle simple, direct edits locally with escalate=false:
- Reel look: action="setReelLook", choice="mono" | "cream" (only when Reel=yes).
- Captions (reel or video): action="setCaptions", choice="on" | "off" | "pop" | "clean" | "boxed".
- Reel accent colour/gradient: action="setReelTheme", choice="soft" | "bold" | "plain", instruction="#RRGGBB" or "#RRGGBB #RRGGBB" (only when Reel=yes).
- Sound effects: action="setSound", choice="on" | "off" | "louder" | "quieter" | "clear".
- Background music: action="setMusic", choice="none" | "calm-pad" | "steady-pulse".
- Look/style (non-reel): action="setStyle", choice="editorial-cream" | "studio-light" | "creator-dark" | "keynote-clean" | "editorial-explainer" | "field-notes" | "newsprint" | "paper-collage".
- Aspect ratio: action="setFormat", choice="16:9" | "9:16" | "1:1".
- Auto-cuts on/off: action="toggleCuts", choice="enable" | "disable".
- Remove graphic from one reel scene: action="clearScene", slot="r1".
- Quick tweak to one voiceover slot (s1, s2 — NEVER reel scenes r1): action="updateSlot", slot="s1", instruction="...".

Return escalate=true with steps=[] for ANYTHING complex:
- Editing or redesigning reel scene visuals, rewriting scripts/hooks/titles, adding scenes or slots, generating custom graphics or AI music briefs, or cutting timestamp ranges.

Keep reply short and friendly (under 14 words).`;

export function pipQuickPromptV1(i: PipQuickInput): string {
  return [
    `Reel: ${i.hasReel ? `yes (look=${i.reelLook ?? 'mono'}, captions=${i.reelCaptions === false ? 'off' : 'on'})` : 'no'}`,
    `Format: ${i.format} | Style: ${i.styleId} | Captions: ${i.captionsOn ? 'on' : 'off'}`,
    ...(i.slotRefs.length ? [`Slots: ${i.slotRefs.join('; ')}`] : []),
    ...(i.sceneRefs.length ? [`Scenes: ${i.sceneRefs.join('; ')}`] : []),
    `User request: "${i.message}"`,
  ].join('\n');
}

export const pipQuickJsonSchema = (): Record<string, unknown> => ({
  type: 'object',
  properties: {
    escalate: { type: 'boolean' },
    reply: { type: 'string', maxLength: 180 },
    steps: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'setReelLook',
              'setCaptions',
              'setReelTheme',
              'setSound',
              'setMusic',
              'setStyle',
              'setFormat',
              'toggleCuts',
              'clearScene',
              'updateSlot',
            ],
          },
          label: { type: 'string', maxLength: 90 },
          choice: { type: 'string', maxLength: 120 },
          slot: { type: 'string', maxLength: 16 },
          instruction: { type: 'string', maxLength: 160 },
        },
        required: ['action', 'label'],
      },
    },
  },
  required: ['escalate', 'reply', 'steps'],
});

export function pipQuickTask(): TaskDef<PipQuickInput, PipQuickOutput> {
  return {
    id: 'pip.quick',
    input: PipQuickInputSchema,
    output: PipQuickOutputSchema,
    mode: () => 'ONLY_ON_DEVICE',
    model: (cfg) => cfg.modelFast,
    system: PIP_QUICK_SYSTEM_V1,
    prompt: pipQuickPromptV1,
    jsonSchema: pipQuickJsonSchema,
    cloudCost: () => 0,
    cloudFallback: false,
    maxRepairs: 1,
    promptVersion: PIP_QUICK_PROMPT_VERSION,
    maxOutputTokens: 512,
  };
}

/** Build a compact `PipQuickInput` from the full `PipPlanInput`. */
export function pipQuickInputFrom(input: PipPlanInput): PipQuickInput {
  const p = input.project;
  return PipQuickInputSchema.parse({
    message: input.message.slice(0, 600),
    format: p.format,
    styleId: p.styleId.slice(0, 40),
    captionsOn: p.captions.enabled,
    hasReel: Boolean(p.reel),
    ...(p.reel ? { reelLook: p.reel.look, reelCaptions: p.reel.captions } : {}),
    sceneRefs: (p.reel?.scenes ?? [])
      .slice(0, 12)
      .map((s) => `${s.ref} (${s.template})`.slice(0, 60)),
    slotRefs: p.slots.slice(0, 12).map((s) => `${s.ref} (${s.componentId})`.slice(0, 60)),
  });
}

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;

/**
 * Converts a `PipQuickOutput` into the standard `PipModelOutput` consumed by `enforcePlan`.
 * Defensively normalizes `setReelTheme` (whether Nano puts hex colours in `instruction` or
 * `choice`) and prevents `updateSlot` from targeting reel scenes (`r1`) where `enforcePlan` would
 * silently remap it to a paid `editScene`.
 */
export function pipQuickToModelOutput(out: PipQuickOutput): PipModelOutput | null {
  if (out.escalate || out.steps.length === 0) return null;
  const steps: PipModelOutput['steps'] = [];
  for (const s of out.steps) {
    const rawSlot = s.slot?.trim() || 'none';
    const rawChoice = s.choice?.trim() || 'none';
    const rawInstruction = s.instruction?.trim() || '';
    const label = s.label.trim().slice(0, 120) || s.action;

    if (s.action === 'setReelTheme') {
      // `enforcePlan` reads hex colours from `instruction` and background ('plain'|'bold'|'soft')
      // from `choice`. Accept hexes from either field so Nano never gets dropped for swapping them.
      const hexes = [
        ...(rawInstruction.match(HEX_RE) ?? []),
        ...(rawChoice.match(HEX_RE) ?? []),
      ].slice(0, 2);
      if (hexes.length === 0) continue;
      const bg = /\bbold\b/i.test(rawChoice)
        ? 'bold'
        : /\bplain\b/i.test(rawChoice)
          ? 'plain'
          : 'soft';
      steps.push({
        action: 'setReelTheme',
        slot: 'none',
        choice: bg,
        atWord: -1,
        instruction: hexes.map((h) => h.toUpperCase()).join(' '),
        label,
      });
      continue;
    }

    if (s.action === 'updateSlot') {
      // Never allow an on-device quick step to aim `updateSlot` at a reel scene (`r1`), which
      // `enforcePlan` would remap to a cloud-billed `editScene`.
      if (!/^s\d+$/i.test(rawSlot) || !rawInstruction) continue;
    }

    steps.push({
      action: s.action,
      slot: rawSlot,
      choice: rawChoice,
      atWord: -1,
      instruction: rawInstruction.slice(0, 200),
      label,
    });
  }
  if (steps.length === 0) return null;
  const parsed = PipModelOutputSchema.safeParse({
    reply: out.reply.trim().slice(0, 240) || 'Here’s the plan',
    steps,
  });
  return parsed.success && parsed.data.steps.length > 0 ? parsed.data : null;
}

/** Runs `pip.quick` strictly on-device (never spends credits or touches the cloud). */
export async function runPipQuick(router: Router, input: PipPlanInput) {
  return router.run(pipQuickTask(), pipQuickInputFrom(input), {
    mode: 'ONLY_ON_DEVICE',
    allowCloud: false,
  });
}
