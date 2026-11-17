import { z } from 'zod';
import { PROMPT_PREFILL_SYSTEM_V1, promptPrefillPromptV1 } from '../prompts/prompt-prefill.v1';
import type { TaskDef } from '../router';

/** The longest pre-filled prompt (ai-tasks.md §2). */
export const PREFILL_MAX = 140;

export const PromptPrefillInputSchema = z.object({
  slot: z.object({
    reason: z.string().max(300),
    componentId: z.string().min(1),
    skillId: z.string().min(1),
    /** The graphic's display name ("Bar chart"), which the app knows and the model does not. */
    componentName: z.string().min(1).max(60),
    /** The words the slot sits on, as spoken. */
    said: z.string().max(300).optional(),
  }),
  style: z.object({ id: z.string().min(1), name: z.string().min(1).max(60) }),
});
export type PromptPrefillInput = z.infer<typeof PromptPrefillInputSchema>;

export const PromptPrefillOutputSchema = z.object({
  prompt: z.string().trim().min(8).max(PREFILL_MAX),
});
export type PromptPrefillOutput = z.infer<typeof PromptPrefillOutputSchema>;

/**
 * `prompt.prefill`: a one-sentence prompt for an empty prompt box. On the device only and free;
 * the app never routes it to the cloud (D-035: no surprise spend, hybrid-ai.md). When the device
 * model is missing or answers badly the app uses `templatePrompt` instead.
 */
export const promptPrefill: TaskDef<PromptPrefillInput, PromptPrefillOutput> = {
  id: 'prompt.prefill',
  maxOutputTokens: 512,
  // Cached per input (spec 13b R4.1); the prompt text is version v1.
  cacheable: true,
  promptVersion: 'v1',
  input: PromptPrefillInputSchema,
  output: PromptPrefillOutputSchema,
  mode: () => 'ONLY_ON_DEVICE',
  model: (cfg) => cfg.modelFast,
  system: PROMPT_PREFILL_SYSTEM_V1,
  prompt: (i) =>
    promptPrefillPromptV1({
      slot: { reason: i.slot.reason, componentName: i.slot.componentName, said: i.slot.said },
      style: { name: i.style.name },
    }),
  cloudCost: () => 0,
  cloudFallback: false,
  thinking: 'MINIMAL',
  check: (out) => (/[\r\n]/.test(out.prompt) ? 'the prompt must be one line, one sentence' : null),
};

const SAID_WORDS = 8;

/**
 * The deterministic prompt used when the device can't write one (spec 09 R6.1):
 * `A {style name} {component name} for “{first 8 spoken words}”.` Always at most 140 characters:
 * spoken words are dropped from the end until it fits, and the quote goes if even one does not.
 */
export function templatePrompt(input: {
  componentName: string;
  styleName: string;
  said?: string | undefined;
}): string {
  const style = input.styleName.trim();
  const article = /^[aeiou]/i.test(style) ? 'An' : 'A';
  const base = `${article} ${style} ${input.componentName.trim().toLowerCase()}`;
  const words = (input.said ?? '')
    .replace(/[“”"]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, SAID_WORDS);
  for (let n = words.length; n > 0; n--) {
    const text = `${base} for “${words.slice(0, n).join(' ')}”.`;
    if (text.length <= PREFILL_MAX) return text;
  }
  return `${base}.`.slice(0, PREFILL_MAX);
}
