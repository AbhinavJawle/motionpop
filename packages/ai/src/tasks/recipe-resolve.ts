import { z } from 'zod';
import {
  MusicMoodSchema,
  RecipeIdSchema,
  ReelCaptionStyleSchema,
  ReelHookStyleSchema,
  ReelLookSchema,
  ResolvedRecipeSchema,
  type MusicMood,
  type ReelTheme,
  type ResolvedRecipe,
} from '@motionpop/schemas';
import {
  DIRECTOR_NOTES_MAX,
  RECIPE_RESOLVE_SYSTEM_V1,
  recipeResolvePromptV1,
} from '../prompts/recipe-resolve.v1';
import type { Router, TaskDef } from '../router';
import { RECIPES, type BuiltInRecipeId } from '../skills/recipes';
import { styleFor } from '../skills/registry';

/** The longest creator text the task takes (spec 39 §4). */
export const RECIPE_TEXT_MAX = 300;

export const RecipeResolveInputSchema = z.object({
  recipeId: RecipeIdSchema,
  recipeText: z.string().max(RECIPE_TEXT_MAX).optional(),
  styleText: z.string().max(RECIPE_TEXT_MAX).optional(),
  kind: z.enum(['video', 'voiceover']),
});
export type RecipeResolveInput = z.infer<typeof RecipeResolveInputSchema>;

const MOODS = MusicMoodSchema.options.filter((m) => m !== 'auto');
const HEX = '^#[0-9a-fA-F]{6}$';

/**
 * Structured-output schema, written by hand (no `additionalProperties`, no `default`, which the
 * cloud validator rejects); zod validates the answer again.
 */
export function recipeResolveJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      recipeId: { type: 'string', enum: RECIPES.map((r) => r.id) },
      look: { type: 'string', enum: [...ReelLookSchema.options] },
      theme: {
        type: 'object',
        properties: {
          accent: { type: 'string', pattern: HEX },
          accent2: { type: 'string', pattern: HEX },
          background: { type: 'string', enum: ['plain', 'soft', 'bold'] },
        },
        required: ['accent', 'background'],
      },
      captionStyle: { type: 'string', enum: [...ReelCaptionStyleSchema.options] },
      hookStyle: { type: 'string', enum: [...ReelHookStyleSchema.options] },
      musicMood: { type: 'string', enum: MOODS },
      // Capped like the zod field: an uncapped string can run away (spec 39 AI QA).
      directorNotes: { type: 'string', maxLength: 400 },
    },
    required: [
      'recipeId',
      'look',
      'theme',
      'captionStyle',
      'hookStyle',
      'musicMood',
      'directorNotes',
    ],
  };
}

/**
 * `recipe.resolve`: the creator's own words become a validated recipe + style. On the device only
 * and free (review #1: no unmetered cloud path); without the device model the app uses
 * `resolveByKeywords`.
 */
export const recipeResolveTask: TaskDef<RecipeResolveInput, ResolvedRecipe> = {
  id: 'recipe.resolve',
  maxOutputTokens: 300,
  cacheable: true,
  promptVersion: 'v1',
  input: RecipeResolveInputSchema,
  output: ResolvedRecipeSchema,
  mode: () => 'ONLY_ON_DEVICE',
  model: (cfg) => cfg.modelFast,
  system: RECIPE_RESOLVE_SYSTEM_V1,
  prompt: recipeResolvePromptV1,
  jsonSchema: recipeResolveJsonSchema,
  cloudCost: () => 0,
  cloudFallback: false,
  thinking: 'MINIMAL',
};

// ---------------------------------------------------------------------------------------------
// The keyword resolver: pure, always valid, no model.
// ---------------------------------------------------------------------------------------------

const COLOURS: Readonly<Record<string, string>> = {
  red: '#EF4444',
  orange: '#F97316',
  yellow: '#FACC15',
  green: '#22C55E',
  teal: '#14B8A6',
  cyan: '#22D3EE',
  blue: '#3B82F6',
  purple: '#8B5CF6',
  pink: '#EC4899',
  black: '#111111',
  white: '#FFFFFF',
};
const DARK_WORDS = new Set(['dark', 'neon', 'night']);
const WARM_WORDS = new Set(['warm', 'paper', 'cream', 'editorial']);
const MOOD_WORDS: readonly (readonly [Exclude<MusicMood, 'auto' | 'none'>, readonly string[]])[] = [
  ['lofi', ['lofi', 'chill']],
  ['upbeat', ['hype', 'energetic', 'fast']],
  ['dramatic', ['epic', 'cinematic', 'serious']],
  ['minimal-tech', ['minimal', 'tech']],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lower-case words; "lo-fi" is read as "lofi". */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/lo[-\s]fi/g, 'lofi')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** How many of a recipe's keywords the text names (a plural counts; "hot take" is a phrase). */
