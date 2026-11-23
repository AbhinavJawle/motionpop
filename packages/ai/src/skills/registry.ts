// Spec 39 §3: one place to look up recipes, their styles and the voiceover skills.
import type { RecipeId } from '@motionpop/schemas';
import { skillEntry, type SkillEntry } from '../slots/catalogue';
import { RECIPES, type DirectorSkill, type RecipeStyle } from './recipes';

export interface SkillRegistry {
  recipes(): readonly DirectorSkill[];
  recipe(id: RecipeId): DirectorSkill | undefined;
  style(recipeId: RecipeId, styleId: string): RecipeStyle | undefined;
  /** The voiceover skills (`skills/*.md`, catalogue.ts). */
  slotSkill(id: string): SkillEntry | undefined;
}

const byId = new Map<string, DirectorSkill>(RECIPES.map((r) => [r.id, r]));

export const builtInSkills: SkillRegistry = {
  recipes: () => RECIPES,
  recipe: (id) => byId.get(id),
  style: (recipeId, styleId) => byId.get(recipeId)?.styles.find((s) => s.id === styleId),
  slotSkill: (id) => skillEntry(id),
};

/** The recipe `custom` borrows its look from until `recipe.resolve` has answered. */
const FALLBACK_RECIPE_ID = 'tech-explainer';

/**
 * A style that always exists. An unknown style id gives the recipe's first style; `custom` (which
 * has no styles of its own) gives the Tech Explainer's first style (review fix #24).
 */
export function styleFor(recipeId: RecipeId, styleId: string): RecipeStyle {
  const recipe = builtInSkills.recipe(recipeId) ?? builtInSkills.recipe(FALLBACK_RECIPE_ID);
  const first = recipe?.styles[0] ?? RECIPES[0]?.styles[0];
  if (!first) throw new Error('recipe catalogue is empty');
  return recipe?.styles.find((s) => s.id === styleId) ?? first;
}
