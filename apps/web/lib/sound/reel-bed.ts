import { reelBed } from '@motionpop/motion/reel';
import type { reelBedSound, ReelPlan } from '@motionpop/schemas';

/**
 * The reel preview's sound bed (spec 37 R3.4, spec 39 R7.2): the same `reelBed` call the export
 * makes in `services/render/src/bed.ts` (`prepareReelBed`), fed by the same `reelBedSound(project)`.
 * Kept as one function so a parity test can run both over one project.
 */
export function previewReelBed(
  reel: Pick<ReelPlan, 'scenes'> & Partial<Pick<ReelPlan, 'sfx'>>,
  durationMs: number,
  voiceLevelDb: number,
  words: ReadonlyArray<{ startMs: number; endMs: number }>,
  sound: ReturnType<typeof reelBedSound>,
): Float32Array {
  return reelBed(reel, durationMs, { voiceLevelDb, words, ...sound });
}