function keywordScore(text: string, keywords: readonly string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const k of keywords) {
    if (new RegExp(`(^|[^a-z0-9])${escapeRe(k)}(s|es)?([^a-z0-9]|$)`).test(lower)) score++;
  }
  return score;
}

function pickRecipe(text: string, given: BuiltInRecipeId | 'custom'): BuiltInRecipeId {
  const fallback: BuiltInRecipeId = given === 'custom' ? 'tech-explainer' : given;
  let best = 0;
  let winners: BuiltInRecipeId[] = [];
  for (const r of RECIPES) {
    const s = keywordScore(text, r.keywords);
    if (s > best) {
      best = s;
      winners = [r.id];
    } else if (s === best && s > 0) winners.push(r.id);
  }
  if (winners.length === 0) return fallback;
  return winners.includes(fallback) ? fallback : (winners[0] ?? fallback);
}

function joinNotes(parts: (string | undefined)[]): string {
  const texts = parts.map((p) => (p ?? '').trim()).filter(Boolean);
  const joined = texts.map((t, i) => (i < texts.length - 1 && !/[.!?]$/.test(t) ? `${t}.` : t));
  return joined.join(' ').slice(0, DIRECTOR_NOTES_MAX).trim();
}

/**
 * The deterministic fallback of `recipe.resolve` (spec 39 R4.2). Never throws and always returns a
 * value that parses as `ResolvedRecipeSchema`, whatever the text.
 */
export function resolveByKeywords(input: RecipeResolveInput): ResolvedRecipe {
  const recipeText = input.recipeText ?? '';
  const styleText = input.styleText ?? '';
  const recipeId = pickRecipe(`${recipeText} ${styleText}`, input.recipeId);
  const recipe = RECIPES.find((r) => r.id === recipeId) ?? RECIPES[0];
  if (!recipe) throw new Error('recipe catalogue is empty');
  const base = styleFor(recipeId, recipe.styles[0]?.id ?? '');

  const styleWords = wordsOf(styleText);
  const colour = styleWords.map((w) => COLOURS[w]).find((c) => c !== undefined);
  const dark = styleWords.some((w) => DARK_WORDS.has(w));
  const warm = styleWords.some((w) => WARM_WORDS.has(w));

  const theme: ReelTheme = {
    ...(base.theme ?? { accent: base.swatch[2], background: 'soft' as const }),
  };
  let look = base.look;
  if (warm) {
    look = 'cream';
    theme.background = 'soft';
  }
  if (dark) {
    look = 'mono';
    theme.background = 'bold';
  }
  if (colour) theme.accent = colour;

  const allWords = wordsOf(`${recipeText} ${styleText}`);
  const mood =
    MOOD_WORDS.find(([, words]) => words.some((w) => allWords.includes(w)))?.[0] ??
    recipe.defaults.music;

  return ResolvedRecipeSchema.parse({
    recipeId,
    look,
    theme,
    captionStyle: base.captionStyle,
    hookStyle: recipe.defaults.hookStyle,
    musicMood: mood,
    directorNotes: joinNotes([recipeText, styleText]),
  });
}

export interface ResolveRecipeResult {
  resolved: ResolvedRecipe;
  /** `device`: Gemini Nano answered. `rules`: the keyword resolver ("free · quick match"). */
  ranOn: 'device' | 'rules';
}

/**
 * Resolve the creator's words. Uses the device model through the router when there is one and
 * falls back to the keyword resolver on any failure, so the creator is never blocked (R4.2).
 */
export async function resolveRecipe(
  router: Pick<Router, 'run'> | null,
  input: RecipeResolveInput,
): Promise<ResolveRecipeResult> {
  const hasText = Boolean(input.recipeText?.trim() || input.styleText?.trim());
  if (router && hasText) {
    try {
      const res = await router.run(recipeResolveTask, input, { allowCloud: false });
      return { resolved: res.output, ranOn: 'device' };
    } catch {
      // Falls through to the rules: no model, an invalid answer or a paused router.
    }
  }
  return { resolved: resolveByKeywords(input), ranOn: 'rules' };
}
