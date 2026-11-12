import { z } from 'zod';

export const DirectorSkillIdSchema = z.enum([
  'shocking-stat-reveal',
  'slow-build-trend',
  'contrast-split',
  'journey-timeline',
  'zoom-world-to-place',
  'countdown-ranking',
  'calm-explanation',
  'brand-sting',
]);

export type DirectorSkillId = z.infer<typeof DirectorSkillIdSchema>;

export const CameraKeyframeSchema = z.object({
  t: z.number().min(0).max(1), // normalized time 0-1
  scale: z.number().positive().default(1),
  x: z.number().default(0),
  y: z.number().default(0),
  rotation: z.number().default(0),
});

export type CameraKeyframe = z.infer<typeof CameraKeyframeSchema>;

export const SoundCueSchema = z.object({
  t: z.number().min(0).max(1), // normalized time
  cue: z.enum(['whoosh', 'pop', 'tick', 'impact-soft', 'impact-hard', 'tension-rise']),
  volume: z.number().min(0).max(1).default(0.7),
});

export type SoundCue = z.infer<typeof SoundCueSchema>;

export const DirectionSchema = z.object({
  camera: z.array(CameraKeyframeSchema).min(1),
  reveal: z.enum(['all-at-once', 'sequential', 'highlight-last', 'build-to-peak']).default('sequential'),
  holdAt: z.number().min(0).max(1).optional(), // normalized time to hold
  holdDuration: z.number().positive().optional(), // in seconds
  sfx: z.array(SoundCueSchema).default([]),
  emphasis: z.object({
    target: z.string().optional(), // which element to emphasize
    style: z.enum(['accent-color', 'scale', 'glow', 'camera-push']).default('accent-color'),
  }).optional(),
});

export type Direction = z.infer<typeof DirectionSchema>;

export const SkillMetadataSchema = z.object({
  name: z.string(),
  id: DirectorSkillIdSchema,
  version: z.string(),
  useWhen: z.string(),
  worksWith: z.array(z.string()),
  energy: z.enum(['low', 'medium', 'high']),
  defaultDuration: z.number().positive(),
  description: z.string(),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
