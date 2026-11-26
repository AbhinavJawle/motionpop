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

/**
 * Compact, content-authentic preview descriptor for project thumbnails (spec 41): carries the
 * project's real video frame reference, opening reel/motion graphic copy, and palette so every
 * card across the dashboard, editor sidebar and export modal shows what is actually inside.
 */
export const ProjectPreviewSchema = z.object({
  kind: z.enum(['reel', 'video', 'motion']),
  /** Source video ref in `AudioStore` (`idb:…` or Storage path) for lazy frame extraction. */
  videoSrc: z.string().min(1).max(300).optional(),
  /** First non-cut millisecond in the source video so extracted frames skip leading cuts. */
  videoAtMs: IntMsSchema.optional(),
  /** Compact JPEG keyframe data URL when already captured at upload/probe time. */
  videoPoster: z.string().max(120_000).optional(),
  reelLook: z.enum(['mono', 'cream']).optional(),
  reelLayout: z.enum(['split', 'card', 'pip', 'full', 'speaker']).optional(),
  reelSceneCount: z.number().int().nonnegative().optional(),
  /** Hero template or scene id (e.g. `headline`, `counter`, `stat-punch`, `versus`, `map-zoom`). */
  heroKind: z.string().max(40).optional(),
  kicker: z.string().max(80).optional(),
  headline: z.string().max(140).optional(),
  subline: z.string().max(140).optional(),
  items: z.array(z.string().max(64)).max(4).optional(),
  excerpt: z.string().max(140).optional(),
  /** `[bg, ink, accent]` hex colours of the project's actual look or reel theme. */
  palette: z.tuple([z.string().max(24), z.string().max(24), z.string().max(24)]).optional(),
  /** Image asset ref (`idb:…`, Storage path or data URL) for photo/image-led scenes. */
  imageSrc: z.string().max(300).optional(),
});
export type ProjectPreview = z.infer<typeof ProjectPreviewSchema>;

/** The summary fields every list shows, computed from the project (no sub-document reads). */
export const ProjectSummaryFieldsSchema = z.object({
  status: ProjectStatusSchema,
  slotCount: z.number().int().nonnegative(),
  readySlotCount: z.number().int().nonnegative(),
  slotStates: z.array(z.enum(['ready', 'pending'])).max(SLOT_STATES_MAX),
  graphicsGenerated: z.number().int().nonnegative(),
  poster: PosterSchema.optional(),
  preview: ProjectPreviewSchema.optional(),
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
