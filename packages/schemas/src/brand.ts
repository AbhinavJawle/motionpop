import { z } from 'zod';
import { contrastRatio } from './color';

/** `#RRGGBB`, the only colour form the brand kit takes. */
export const BrandHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected #RRGGBB');

/**
 * A brand kit on a project (Brand panel): its colours replace the look's accents everywhere, in
 * the preview and the export. Absent means the look's own colours.
 */
export const BrandSchema = z
  .object({
    accent: BrandHexSchema,
    accent2: BrandHexSchema.optional(),
  })
  .strict();
export type Brand = z.infer<typeof BrandSchema>;

/**
 * The floor for a brand colour against the look's background. Accents are mostly fills, bars and
 * highlights behind ink, and the hand-tuned looks sit near 2:1 (Editorial's ember on paper is
 * 2.0:1), so the floor only rejects colours that would vanish (cream on paper is 1.05:1).
 */
export const BRAND_MIN_CONTRAST = 1.8;

/** Why a brand colour can't be used on a background, or null when it can. */
export function brandColourIssue(hex: string, background: string): string | null {
  return contrastRatio(hex, background) < BRAND_MIN_CONTRAST
    ? 'Too close to the background. Pick a deeper shade.'
    : null;
}

/** Mixes `hex` toward white by `t` (0..1). */
export function lighten(hex: string, t: number): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * Math.min(1, Math.max(0, t)));
  const out = (mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255);
  return `#${out.toString(16).padStart(6, '0')}`;
}

/**
 * The colour itself when it reads at `min`:1 on `background`, else the least-lightened version of
 * it that does (white at worst). Used for accent-coloured words on dark caption boxes.
 */
export function readableOn(hex: string, background: string, min = 4.5): string {
  for (let i = 0; i <= 20; i++) {
    const c = lighten(hex, i / 20);
    if (contrastRatio(c, background) >= min) return c;
  }
  return '#ffffff';
}
