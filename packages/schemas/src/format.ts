import { z } from 'zod';

export const FormatPresetSchema = z.enum([
  'youtube-16x9',
  'shorts-9x16',
  'square-1x1',
  'product-demo-16x9',
]);

export type FormatPreset = z.infer<typeof FormatPresetSchema>;

export const FormatConfigSchema = z.object({
  preset: FormatPresetSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive().default(30),
  aspectRatio: z.string(),
  safeZones: z.object({
    top: z.number().min(0).max(1),
    bottom: z.number().min(0).max(1),
    left: z.number().min(0).max(1),
    right: z.number().min(0).max(1),
  }),
});

export type FormatConfig = z.infer<typeof FormatConfigSchema>;

export const FORMAT_CONFIGS: Record<FormatPreset, FormatConfig> = {
  'youtube-16x9': {
    preset: 'youtube-16x9',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    safeZones: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
  },
  'shorts-9x16': {
    preset: 'shorts-9x16',
    width: 1080,
    height: 1920,
    fps: 30,
    aspectRatio: '9:16',
    safeZones: { top: 0.15, bottom: 0.15, left: 0.05, right: 0.05 },
  },
  'square-1x1': {
    preset: 'square-1x1',
    width: 1080,
    height: 1080,
    fps: 30,
    aspectRatio: '1:1',
    safeZones: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
  },
  'product-demo-16x9': {
    preset: 'product-demo-16x9',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    safeZones: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
  },
};
