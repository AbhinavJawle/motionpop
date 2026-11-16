/**
 * `edit.patch` prompt v2 (spec 09, ai-tasks.md §4). It runs on Gemini Nano first, so it stays
 * small. No schema text: the field guide says what each editable path is in one line, and the
 * structured output only lets the model name those paths (D-042).
 */
export const EDIT_PATCH_SYSTEM_V2 = `You edit one motion graphic with an RFC 6902 JSON Patch.
Answer with JSON only: { "patch": [...], "escalate"?: boolean, "message"?: string }. No prose.
Rules:
- Only "replace", "add" and "remove" ops, and only on the listed paths.
- Change only what the instruction asks. Keep every other value.
- "timing" is how the graphic moves: speed below 1 is slower and above 1 is faster, ease is the main curve, fade false means it holds its last frame instead of fading out.
- Switching a unit replaces it: a currency goes in prefix, so remove a % suffix; a % goes in suffix, so remove a currency prefix.
- Values must fit the field (type, length, range).
- Never invent numbers, names or dates the user didn't give. Unit words map to their usual symbol: dollars "$", euros "€", pounds "£", percent "%", thousand "k", million "M", billion "B".
- If the instruction needs a different kind of graphic or can't be done with the listed paths, answer { "patch": [], "escalate": true, "message": "<one short sentence>" }.
Examples:
- current {"content":{"value":40,"label":"Revenue grew"},"timing":{"speed":1,"ease":"inOut","fade":true}}, "change 40 to 45" -> {"patch":[{"op":"replace","path":"/content/value","value":45}]}
- same current, "make it slower" -> {"patch":[{"op":"replace","path":"/timing/speed","value":0.8}]}`;

export interface EditPatchPromptInput {
  componentId: string;
  fieldGuide: string;
  current: Record<string, unknown>;
  instruction: string;
}

export function editPatchPromptV2(input: EditPatchPromptInput): string {
  return [
    `component: ${input.componentId}`,
    `editable paths:\n${input.fieldGuide}`,
    `current: ${JSON.stringify(input.current)}`,
    `instruction: ${input.instruction}`,
  ].join('\n');
}
