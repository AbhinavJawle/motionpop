import { z } from 'zod';
import { ReelCaptionStyleSchema, ReelHookStyleSchema, ReelLookSchema } from './reel';

export const SkillHexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB hex colour');

/**
 * Modular user-created & imported Markdown skills (Spec 43).
 * Stored in Firestore under `users/{uid}/skills/{id}` with browser localStorage cache,
 * and attached as a bounded `UserSkillRef` snapshot onto `EditConfig` so projects keep
 * the exact skill instructions that directed them.
 */

export const USER_SKILL_MAX_MD_CHARS = 16_000;
export const USER_SKILL_INSTRUCTIONS_MAX = 3000;

export const UserSkillTargetSchema = z.enum(['both', 'reel', 'film']);
export type UserSkillTarget = z.infer<typeof UserSkillTargetSchema>;

export const BuiltInRecipeKeySchema = z.enum([
  'tech-explainer',
  'finance-business',
  'gaming',
  'podcast-story',
  'hot-take',
  'product-launch',
  'documentary-explainer',
  'kinetic-promo',
]);
export type BuiltInRecipeKey = z.infer<typeof BuiltInRecipeKeySchema>;

export const SkillCategorySchema = z.enum([
  'editorial',
  'product',
  'kinetic',
  'data',
  'explainer',
  'cinematic',
  'editing',
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const SkillMusicMoodSchema = z.enum([
  'auto',
  'minimal-tech',
  'upbeat',
  'lofi',
  'dramatic',
  'none',
]);

export const UserSkillSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Skill id must be lowercase letters, numbers, - or _'),
    name: z.string().trim().min(2).max(60),
    blurb: z.string().trim().max(180).default('Custom director skill'),
    target: UserSkillTargetSchema.default('both'),
    /** Built-in recipe providing fallback pacing & template defaults for reel directing. */
    baseRecipeId: BuiltInRecipeKeySchema.default('tech-explainer'),
    look: ReelLookSchema.default('mono'),
    accent: SkillHexColorSchema.default('#FF6A3D'),
    captionStyle: ReelCaptionStyleSchema.default('pop'),
    hookStyle: ReelHookStyleSchema.default('headline'),
    music: SkillMusicMoodSchema.default('auto'),
    /** Full Markdown source (`SKILL.md`). */
    markdown: z.string().trim().min(20).max(USER_SKILL_MAX_MD_CHARS),
    /** Optional origin URL (e.g. GitHub `SKILL.md` link). */
    sourceUrl: z.string().trim().url().max(300).optional(),
    /** Optional GitHub repository attribution slug shown on cards (e.g. "tuzhechen2005/opus-video-skills"). */
    repoSlug: z.string().trim().min(3).max(120).optional(),
    /** Optional preview thumbnail path or URL (e.g. "/skills/kinetic-reel.jpg"). */
    thumbnailUrl: z.string().trim().min(1).max(300).optional(),
    /** Optional category tag for filtering in the skill library & configure picker. */
    category: SkillCategorySchema.optional(),
    /** Optional visual look id paired with this skill (e.g. "paper-collage", "kinetic-lime"). */
    lookId: z.string().trim().min(1).max(60).optional(),
    /** True for shared open-source community skills published in Firestore `community_skills`. */
    community: z.boolean().optional(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
export type UserSkill = z.infer<typeof UserSkillSchema>;

/**
 * Compact skill snapshot embedded inside `EditConfig` at project creation time so the
 * director and film builder always have the exact rules without extra DB reads.
 */
export const UserSkillRefSchema = z
  .object({
    id: z.string().trim().min(2).max(64),
    name: z.string().trim().min(2).max(60),
    target: UserSkillTargetSchema,
    instructions: z.string().trim().min(1).max(USER_SKILL_INSTRUCTIONS_MAX),
  })
  .strict();
export type UserSkillRef = z.infer<typeof UserSkillRefSchema>;
