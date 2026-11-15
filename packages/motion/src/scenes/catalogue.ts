import type { Scene } from './define';

/**
 * The scene catalogue as the AI sees it (spec 07 R2.1, R9.4): generated from the registry, so
 * a new scene or variant reaches the prompts without editing them. Plain lines, no JSON Schema:
 * the structured-output schema already carries the field rules.
 */
export function catalogueSummary(list: readonly Scene<unknown>[]): string {
  return list
    .map((s) => {
      const variants = s.variants.map((v, i) => `${v.id}${i === 0 ? '*' : ''} (${v.about})`);
      const cues = s.cues.map((c) => `${c.id}${c.optional ? '?' : ''} (${c.about})`);
      const roles = s.imageRoles.map((r) => `${r.id} (${r.about})`);
      return [
        `${s.id}: use when ${s.useWhen}. ${s.durationMs.min / 1000}–${s.durationMs.max / 1000} s.`,
        `  variants: ${variants.join('; ')}`,
        `  cues: ${cues.join('; ')}`,
        ...(roles.length ? [`  images: ${roles.join('; ')}`] : []),
      ].join('\n');
    })
    .join('\n');
}

/** Key to the catalogue's marks, for the prompt that includes it. */
export const CATALOGUE_KEY = '* = safe default variant, ? = optional cue';
