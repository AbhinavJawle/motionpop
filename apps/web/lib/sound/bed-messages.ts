import {
  AudioSettingSchema,
  EnergySchema,
  MusicIdSchema,
  SlotStatusSchema,
} from '@motionpop/schemas';
import { z } from 'zod';

/** Messages between the editor and `workers/bed.worker.ts` (spec 12 §7). Both sides parse them. */

const BedSlotSchema = z.object({
  id: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  wordStart: z.number().int(),
  wordEnd: z.number().int(),
  componentId: z.string(),
  status: SlotStatusSchema,
  energy: EnergySchema.optional(),
  params: z.unknown(),
  keyMomentMs: z.number().optional(),
});

export const BedRequestSchema = z.object({
  type: z.literal('mix'),
  id: z.string().min(1),
  project: z.object({
    durationMs: z.number().int().positive(),
    slots: z.array(BedSlotSchema),
    transcript: z.object({
      words: z.array(
        z.object({ startMs: z.number(), endMs: z.number(), filler: z.boolean().optional() }),
      ),
    }),
    audio: AudioSettingSchema.optional(),
  }),
  voiceSrc: z.string(),
  voiceLevelDb: z.number(),
  /** A synthesized bed to mix in (the own track is decoded on the page and sent as samples). */
  music: z
    .object({
      id: MusicIdSchema,
      src: z.string().optional(),
      samples: z.instanceof(Float32Array).optional(),
    })
    .nullable(),
});
export type BedRequest = z.input<typeof BedRequestSchema>;

export const BedPlacementSchema = z.object({
  kind: z.enum(['whoosh', 'pop', 'tick', 'rise', 'impact']),
  take: z.number().int(),
  atMs: z.number(),
  slotId: z.string(),
  gainDb: z.number(),
});
export type BedPlacement = z.infer<typeof BedPlacementSchema>;

export const BedResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('bed'),
    id: z.string(),
    key: z.string(),
    /** 16-bit mono WAV at 24 kHz. */
    wav: z.instanceof(Uint8Array),
    placements: z.array(BedPlacementSchema),
    peakDb: z.number(),
  }),
  z.object({ type: z.literal('none'), id: z.string() }),
  z.object({ type: z.literal('error'), id: z.string(), message: z.string() }),
]);
export type BedResponse = z.infer<typeof BedResponseSchema>;
