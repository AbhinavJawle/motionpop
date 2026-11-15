import { z } from 'zod';
import { EnergySchema } from './score';

const SlotIndex = z.number().int().nonnegative();

/**
 * The director's plan for a whole video (spec 07 R6.1): what the AI proposes. Code enforces the
 * hard rules on it afterwards, so nothing here is trusted as-is.
 */
export const DirectorPlanSchema = z.object({
  /** Energy per slot: the curve across the video. */
  arc: z.array(z.object({ slot: SlotIndex, energy: EnergySchema })).max(60),
  /** The slot that is the emotional peak. */
  peak: SlotIndex,
  /** Scene (from that slot's candidates) and optional variant per slot. */
  scenes: z
    .array(
      z.object({
        slot: SlotIndex,
        sceneId: z.string().min(1),
        variant: z.string().min(1).optional(),
      }),
    )
    .max(60),
  /** Look motifs to bring back, and where. */
  motifs: z.array(z.object({ motif: z.string().min(1), slots: z.array(SlotIndex).max(60) })).max(6),
  /** Slots where an image really helps, best first. */
  images: z.array(SlotIndex).max(20),
  /** One short line per choice, for the plan card. */
  reasons: z.array(z.string().max(160)).max(60).optional(),
});
export type DirectorPlan = z.infer<typeof DirectorPlanSchema>;
