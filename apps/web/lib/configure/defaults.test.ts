import { builtInSkills, styleFor } from '@motionpop/ai';
import { looks } from '@motionpop/motion';
import { EditConfigSchema, RecipeIdSchema, type RecipeId } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defaultEdit, recipeOf, VOICEOVER_LOOKS, withRecipe, withStyle } from './defaults';

const kinds = ['video', 'voiceover'] as const;
const recipes = builtInSkills.recipes();

describe('defaultEdit', () => {
  it('parses EditConfigSchema for both kinds and every recipe', () => {
    for (const kind of kinds) {
      for (const recipeId of RecipeIdSchema.options) {
        const edit = defaultEdit(kind, { recipeId });
        expect(EditConfigSchema.safeParse(edit).success, `${kind} ${recipeId}`).toBe(true);
        expect(edit.recipeId).toBe(recipeId);
      }
    }
  });

  it('illustrations default on for video only', () => {
    expect(defaultEdit('video').illustrations).toBe(true);
    expect(defaultEdit('voiceover').illustrations).toBe(false);
  });

  it('a made voice (tts) starts with cleanup off; other sources keep it on', () => {
    expect(defaultEdit('voiceover', { source: 'tts' }).sound.cleanup).toBe(false);
    expect(defaultEdit('voiceover', { source: 'upload' }).sound.cleanup).toBe(true);
    expect(defaultEdit('video').sound.cleanup).toBe(true);
  });

  it('a style hint picks that voiceover look; an unknown hint falls back to the recipe look', () => {
    expect(defaultEdit('voiceover', { lookHint: 'newsprint' }).styleId).toBe('newsprint');
    expect(defaultEdit('voiceover', { lookHint: 'nope' }).styleId).toBe(
      builtInSkills.recipe('tech-explainer')!.defaults.voiceoverLook,
    );
    // the hint means nothing for video
    expect(defaultEdit('video', { lookHint: 'newsprint' }).styleId).toBe(
      styleFor('tech-explainer', '').id,
    );
  });
});

describe('voiceover looks', () => {
  it('every recipe default look is one the picker offers and the engine knows', () => {
    const ids = VOICEOVER_LOOKS.map((l) => l.id);
    for (const r of recipes) {
      expect(ids, r.id).toContain(r.defaults.voiceoverLook);
      expect(looks[r.defaults.voiceoverLook], r.id).toBeDefined();
    }
  });
});

describe('withRecipe', () => {
  it('video: resets the style to the recipe first and takes hook, caption and CTA defaults', () => {
    for (const r of recipes) {
      // start from a different recipe with every choice moved away from the defaults
      const other = recipes.find((o) => o.id !== r.id)!;
      const dirty = {
        ...defaultEdit('video', { recipeId: other.id }),
        styleId: other.styles[other.styles.length - 1]!.id,
        hookStyle: 'cold-open' as const,
        captions: { enabled: false, style: 'clean' as const },
        cta: { enabled: !r.defaults.ctaEnabled, text: 'Comment LINK' },
      };
      const next = withRecipe(dirty, 'video', r.id);
      expect(next.recipeId).toBe(r.id);
      expect(next.styleId).toBe(r.styles[0]!.id);
      expect(next.hookStyle).toBe(r.defaults.hookStyle);
      expect(next.captions).toEqual({ enabled: false, style: r.styles[0]!.captionStyle });
      expect(next.cta).toEqual({ enabled: r.defaults.ctaEnabled, text: 'Comment LINK' });
      expect(EditConfigSchema.safeParse(next).success).toBe(true);
    }
  });

  it('voiceover: takes the recipe look, pop captions, no CTA; keeps the hook and sound choices', () => {
    const base = defaultEdit('voiceover');
    for (const r of recipes) {
      const next = withRecipe(
        { ...base, sound: { cleanup: false, sfx: false, music: 'none' } },
        'voiceover',
        r.id,
      );
      expect(next.styleId).toBe(r.defaults.voiceoverLook);
      expect(next.captions).toEqual({ enabled: true, style: 'pop' });
      expect(next.cta).toEqual({ enabled: false });
      expect(next.sound).toEqual({ cleanup: false, sfx: false, music: 'none' });
    }
  });

  it('custom borrows the resolved recipe, or Tech Explainer without one', () => {
    const base = defaultEdit('video');
    expect(recipeOf({ recipeId: 'custom', resolved: undefined })).toBe('tech-explainer');
    expect(recipeOf({ recipeId: 'gaming', resolved: undefined })).toBe('gaming');
    const resolved = {
      recipeId: 'hot-take' as const,
      look: 'mono' as const,
      theme: { accent: '#FF2D95', background: 'bold' as const },
      captionStyle: 'boxed' as const,
      hookStyle: 'stat' as const,
      musicMood: 'upbeat' as const,
      directorNotes: '',
    };
    const next = withRecipe({ ...base, resolved }, 'video', 'custom');
    expect(next.recipeId).toBe('custom');
    expect(next.hookStyle).toBe(builtInSkills.recipe('hot-take')!.defaults.hookStyle);
    expect(EditConfigSchema.safeParse(next).success).toBe(true);
  });
});

