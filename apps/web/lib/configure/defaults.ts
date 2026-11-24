import { builtInSkills, styleFor, type BuiltInRecipeId } from '@motionpop/ai';
import { looks } from '@motionpop/motion';
import type { EditConfig, RecipeId, ReelCaptionStyle } from '@motionpop/schemas';
import type { JobKind } from '../pipeline/eta';

/**
 * The configure screen's starting choices (spec 39 R2.5, R3.7) and the rules that keep them
 * consistent when the recipe changes (a style belongs to its recipe, review fix #24).
 */

export const DEFAULT_RECIPE: BuiltInRecipeId = 'tech-explainer';

/** Voiceover looks offered for audio and script inputs, in gallery order. */
export const VOICEOVER_LOOKS: readonly { id: string; name: string }[] = [
  'editorial-explainer',
  'studio-light',
  'newsprint',
  'editorial-cream',
  'creator-dark',
  'keynote-clean',
  'field-notes',
  'paper-collage',
]
  .filter((id) => id in looks)
  .map((id) => ({ id, name: looks[id]!.name }));

const isVoiceoverLook = (id: string | undefined): id is string =>
  !!id && VOICEOVER_LOOKS.some((l) => l.id === id);

/** The recipe whose skill drives a choice set (a custom recipe borrows its resolved one). */
export function recipeOf(edit: Pick<EditConfig, 'recipeId' | 'resolved'>): BuiltInRecipeId {
  if (edit.recipeId !== 'custom') return edit.recipeId;
  return edit.resolved?.recipeId ?? DEFAULT_RECIPE;
}

/** Choices for a fresh take. `lookHint` is the `?style=` a Try-a-look card carried. */
export function defaultEdit(
  kind: JobKind,
  opts: { recipeId?: RecipeId; source?: string; lookHint?: string } = {},
): EditConfig {
  return withRecipe(
    {
      v: 1,
      recipeId: DEFAULT_RECIPE,
      styleId: '',
      hookStyle: 'headline',
      captions: { enabled: true, style: 'seam' },
      cta: { enabled: true },
      sound: { cleanup: opts.source !== 'tts', sfx: true, music: 'auto' },
      illustrations: kind === 'video',
    },
    kind,
    opts.recipeId ?? DEFAULT_RECIPE,
    opts.lookHint,
  );
}

/** Switches recipe: the style, hook, caption style and CTA follow the recipe's defaults. */
export function withRecipe(
  edit: EditConfig,
  kind: JobKind,
  recipeId: RecipeId,
  lookHint?: string,
): EditConfig {
  const skill = builtInSkills.recipe(recipeOf({ recipeId, resolved: edit.resolved }));
  if (!skill) return { ...edit, recipeId };
  if (kind === 'video') {
    const style = styleFor(recipeId, lookHint ?? '');
    return {
      ...edit,
      recipeId,
      styleId: style.id,
      hookStyle: skill.defaults.hookStyle,
      captions: { ...edit.captions, style: style.captionStyle },
      cta: { ...edit.cta, enabled: skill.defaults.ctaEnabled },
    };
  }
  const look = isVoiceoverLook(lookHint) ? lookHint : skill.defaults.voiceoverLook;
  return {
    ...edit,
    recipeId,
    styleId: look,
    captions: { ...edit.captions, style: VOICEOVER_CAPTION_DEFAULT },
    cta: { enabled: false },
  };
}

/** Voiceover captions start as the Pop preset (DEFAULT_CAPTIONS). */
const VOICEOVER_CAPTION_DEFAULT: ReelCaptionStyle = 'pop';

/** Picks a style of the current recipe (video) and takes its caption style along. */
export function withStyle(edit: EditConfig, kind: JobKind, styleId: string): EditConfig {
  if (kind !== 'video') return { ...edit, styleId, customStyle: undefined };
  const style = styleFor(edit.recipeId, styleId);
  return {
    ...edit,
    styleId: style.id,
    customStyle: undefined,
    captions: { ...edit.captions, style: style.captionStyle },
  };
}
