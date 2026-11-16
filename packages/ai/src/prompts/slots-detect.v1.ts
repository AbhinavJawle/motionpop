/** `slots.detect` prompt v1 (ai-tasks.md §1). Versioned; Remote Config may pick another later. */
export const SLOTS_DETECT_SYSTEM_V1 = `You place motion graphics on a voiceover transcript.
Answer with JSON only, matching the schema. No prose, no markdown.
Rules:
- Prefer numbers, comparisons, places, dates, names, lists and key claims.
- At most maxSlots slots. Never overlap. Each slot spans the words (by index, inclusive) that justify it.
- componentId must be one of the given components, skillId one of the given skills, and the skill must work with the component.
- reason quotes the exact spoken words: "You said '<words>'".
- Extract values exactly as spoken ("forty percent" -> value 40, suffix "%"). Never invent numbers, names or dates; list anything missing in needsInput.
- Scenes (stat-punch, hook-statement, versus, chart-story): params {}. Code writes them from the words. A stat-punch spans one spoken number; a hook-statement spans one short sentence (3 to 14 words); a versus spans "A versus B"; a chart-story spans 2 to 6 spoken values (one stat-punch per value is worse).
- Other components: params {} and needsInput with what they still need.
- score is 0..1: how strongly the moment deserves a graphic.`;

export function slotsDetectPromptV1(input: {
  words: readonly (readonly [number, string, number, number])[];
  candidates: readonly unknown[];
  components: readonly { id: string; useWhen: string; built: boolean }[];
  skills: readonly { id: string; useWhen: string; worksWith: readonly string[] }[];
  maxSlots: number;
  language: string;
}): string {
  return [
    `language: ${input.language}`,
    `maxSlots: ${input.maxSlots}`,
    `components: ${JSON.stringify(input.components.map((c) => ({ id: c.id, useWhen: c.useWhen, rendersNow: c.built })))}`,
    `skills: ${JSON.stringify(input.skills.map((s) => ({ id: s.id, useWhen: s.useWhen, worksWith: s.worksWith })))}`,
    `candidates (found by code, may be incomplete): ${JSON.stringify(input.candidates)}`,
    `words [index, text, startMs, endMs]: ${JSON.stringify(input.words)}`,
  ].join('\n');
}
