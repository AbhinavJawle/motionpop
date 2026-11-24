import { z } from 'zod';
import {
  ReelCaptionStyleSchema,
  ReelHookStyleSchema,
  ReelLookSchema,
  ReelThemeSchema,
} from './reel';
import { UserSkillRefSchema } from './skill';

/**
 * What the creator chose on the configure screen (spec 39 §2.1). `ReelCaptionStyleSchema` and
 * `ReelHookStyleSchema` live in `./reel` (the plan uses them too) and are exported from there.
 */
export const RecipeIdSchema = z.enum([
  'tech-explainer',
  'finance-business',
  'gaming',
  'podcast-story',
  'hot-take',
  'custom',
]);
export type RecipeId = z.infer<typeof RecipeIdSchema>;

export const MusicMoodSchema = z.enum([
  'auto',
  'minimal-tech',
  'upbeat',
  'lofi',
  'dramatic',
  'none',
]);
export type MusicMood = z.infer<typeof MusicMoodSchema>;

/** What `recipe.resolve` made of the creator's own words (spec 39 R4). */
export const ResolvedRecipeSchema = z
  .object({
    recipeId: RecipeIdSchema.exclude(['custom']),
    look: ReelLookSchema,
    theme: ReelThemeSchema,
    captionStyle: ReelCaptionStyleSchema,
    hookStyle: ReelHookStyleSchema,
    musicMood: MusicMoodSchema.exclude(['auto']),
    directorNotes: z.string().trim().max(400),
  })
  .strict();
export type ResolvedRecipe = z.infer<typeof ResolvedRecipeSchema>;

export const EditConfigSchema = z
  .object({
    v: z.literal(1),
    recipeId: RecipeIdSchema,
    /** The creator's own words ("Describe your own…"), at most 300 characters. */
    customRecipe: z.string().trim().max(300).optional(),
    /** A recipe style id, or a voiceover look id. */
    styleId: z.string().min(1).max(60),
    customStyle: z.string().trim().max(300).optional(),
    hookStyle: ReelHookStyleSchema,
    captions: z.object({ enabled: z.boolean(), style: ReelCaptionStyleSchema }),
    cta: z.object({ enabled: z.boolean(), text: z.string().trim().max(40).optional() }),
    sound: z.object({ cleanup: z.boolean(), sfx: z.boolean(), music: MusicMoodSchema }),
    illustrations: z.boolean(),
    /** What `recipe.resolve` made of the custom text (spec 39 R4). */
    resolved: ResolvedRecipeSchema.optional(),
    /** Optional modular user skill selected on `/start/configure` (spec 43). */
    userSkill: UserSkillRefSchema.optional(),
  })
  .strict();
export type EditConfig = z.infer<typeof EditConfigSchema>;
