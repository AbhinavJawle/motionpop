import { describe, expect, it } from 'vitest';
import {
  EditConfigSchema,
  EditorProjectSchema,
  PendingIntakeSchema,
  ReelPlanSchema,
  ResolvedRecipeSchema,
} from './index';

const config = {
  v: 1,
  recipeId: 'tech-explainer',
  styleId: 'mono-grid',
  hookStyle: 'headline',
  captions: { enabled: true, style: 'seam' },
  cta: { enabled: false },
  sound: { cleanup: true, sfx: true, music: 'auto' },
  illustrations: true,
};

const resolved = {
  recipeId: 'gaming',
  look: 'mono',
  theme: { accent: '#ff3d81', accent2: '#22d3ee', background: 'bold' },
  captionStyle: 'boxed',
  hookStyle: 'stat',
  musicMood: 'upbeat',
  directorNotes: 'Fast cuts, loud numbers.',
};

const reelPlan = {
  v: 1,
  look: 'mono',
  scenes: [
    {
      id: 's1',
      startMs: 0,
      endMs: 3000,
      layout: 'split',
      content: { template: 'headline', title: 'Hi' },
    },
  ],
};

const oldProject = {
  schemaVersion: 1,
  id: 'p1',
  title: 'Demo',
  format: '16:9',
  fps: 30,
  styleId: 'clean',
  durationMs: 20_000,
  voiceover: { src: 'voice.wav', durationMs: 20_000 },
  transcript: {
    words: [{ i: 0, text: 'hi', startMs: 0, endMs: 800, conf: 0.9, filler: false }],
    language: 'en',
    ranOn: 'cloud',
    timingQuality: 'word',
    cleaned: true,
  },
  slots: [],
  versions: [],
  createdAt: 1,
  updatedAt: 2,
};

describe('EditConfig (spec 39 R2.10)', () => {
  it('parses a valid config', () => {
    expect(EditConfigSchema.safeParse(config).success).toBe(true);
  });

  it('parses a custom recipe with a resolved recipe', () => {
    const parsed = EditConfigSchema.safeParse({
      ...config,
      recipeId: 'custom',
      customRecipe: 'Loud gaming recap',
      customStyle: 'neon pink',
      cta: { enabled: true, text: 'Comment LINK' },
      resolved,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects extra keys (strict)', () => {
    expect(EditConfigSchema.safeParse({ ...config, extra: 1 }).success).toBe(false);
  });

  it('rejects a custom recipe over 300 characters', () => {
    expect(EditConfigSchema.safeParse({ ...config, customRecipe: 'x'.repeat(300) }).success).toBe(
      true,
    );
    expect(EditConfigSchema.safeParse({ ...config, customRecipe: 'x'.repeat(301) }).success).toBe(
      false,
    );
  });

  it('rejects unknown recipe, hook, caption and music values', () => {
    expect(EditConfigSchema.safeParse({ ...config, recipeId: 'vlog' }).success).toBe(false);
    expect(EditConfigSchema.safeParse({ ...config, hookStyle: 'loud' }).success).toBe(false);
    expect(
      EditConfigSchema.safeParse({ ...config, captions: { enabled: true, style: 'neon' } }).success,
    ).toBe(false);
    expect(
      EditConfigSchema.safeParse({ ...config, sound: { cleanup: true, sfx: true, music: 'jazz' } })
        .success,
    ).toBe(false);
  });
});

describe('ResolvedRecipe', () => {
  it('parses a resolved recipe', () => {
    expect(ResolvedRecipeSchema.safeParse(resolved).success).toBe(true);
  });

  it('cannot resolve to custom or auto music', () => {
    expect(ResolvedRecipeSchema.safeParse({ ...resolved, recipeId: 'custom' }).success).toBe(false);
    expect(ResolvedRecipeSchema.safeParse({ ...resolved, musicMood: 'auto' }).success).toBe(false);
  });

  it('rejects extra keys and notes over 400 characters', () => {
    expect(ResolvedRecipeSchema.safeParse({ ...resolved, extra: 1 }).success).toBe(false);
    expect(
      ResolvedRecipeSchema.safeParse({ ...resolved, directorNotes: 'x'.repeat(401) }).success,
    ).toBe(false);
  });
});

describe('ReelPlan caption and hook style', () => {
  it('parses with and without captionStyle / hookStyle', () => {
    const bare = ReelPlanSchema.parse(reelPlan);
    expect(bare.captionStyle).toBeUndefined();
    expect(bare.hookStyle).toBeUndefined();
    const styled = ReelPlanSchema.parse({ ...reelPlan, captionStyle: 'clean', hookStyle: 'stat' });
    expect(styled.captionStyle).toBe('clean');
    expect(styled.hookStyle).toBe('stat');
    expect(ReelPlanSchema.safeParse({ ...reelPlan, captionStyle: 'neon' }).success).toBe(false);
  });
});

describe('EditorProject.edit', () => {
  it('parses an old project without edit', () => {
    const parsed = EditorProjectSchema.parse(oldProject);
    expect(parsed.edit).toBeUndefined();
  });

  it('keeps edit when present', () => {
    const parsed = EditorProjectSchema.parse({ ...oldProject, edit: config });
    expect(parsed.edit?.recipeId).toBe('tech-explainer');
  });
});

describe('PendingIntake without a ref (scripts)', () => {
  const base = { name: 'Script', cleanup: false };
  const tts = { voiceId: 'v1', speed: 1, script: 'Hello there.' };

  it('accepts a tts script without a ref', () => {
    expect(PendingIntakeSchema.safeParse({ ...base, source: 'tts', tts }).success).toBe(true);
  });

  it('rejects a tts intake without a ref and with an empty script', () => {
    expect(
      PendingIntakeSchema.safeParse({ ...base, source: 'tts', tts: { ...tts, script: '  ' } })
        .success,
    ).toBe(false);
    expect(PendingIntakeSchema.safeParse({ ...base, source: 'tts' }).success).toBe(false);
  });

  it('rejects an upload without a ref', () => {
    expect(PendingIntakeSchema.safeParse({ ...base, source: 'upload' }).success).toBe(false);
  });

  it('accepts an upload with a ref', () => {
    expect(
      PendingIntakeSchema.safeParse({ ...base, source: 'upload', ref: 'idb:abc' }).success,
    ).toBe(true);
  });
});
