import { z } from 'zod';
import { ComponentTypeSchema } from './components';
import { StylePackIdSchema } from './styles';
import { DirectorSkillIdSchema, DirectionSchema } from './skills';
import { FormatPresetSchema } from './format';

export const SceneSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  order: z.number().int().min(0),
  component: ComponentTypeSchema,
  stylePack: StylePackIdSchema,
  skill: DirectorSkillIdSchema,
  format: FormatPresetSchema,
  duration: z.number().positive().min(1).max(30),
  props: z.record(z.any()), // validated against component-specific schema
  direction: DirectionSchema,
  versionIds: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Scene = z.infer<typeof SceneSchema>;

export const SceneVersionSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  props: z.record(z.any()),
  direction: DirectionSchema,
  createdBy: z.enum(['ai', 'user']),
  message: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type SceneVersion = z.infer<typeof SceneVersionSchema>;

export const SceneGenerationRequestSchema = z.object({
  prompt: z.string().min(1),
  projectId: z.string().optional(),
  data: z.record(z.any()).optional(),
  assets: z.array(z.object({
    type: z.enum(['image', 'csv', 'logo']),
    url: z.string().url(),
  })).optional(),
  preferences: z.object({
    component: ComponentTypeSchema.optional(),
    stylePack: StylePackIdSchema.optional(),
    skill: DirectorSkillIdSchema.optional(),
    duration: z.number().positive().optional(),
  }).optional(),
});

export type SceneGenerationRequest = z.infer<typeof SceneGenerationRequestSchema>;

export const ScenePlanSchema = z.object({
  component: ComponentTypeSchema,
  skill: DirectorSkillIdSchema,
  stylePack: StylePackIdSchema,
  duration: z.number().positive(),
  reasoning: z.string(),
});

export type ScenePlan = z.infer<typeof ScenePlanSchema>;

export const SceneRefinementRequestSchema = z.object({
  sceneId: z.string(),
  instruction: z.string().min(1),
  lockElements: z.array(z.string()).optional(),
});

export type SceneRefinementRequest = z.infer<typeof SceneRefinementRequestSchema>;
