import { describe, expect, it } from 'vitest';
import {
  REEL_CUSTOM_LIMITS,
  ReelPlanSchema,
  ReelSceneSchema,
  reelCustomSize,
  reelMediaOf,
  setReelMediaAssets,
} from './reel';

const custom = {
  template: 'custom',
  title: 'Snappy flow',
  brief: 'Two steps with icons.',
  html: '<div class="t">Heavy lifting</div>',
  css: '.t { color: var(--ink); }',
  script: 'const tl = mp.timeline(); return tl;',
  keyMomentMs: 700,
  media: [{ kind: 'logo', query: 'Acme|acme.example' }],
} as const;

const scene = (content: unknown, id = 'c1') =>
  ReelSceneSchema.parse({ id, startMs: 0, endMs: 3000, layout: 'split', content });

describe('AI-written reel scenes (spec 30)', () => {
  it('accepts a custom scene and enforces the code limits', () => {
    expect(scene(custom).content.template).toBe('custom');
    expect(() => scene({ ...custom, script: '' })).toThrow();
    expect(() => scene({ ...custom, html: 'x'.repeat(REEL_CUSTOM_LIMITS.html + 1) })).toThrow();
    expect(() => scene({ ...custom, brief: 'x'.repeat(501) })).toThrow();
  });

  it('counts the code of every custom scene in a plan', () => {
    const plan = ReelPlanSchema.parse({
      v: 1,
      look: 'mono',
      scenes: [
        scene(custom, 'a'),
        { ...scene({ template: 'headline', title: 'Hi' }, 'b'), startMs: 3000, endMs: 6000 },
      ],
    });
    expect(reelCustomSize(plan)).toBe(
      custom.html.length + custom.css.length + custom.script.length,
    );
  });

  it('counts the budget in UTF-8 bytes (the project document limit), not characters', () => {
    const plan = ReelPlanSchema.parse({
      v: 1,
      look: 'mono',
      scenes: [scene({ ...custom, html: '漢字', css: '', script: 'é' })],
    });
    expect(reelCustomSize(plan)).toBe(3 * 2 + 2);
  });

  it('its pictures are fetched and attached like any scene picture', () => {
    const plan = ReelPlanSchema.parse({ v: 1, look: 'mono', scenes: [scene(custom)] });
    expect(reelMediaOf(plan)).toEqual([{ kind: 'logo', query: 'Acme|acme.example' }]);
    const withPic = setReelMediaAssets(plan, { 'logo:acme|acme.example': 'img1' });
    expect(withPic.scenes[0]!.content).toMatchObject({ media: [{ asset: 'img1' }] });
  });
});
