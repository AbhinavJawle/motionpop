/**
 * `film.vision-critic` prompt v1 (spec 22 R1.1): single-call multimodal visual QA over a contact
 * sheet of up to 6 beats at their key moment. Catches aesthetic, readability, contrast, cramped
 * layout, or face-collision issues that DOM bounding-box checks cannot see.
 */
export const FILM_VISION_CRITIC_SYSTEM_V1 = `You are a senior motion graphics creative director doing a strict visual QA pass on a contact sheet of rendered beats from a talking-head Reel.
Answer with JSON only, matching the schema.

WHAT TO CHECK
- Each tile in the contact sheet is labeled with its beat id (b1, b2, ...) and videoStage.
- Flag a beat with severity="fix" if ANY of these real visual defects appear:
  1. Illegible low-contrast text (e.g. white or pale text over white/cream studio background, or grey text over live video) or text colliding with another graphic or with the black live caption ribbon.
  2. Empty or blank card/rectangle (a white/grey box with nothing inside it, or 70%+ wasted dead void with a tiny element crammed at one edge).
  3. Amateur clipart / crude cartoon SVG objects (cartoon mirrors, stick figures, cartoon globes) or fake viewfinder brackets / viewport borders.
  4. ANY graphic, card, shape, or text covering the speaker's face or eyes, or an opaque panel covering the speaker's head on a non-split stage.
  5. Cramped, clipped, or misaligned layout that looks broken or overflows its stage.
- Do NOT nitpick clean, balanced, high-contrast studio beats. If every tile looks crisp, readable, and agency-clean, return pass=true and flagged=[].
- Flag up to 3 defective beats per sheet with severity="fix" and write a concrete, actionable "fixHint" the builder can apply immediately (e.g. "Switch headline ink to var(--ink) #0A0A0E for strong contrast on the light stage, fill the two empty cards with concrete checklist rows, and center the layout cleanly inside the 50% top stage").`;

export interface FilmVisionCriticPromptInput {
  format: string;
  lookName: string;
  beats: readonly {
    id: string;
    videoStage?: string;
    archetype?: string;
    text: readonly string[];
  }[];
}

export function filmVisionCriticPromptV1(i: FilmVisionCriticPromptInput): string {
  const lines = [
    `Inspect the attached contact sheet (${i.beats.length} beats, format ${i.format}, look "${i.lookName}").`,
    'Tiles appear left-to-right, top-to-bottom in this exact order:',
    ...i.beats.map(
      (b, idx) =>
        `${idx + 1}. id="${b.id}" · stage=${b.videoStage ?? 'full'} · archetype=${b.archetype ?? 'custom'} · text=${b.text.length ? b.text.map((t) => `"${t}"`).join(' / ') : '(none)'}`,
    ),
    '',
    'Return pass=true with flagged=[] if all tiles look clean and readable; otherwise flag only clearly defective tiles.',
  ];
  return lines.join('\n');
}
