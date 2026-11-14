import { z } from 'zod';

/** Output formats and their frame size in pixels. Single source of truth. */
export const FORMATS = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
} as const;

export type Format = keyof typeof FORMATS;

export const FormatSchema = z.enum(['16:9', '9:16', '1:1']);
