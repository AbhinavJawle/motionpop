/**
 * `film.vision-critic` prompt v1 (spec 22 R1.1): single-call multimodal visual QA over a contact
 * sheet of up to 6 beats at their key moment. Catches aesthetic, readability, contrast, cramped
 * layout, or face-collision issues that DOM bounding-box checks cannot see.
 */
export const FILM_VISION_CRITIC_SYSTEM_V1 = `You are a senior motion graphics creative director doing a rapid visual QA pass on a contact sheet of rendered beats from a short-form Reel.
Answer with JSON only, matching the schema.

WHAT TO CHECK
- Each tile in the contact sheet is labeled with its beat id (b1, b2, ...) and videoStage.
- ONLY flag a beat with severity="fix" if there is a CLEAR, undeniable visual defect:
  1. Illegible low-contrast text (such as grey text over bright live footage) or text colliding with another graphic element or with the live caption rail (bottom 18%–30% on 9:16, or middle seam 45%–54% on vertical split beats).
  2. Cramped, cluttered, clipped, or misaligned layout that looks broken, or an unrequested oval/box outline drawn in the PiP corner.
  3. Empty/timid wireframe frame (giant empty box or crude stick-figure silhouette with dead space).
  4. Opaque boxy card, viewport border, or floating shapes/circles covering the speaker's face or eyes when the stage is supposed to be frameless ("full", "broll-full", "screen-showcase").
- Do NOT nitpick clean, legible, balanced beats. If every tile looks crisp and readable, return pass=true and flagged=[].
- Flag at most 2 beats with severity="fix" so repair stays fast and surgical.
- For each flagged beat, write a concrete, actionable "fixHint" the builder can apply immediately (e.g. "Move the headline to top 12%..56% above the caption rail, remove the oval PiP outline, and add a dark scrim behind text over live footage").`;

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
