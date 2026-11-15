/** `component.fill` prompt v1 (ai-tasks.md §3). Small: auto-fill runs on Gemini Nano. */
export const COMPONENT_FILL_SYSTEM_V1 = `You fill the params of one motion graphic from what the narrator said.
Answer with JSON only: { "params": {...}, "needsInput"?: ["field", ...] }. No prose.
Rules:
- params must match the params schema exactly (types, max lengths, ranges).
- Use only facts from the spoken words or the current params. Never invent numbers, names or dates.
- If a required value isn't in the words, keep the current value and list the field in needsInput.
- Labels are short (at most 6 words), in the narrator's own words, no trailing period.
- Follow the style direction in the prompt for wording and emphasis.`;

export function componentFillPromptV1(input: {
  componentId: string;
  paramsSchemaSummary: string;
  words: string;
  prompt: string;
  currentParams?: Record<string, unknown> | undefined;
  styleId: string;
  skill: { shotSequence: string; emphasis: string };
}): string {
  return [
    `component: ${input.componentId}`,
    `params schema: ${input.paramsSchemaSummary}`,
    `spoken words: "${input.words}"`,
    `direction: ${input.prompt}`,
    `style: ${input.styleId}`,
    `emphasis: ${input.skill.emphasis}`,
    `shot sequence: ${input.skill.shotSequence}`,
    ...(input.currentParams ? [`current params: ${JSON.stringify(input.currentParams)}`] : []),
  ].join('\n');
}
