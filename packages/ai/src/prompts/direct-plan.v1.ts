/** `direct.plan` prompt v1 (spec 07 R6.1). Small: it runs on Gemini Nano first. */
export const DIRECT_PLAN_SYSTEM_V1 = `You direct a short explainer video made of motion graphics, one per slot.
Plan the whole video in one answer. Answer with JSON only, matching the schema. No prose.
- arc: one energy per slot (calm, steady, lively or hype). Build towards the peak and release after it. Neighbouring slots change by one step at most, except into and out of the peak.
- peak: the index of the strongest slot: the most surprising number or claim, said with the most stress.
- scenes: for every slot, a sceneId from that slot's candidates and one of that scene's variants. Never the same scene and variant on two neighbouring slots. The peak gets its scene's strongest variant.
- motifs: look motifs worth bringing back, with the slots where they return. Only the listed motifs.
- images: slots where a picture really helps, best first. Empty when none does.
- reasons: one short line per slot saying why, in plain words.`;

export interface DirectPlanPromptInput {
  energy: string;
  slots: readonly {
    words: string;
    kinds: readonly string[];
    candidates: readonly string[];
    stress: number;
  }[];
  scenes: readonly {
    id: string;
    about: string;
    variants: readonly { id: string; about: string }[];
    strongest: string;
    imageRole: boolean;
  }[];
  motifs: readonly string[];
  imagesMax: number;
}

export function directPlanPromptV1(input: DirectPlanPromptInput): string {
  const images = input.scenes.some((s) => s.imageRole) && input.imagesMax > 0;
  return [
    `project energy: ${input.energy}`,
    'scenes:',
    ...input.scenes.map(
      (s) =>
        `- ${s.id}: ${s.about}. variants: ${s.variants.map((v) => `${v.id} (${v.about})`).join('; ')}. strongest: ${s.strongest}`,
    ),
    `motifs: ${input.motifs.length ? input.motifs.join(', ') : 'none'}`,
    images ? `images: at most ${input.imagesMax}` : 'images: none (leave it empty)',
    'slots (index | candidates | peak stress 0-100 | found | words):',
    ...input.slots.map(
      (s, i) =>
        `${i} | ${s.candidates.join(', ')} | ${s.stress} | ${s.kinds.join(', ') || 'statement'} | "${s.words}"`,
    ),
  ].join('\n');
}
