/**
 * `prompt.prefill` prompt v1 (spec 09 task 17, ai-tasks.md §2). One short sentence that describes
 * the look and motion of a graphic, from what the narrator said. It runs on the device only, so
 * it stays tiny. No schema text (D-042): the output shape comes from the structured output.
 */
export const PROMPT_PREFILL_SYSTEM_V1 = `You write the prompt of one motion graphic in a video editor.
Answer with JSON only: { "prompt": "<one sentence>" }. No prose.
Rules:
- One sentence, at most 140 characters, ending with a full stop.
- Describe the kind of graphic, its look and how it moves, in the given style.
- Use only what the narrator said. Never invent numbers, names or dates.
- Warm, plain words. No brand names, no quotes around the sentence.
Examples:
- graphic "Bar chart", style "Editorial Explainer", narrator said "revenue grew forty percent since 2020" -> {"prompt":"A clean, animated bar chart with warm orange bars and an editorial feel."}
- graphic "Big number", style "Field Notes", narrator said "this is only the beginning" -> {"prompt":"A big, confident number that lands with the word, in a handwritten notebook look."}`;

export interface PromptPrefillPromptInput {
  slot: { reason: string; componentName: string; said?: string | undefined };
  style: { name: string };
}

export function promptPrefillPromptV1(input: PromptPrefillPromptInput): string {
  return [
    `graphic: ${input.slot.componentName}`,
    `style: ${input.style.name}`,
    `narrator said: ${input.slot.said?.trim() || input.slot.reason}`,
  ].join('\n');
}
