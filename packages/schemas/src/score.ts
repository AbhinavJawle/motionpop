import { z } from 'zod';

/** How often something visibly changes (spec 07 R5.1). A project setting; looks give a default. */
export const EnergySchema = z.enum(['calm', 'steady', 'lively', 'hype']);
export type Energy = z.infer<typeof EnergySchema>;

/** Longest time without a visible change, per energy (motion principle 17). */
export const ENERGY_INTERVAL_MS: Record<Energy, number> = {
  calm: 3000,
  steady: 2200,
  lively: 1600,
  hype: 1100,
};

/** Read time for a text block (motion principle 16): 0.8 s, plus 0.2 s per word beyond three. */
export function readTimeMs(wordCount: number): number {
  return 800 + 200 * Math.max(0, Math.floor(wordCount) - 3);
}

export const ScoreBeatSchema = z.object({
  /** One of the scene's cue ids. */
  cue: z.string().min(1),
  /** Word index inside the slot's words (0 = the slot's first word). */
  word: z.number().int().nonnegative(),
});
export type ScoreBeat = z.infer<typeof ScoreBeatSchema>;

export const ScoreImageSchema = z.object({
  /** One of the scene's image roles. */
  role: z.string().min(1),
  /** What to show ("an old cargo ship"). Never style words: the look's recipe adds those. */
  subject: z.string().min(1).max(120),
  /** Set by the app once an asset exists. Never by the AI. */
  assetId: z.string().min(1).optional(),
});
export type ScoreImage = z.infer<typeof ScoreImageSchema>;

/**
 * A slot's score: the whole of what the AI writes for a scene (spec 07 R1). This is the stored
 * shape (`slot.params`). Fill calls use a stricter per-scene schema where `variant`, `cue` and
 * `role` are enums of that scene's ids and `content` is the scene's own schema.
 */
export const ScoreSchema = z.object({
  variant: z.string().min(1).optional(),
  content: z.record(z.string(), z.unknown()),
  beats: z.array(ScoreBeatSchema).max(8).default([]),
  images: z.array(ScoreImageSchema).max(3).default([]),
});
export type Score = z.infer<typeof ScoreSchema>;
