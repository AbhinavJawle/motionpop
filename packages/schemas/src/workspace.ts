import { z } from 'zod';
import { StylePackIdSchema } from './styles';
import { FormatPresetSchema } from './format';

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  plan: z.enum(['free', 'creator', 'pro', 'team']),
  credits: z.number().int().min(0),
  byokKeyRef: z.string().optional(), // encrypted reference, not the key itself
  tasteProfile: z.object({
    pacing: z.enum(['slower', 'normal', 'faster']).default('normal'),
    accentUsage: z.enum(['minimal', 'moderate', 'bold']).default('moderate'),
    camera: z.enum(['static', 'subtle', 'dynamic']).default('subtle'),
  }).default({
    pacing: 'normal',
    accentUsage: 'moderate',
    camera: 'subtle',
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  brandKitId: z.string().optional(),
  stylePackId: StylePackIdSchema,
  formatPreset: FormatPresetSchema,
  pacing: z.enum(['slow', 'normal', 'fast']).default('normal'),
  sceneIds: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const LibraryItemSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  type: z.enum(['scene', 'skill', 'style', 'asset', 'data']),
  name: z.string(),
  tags: z.array(z.string()).default([]),
  isReference: z.boolean().default(false),
  refSceneId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  thumbnailUrl: z.string().url().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type LibraryItem = z.infer<typeof LibraryItemSchema>;

export const RenderJobSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  sceneId: z.string().optional(),
  sequenceId: z.string().optional(),
  format: FormatPresetSchema,
  codec: z.enum(['h264-mp4', 'prores-4444', 'webm-vp9-alpha']),
  quality: z.enum(['1080p', '4K']).default('1080p'),
  fps: z.number().int().positive().default(30),
  status: z.enum(['pending', 'rendering', 'completed', 'failed']),
  progress: z.number().min(0).max(1).default(0),
  outputUrl: z.string().url().optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type RenderJob = z.infer<typeof RenderJobSchema>;
