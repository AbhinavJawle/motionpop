import { describe, expect, it, vi } from 'vitest';
import { RECIPES } from '../skills/recipes';
import { COMMUNITY_SKILLS } from '../skills/community-skills';
import {
  recommendSetup,
  recommendSetupByKeywords,
  setupRecommendTask,
  SKILL_VIDEO_STYLE,
} from './setup-recommend';

describe('setup.recommend', () => {
  it('maps every community skill to a valid video style inside its baseRecipeId', () => {
    for (const sk of COMMUNITY_SKILLS) {
      const videoStyle = SKILL_VIDEO_STYLE[sk.id];
      expect(videoStyle, sk.id).toBeTruthy();
      const recipe = RECIPES.find((r) => r.id === sk.baseRecipeId);
      expect(recipe, sk.baseRecipeId).toBeTruthy();
      expect(
        recipe!.styles.some((s) => s.id === videoStyle),
        `${sk.id} -> ${videoStyle} in ${sk.baseRecipeId}`,
      ).toBe(true);
    }
  });

  it('picks Financial Data Story & stat hook for finance transcripts', () => {
    const rec = recommendSetupByKeywords({
      transcript:
        'Nvidia grew revenue by 94% to 35 billion last quarter as stock market valuation hit records.',
      kind: 'video',
    });
    expect(rec.confidence).toBe('high');
    expect(rec.skillId).toBe('financial-data-story');
    expect(rec.recipeId).toBe('finance-business');
    expect(rec.styleId).toBe('newsprint-ink');
    expect(rec.hookStyle).toBe('stat');
  });

  it('picks Apple Launch Film for hardware keynote transcripts', () => {
    const rec = recommendSetupByKeywords({
      transcript:
        'Introducing the all-new MacBook Pro with macOS Keynote widgets and a brighter display.',
      kind: 'graphic',
    });
    expect(rec.confidence).toBe('high');
    expect(rec.skillId).toBe('apple-launch-film');
    expect(rec.recipeId).toBe('product-launch');
    expect(rec.styleId).toBe('apple-keynote');
    expect(rec.musicMood).toBe('none');
  });

  it('picks Vox Paper Collage for documentary / geopolitics transcripts', () => {
    const rec = recommendSetupByKeywords({
      transcript:
        'Why did the Roman empire collapse and how did its borders reshape modern geopolitics? Explained.',
      kind: 'voiceover',
    });
    expect(rec.confidence).toBe('high');
    expect(rec.skillId).toBe('vox-paper-collage');
    expect(rec.recipeId).toBe('documentary-explainer');
    expect(rec.styleId).toBe('paper-collage');
  });

  it('picks Blueprint Architectural for distributed systems transcripts', () => {
    const rec = recommendSetupByKeywords({
      transcript:
        'Let us break down Kubernetes system design, microservice architecture, database latency, and caching.',
      kind: 'video',
    });
    expect(rec.confidence).toBe('high');
    expect(rec.skillId).toBe('blueprint-architectural');
    expect(rec.recipeId).toBe('tech-explainer');
    expect(rec.styleId).toBe('midnight-neon');
  });

  it('returns confidence=low for generic dummy text so defaults are not overwritten', () => {
    const rec = recommendSetupByKeywords({
      transcript: 'word0 word1 word2 word3 word4 word5',
      kind: 'voiceover',
    });
    expect(rec.confidence).toBe('low');
    expect(rec.ranOn).toBe('rules');
  });

  it('uses on-device Gemini Nano through the router when available and never allows cloud', async () => {
    const run = vi.fn(async () => ({
      output: {
        recipeId: 'documentary-explainer' as const,
        skillId: 'kurzgesagt-flat-world',
        hookStyle: 'headline' as const,
        musicMood: 'dramatic' as const,
        reason: 'Deep space & black hole explainer suits vivid flat-world cosmos visuals.',
      },
      ranOn: 'device' as const,
      model: 'gemini-nano',
      cached: false,
      latencyMs: 120,
    }));
    const rec = await recommendSetup({ run } as never, {
      transcript: 'What actually happens when you fall past the event horizon of a black hole?',
      kind: 'voiceover',
    });
    expect(run).toHaveBeenCalledWith(
      setupRecommendTask,
      expect.objectContaining({ kind: 'voiceover' }),
      { allowCloud: false },
    );
    expect(rec.ranOn).toBe('device');
    expect(rec.confidence).toBe('high');
    expect(rec.skillId).toBe('kurzgesagt-flat-world');
    expect(rec.recipeId).toBe('documentary-explainer');
    expect(rec.styleId).toBe('creator-dark');
  });

  it('falls back cleanly to keyword rules when on-device router throws', async () => {
    const run = vi.fn(async () => {
      throw new Error('nano unavailable');
    });
    const rec = await recommendSetup({ run } as never, {
      transcript: 'Stop scrolling: 5 mistakes destroying your pitch deck and hot take hooks.',
      kind: 'video',
    });
    expect(rec.ranOn).toBe('rules');
    expect(rec.confidence).toBe('high');
    expect(rec.skillId).toBe('kinetic-reel');
    expect(rec.styleId).toBe('kinetic-lime');
  });
});
