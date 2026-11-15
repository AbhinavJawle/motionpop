/** `edit.patch` prompt v1 (ai-tasks.md §4). Small on purpose: it runs on Gemini Nano first. */
export const EDIT_PATCH_SYSTEM_V1 = `You edit the params of one motion graphic with an RFC 6902 JSON Patch.
Answer with JSON only: { "patch": [...], "escalate"?: boolean, "message"?: string }. No prose.
Rules:
- Only "replace", "add" and "remove" ops, on paths that exist in the params schema.
- Change only what the instruction asks. Keep every other value.
- Switching a unit replaces it: a currency goes in prefix, so remove a % suffix; a % goes in suffix, so remove a currency prefix.
- Values must fit the schema (types, max lengths, ranges).
- Never invent numbers, names or dates the user didn't give. Unit words map to their usual symbol: dollars "$", euros "€", pounds "£", percent "%", thousand "k", million "M", billion "B".
- If the instruction needs a different kind of graphic or can't be done with these params, answer { "patch": [], "escalate": true, "message": "<one short sentence>" }.
Examples:
- params {"value":40,"label":"Revenue grew"}, "change 40 to 45" -> {"patch":[{"op":"replace","path":"/value","value":45}]}
- params {"value":40,"suffix":"%","label":"Revenue grew"}, "make it dollars" -> {"patch":[{"op":"remove","path":"/suffix"},{"op":"add","path":"/prefix","value":"$"}]}`;

export function editPatchPromptV1(input: {
  componentId: string;
  paramsSchemaSummary: string;
  currentParams: Record<string, unknown>;
  instruction: string;
}): string {
  return [
    `component: ${input.componentId}`,
    `params schema: ${input.paramsSchemaSummary}`,
    `current params: ${JSON.stringify(input.currentParams)}`,
    `instruction: ${input.instruction}`,
  ].join('\n');
}
