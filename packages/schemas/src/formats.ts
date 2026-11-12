import { z } from 'zod';

export const FormatIdSchema = z.enum([
  'youtube-16x9',
  'shorts-9x16',
  'square-1x1',
  'product-demo-16x9',
]);
export type FormatId = z.infer<typeof FormatIdSchema>;

/** Insets as fractions of the frame size. top/bottom of height, left/right of width. */
export const SafeZoneSchema = z
  .object({
    top: z.number().min(0).max(0.45),
    right: z.number().min(0).max(0.45),
    bottom: z.number().min(0).max(0.45),
    left: z.number().min(0).max(0.45),
  })
  .refine((s) => s.top + s.bottom < 1 && s.left + s.right < 1, {
    message: 'Safe zone must leave a drawable area',
  });
export type SafeZone = z.infer<typeof SafeZoneSchema>;

export const FormatPresetSchema = z.object({
  id: FormatIdSchema,
  label: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  safeZone: SafeZoneSchema,
});
export type FormatPreset = z.infer<typeof FormatPresetSchema>;

const titleSafe: SafeZone = { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 };

export const FORMAT_PRESETS = {
  'youtube-16x9': {
    id: 'youtube-16x9',
    label: 'YouTube 16:9',
    width: 1920,
    height: 1080,
    fps: 30,
    safeZone: titleSafe,
  },
  'shorts-9x16': {
    id: 'shorts-9x16',
    label: 'Shorts / Reels 9:16',
    width: 1080,
    height: 1920,
    fps: 30,
    // Starting estimate for platform UI (top bar, right action rail, bottom captions).
    // Tuned against real screenshots in the render-pipeline spec.
    safeZone: { top: 0.12, right: 0.12, bottom: 0.2, left: 0.05 },
  },
  'square-1x1': {
    id: 'square-1x1',
    label: 'Square 1:1',
    width: 1080,
    height: 1080,
    fps: 30,
    safeZone: titleSafe,
  },
  'product-demo-16x9': {
    id: 'product-demo-16x9',
    label: 'Product demo 16:9',
    width: 1920,
    height: 1080,
    fps: 30,
    safeZone: titleSafe,
  },
} as const satisfies Record<FormatId, FormatPreset>;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Drawable area inside the safe zone, in whole pixels (keeps layout edges crisp
 * and avoids float drift such as 1 - 0.05 - 0.05 = 0.8999…).
 */
export function getSafeArea(preset: Pick<FormatPreset, 'width' | 'height' | 'safeZone'>): Rect {
  const { width, height, safeZone } = preset;
  const left = Math.round(width * safeZone.left);
  const right = Math.round(width * safeZone.right);
  const top = Math.round(height * safeZone.top);
  const bottom = Math.round(height * safeZone.bottom);
  return { x: left, y: top, width: width - left - right, height: height - top - bottom };
}
