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
  'paper-collage',
  'apple-keynote',
  'kinetic-lime',
  'risograph-zine',
  'blueprint-schematic',
  'studio-light',
  'newsprint',
  'editorial-cream',
  'creator-dark',
  'keynote-clean',
  'field-notes',
]
  .filter((id) => id in looks)
  .map((id) => ({ id, name: looks[id]!.name }));

/** Motion graphic looks with Paper Collage / Vox, Apple Keynote, Kinetic Lime & Riso featured first. */
export const GRAPHIC_LOOKS: readonly { id: string; name: string }[] = [
  'paper-collage',
  'apple-keynote',
  'kinetic-lime',
  'risograph-zine',
  'blueprint-schematic',
  'newsprint',
  'creator-dark',
  'editorial-explainer',
  'editorial-cream',
  'studio-light',
  'field-notes',
  'keynote-clean',
]
  .filter((id) => id in looks)
  .map((id) => ({ id, name: looks[id]!.name }));

const isVoiceoverLook = (id: string | undefined): id is string =>
  !!id && VOICEOVER_LOOKS.some((l) => l.id === id);

/** Pick the strongest starting look for a motion-graphic prompt. */
export function inferGraphicLook(promptHint?: string): string {
  const s = (promptHint ?? '').toLowerCase();
  if (/\b(apple|keynote|notch|macos|macbook|iphone)\b/.test(s)) return 'apple-keynote';
  if (/\b(kinetic|lime|showreel|anti-ppt|colorblock)\b/.test(s)) return 'kinetic-lime';
  if (/\b(risograph|riso|zine|overprint)\b/.test(s)) return 'risograph-zine';
  if (/\b(blueprint|schematic|3b1b|3blue1brown|architecture|diagram)\b/.test(s))
    return 'blueprint-schematic';
  if (/\b(vox|collage|paper|cutout|scrapbook|documentary|magazine)\b/.test(s)) return 'paper-collage';
  if (/\b(newsprint|newspaper|bloomberg|financial|economist|wsj|nyt|press)\b/.test(s))
    return 'newsprint';
  if (/\b(dark|neon|cyber|terminal|futuristic|midnight|hud|glitch)\b/.test(s)) return 'creator-dark';
  if (/\b(swiss|minimal|clean|monochrome|geist)\b/.test(s)) return 'studio-light';
  if (/\b(cream|warm|vintage|book|history|essay)\b/.test(s)) return 'editorial-cream';
  return 'paper-collage';
}

/** The recipe whose skill drives a choice set (a custom recipe borrows its resolved one). */
export function recipeOf(edit: Pick<EditConfig, 'recipeId' | 'resolved'>): BuiltInRecipeId {
  if (edit.recipeId !== 'custom') return edit.recipeId;
  return edit.resolved?.recipeId ?? DEFAULT_RECIPE;
}

/** Choices for a fresh take. `lookHint` is the `?style=` a Try-a-look card carried. */
export function defaultEdit(
  kind: JobKind,
  opts: { recipeId?: RecipeId; source?: string; lookHint?: string; promptHint?: string } = {},
): EditConfig {
  const lookHint =
    opts.lookHint ?? (kind === 'graphic' ? inferGraphicLook(opts.promptHint) : undefined);
  return withRecipe(
    {
      v: 1,
      recipeId: DEFAULT_RECIPE,
      styleId: '',
      hookStyle: 'headline',
      captions: { enabled: kind !== 'graphic', style: 'seam' },
      cta: { enabled: kind === 'video' },
      sound: {
        cleanup: kind !== 'graphic' && opts.source !== 'tts',
        sfx: kind !== 'graphic',
        music: kind === 'graphic' ? 'none' : 'auto',
      },
      illustrations: kind === 'video' || kind === 'graphic',
    },
    kind,
    opts.recipeId ?? DEFAULT_RECIPE,
    lookHint,
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
  if (kind === 'graphic') {
    const look = isVoiceoverLook(lookHint)
      ? lookHint
      : isVoiceoverLook(edit.styleId)
        ? edit.styleId
        : skill.defaults.voiceoverLook;
    return {
      ...edit,
      recipeId,
      styleId: look,
      captions: { enabled: false, style: VOICEOVER_CAPTION_DEFAULT },
      cta: { enabled: false },
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
