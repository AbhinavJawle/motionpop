/**
 * `note.fix` prompt v1 (spec 09, ai-tasks.md §4b). A frame note is a circle the user drew on the
 * preview plus a sentence. The patch rules are those of `edit.patch`; the new part is the region.
 * It works without the picture: `regionText` names what was circled. The picture helps with
 * colour and shape requests. No schema text (D-042).
 */
export const NOTE_FIX_SYSTEM_V1 = `You fix one motion graphic from a note the user drew on its frame, with an RFC 6902 JSON Patch.
Answer with JSON only: { "patch": [...], "escalate"?: boolean, "message"?: string }. No prose.
The user circled an area of the frame (x, y, width, height as fractions of the frame, from the top left) and wrote what should change there. A picture of that area may come with it.
Rules:
- Only "replace", "add" and "remove" ops, and only on the listed paths.
- Change only what the note asks, in the circled area. Keep every other value.
- Use the texts found inside the circle to decide which field the note is about.
- "timing" is how the graphic moves: speed below 1 is slower and above 1 is faster, fade false means it holds its last frame instead of fading out.
- Values must fit the field (type, length, range).
- Never invent numbers, names or dates the user didn't give.
- If the note needs a different kind of graphic or can't be done with the listed paths, answer { "patch": [], "escalate": true, "message": "<one short sentence>" }.
Examples:
- current {"content":{"value":40,"label":"Revenue grew"},"timing":{"speed":1,"ease":"inOut","fade":true}}, circled area around the texts ["40%"], note "this is too small" -> {"patch":[],"escalate":true,"message":"Size isn't an option here. Try a quick edit or Generate."}
- same current, circled area around the texts ["Revenue grew"], note "change this to Sales grew" -> {"patch":[{"op":"replace","path":"/content/label","value":"Sales grew"}]}`;

export interface NoteFixPromptInput {
  componentId: string;
  fieldGuide: string;
  current: Record<string, unknown>;
  note: {
    text: string;
    tMs: number;
    region: { x: number; y: number; w: number; h: number };
  };
  regionText: readonly string[];
  /** True when a picture of the area is attached. */
  hasImage: boolean;
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;

export function noteFixPromptV1(input: NoteFixPromptInput): string {
  const r = input.note.region;
  return [
    `component: ${input.componentId}`,
    `editable paths:\n${input.fieldGuide}`,
    `current: ${JSON.stringify(input.current)}`,
    `circled area: x ${pct(r.x)}, y ${pct(r.y)}, width ${pct(r.w)}, height ${pct(r.h)}, ${(input.note.tMs / 1000).toFixed(1)} s into the graphic`,
    `texts inside the circle: ${input.regionText.length ? JSON.stringify(input.regionText) : 'none found'}`,
    ...(input.hasImage ? ['The attached picture shows the circled area.'] : []),
    `note: ${input.note.text}`,
  ].join('\n');
}
