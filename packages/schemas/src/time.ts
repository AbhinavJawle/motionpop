import { z } from 'zod';

/** Project frame rate. Fixed at 30 fps (architecture.md). */
export const FPS = 30 as const;

/** Integer milliseconds from the start of the cleaned voiceover. */
export const MsSchema = z.number().int().nonnegative().brand<'Ms'>();
export type Ms = z.infer<typeof MsSchema>;

/** Brand a plain integer as Ms. Throws when not a non-negative integer. */
export function ms(value: number): Ms {
  return MsSchema.parse(value);
}

/** Convert milliseconds to the nearest frame index. */
export function msToFrame(valueMs: number, fps: number = FPS): number {
  return Math.round((valueMs * fps) / 1000);
}

/** Convert a frame index to integer milliseconds. */
export function frameToMs(frame: number, fps: number = FPS): number {
  return Math.round((frame * 1000) / fps);
}