describe('withStyle', () => {
  it('video: picks the style, takes its caption style and clears the custom style', () => {
    const r = builtInSkills.recipe('tech-explainer')!;
    const start = { ...defaultEdit('video'), customStyle: 'dark and neon' };
    for (const s of r.styles) {
      const next = withStyle(start, 'video', s.id);
      expect(next.styleId).toBe(s.id);
      expect(next.captions.style).toBe(s.captionStyle);
      expect(next.customStyle).toBeUndefined();
      expect(next.captions.enabled).toBe(start.captions.enabled);
    }
  });

  it('video: an id of another recipe falls back to the recipe first style', () => {
    const next = withStyle(defaultEdit('video'), 'video', 'newsprint-ink');
    expect(next.styleId).toBe(builtInSkills.recipe('tech-explainer')!.styles[0]!.id);
  });

  it('voiceover: sets the look, keeps the captions and clears the custom style', () => {
    const start = { ...defaultEdit('voiceover'), customStyle: 'warm paper' };
    const next = withStyle(start, 'voiceover', 'newsprint');
    expect(next.styleId).toBe('newsprint');
    expect(next.customStyle).toBeUndefined();
    expect(next.captions).toEqual(start.captions);
  });
});

describe('property: any sequence of withRecipe / withStyle stays valid', () => {
  const recipeArb = fc.constantFrom<RecipeId>(...RecipeIdSchema.options);
  const styleIds = [
    ...recipes.flatMap((r) => r.styles.map((s) => s.id)),
    ...VOICEOVER_LOOKS.map((l) => l.id),
    'unknown-style',
  ];
  const stepArb = fc.oneof(
    fc.record({ t: fc.constant('recipe' as const), id: recipeArb }),
    fc.record({ t: fc.constant('style' as const), id: fc.constantFrom(...styleIds) }),
  );

  it('keeps EditConfigSchema valid and the style consistent with the recipe', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...kinds),
        recipeArb,
        fc.array(stepArb, { maxLength: 12 }),
        (kind, start, steps) => {
          let edit = defaultEdit(kind, { recipeId: start });
          for (const s of steps) {
            edit =
              s.t === 'recipe'
                ? withRecipe(edit, kind, s.id as RecipeId)
                : withStyle(edit, kind, s.id);
            expect(EditConfigSchema.safeParse(edit).success).toBe(true);
            if (kind === 'video') {
              const r = builtInSkills.recipe(recipeOf(edit))!;
              expect(r.styles.some((x) => x.id === edit.styleId)).toBe(true);
            } else if (s.t === 'recipe') {
              expect(edit.cta.enabled).toBe(false);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
