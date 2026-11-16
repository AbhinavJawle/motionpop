import { z } from 'zod';
import { FormatSchema } from './format';
import { EditorProjectBaseSchema, IntMsSchema, VoiceoverSchema } from './project';
import { EnergySchema } from './score';

/**
 * Project documents and the dashboard summary (spec 11, design §2.1). Times are integer epoch
 * ms; params are stored as JSON strings because scene params can hold nested arrays.
 */

/** One ready slot, enough to play a one-slot composition on a dashboard card. */
export const PosterSchema = z.object({
  slot: z.object({
    componentId: z.string().min(1),
    durationMs: z.number().int().positive().max(12_000),
    keyMomentMs: IntMsSchema,
    paramsJson: z.string().max(20_000),
    words: z
      .array(z.object({ startMs: IntMsSchema, endMs: IntMsSchema }))
      .max(60)
      .optional(),
    stress: z.array(z.number().int().min(0).max(100)).max(60).optional(),
    energy: EnergySchema.optional(),
  }),
  styleId: z.string().min(1),
  format: FormatSchema,
});
export type Poster = z.infer<typeof PosterSchema>;

/** Client-written. Render state is derived from `renders`, never stored here (D-065 #15). */
export const ProjectStatusSchema = z.enum(['draft', 'processing', 'ready']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const SLOT_STATES_MAX = 12;

/** The summary fields every list shows, computed from the project (no sub-document reads). */
export const ProjectSummaryFieldsSchema = z.object({
  status: ProjectStatusSchema,
  slotCount: z.number().int().nonnegative(),
  readySlotCount: z.number().int().nonnegative(),
  slotStates: z.array(z.enum(['ready', 'pending'])).max(SLOT_STATES_MAX),
  graphicsGenerated: z.number().int().nonnegative(),
  poster: PosterSchema.optional(),
  lastOpenedAt: IntMsSchema,
});

/** `projects/{id}`: the project without its arrays, plus the summary. */
export const ProjectDocSchema = EditorProjectBaseSchema.omit({
  slots: true,
  versions: true,
  transcript: true,
  originalTranscript: true,
  voiceover: true,
  id: true,
  title: true,
  ownerId: true,
  lastOpenedAt: true,
})
  .extend({
    ownerId: z.string().min(1),
    title: z.string().min(1).max(80),
    voiceover: VoiceoverSchema.omit({ peaks: true }).strict(),
  })
  .extend(ProjectSummaryFieldsSchema.shape)
  .refine((d) => d.readySlotCount <= d.slotCount, {
    message: 'readySlotCount must not exceed slotCount',
    path: ['readySlotCount'],
  });
export type ProjectDoc = z.infer<typeof ProjectDocSchema>;

/** What the dashboard lists per project (IndexedDB and Firestore alike). */
export const ProjectSummarySchema = ProjectSummaryFieldsSchema.extend({
  id: z.string().min(1),
  title: z.string(),
  format: FormatSchema,
  styleId: z.string().min(1),
  durationMs: z.number().int().positive(),
  createdAt: IntMsSchema,
  updatedAt: IntMsSchema,
}).refine((d) => d.readySlotCount <= d.slotCount, {
  message: 'readySlotCount must not exceed slotCount',
  path: ['readySlotCount'],
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
