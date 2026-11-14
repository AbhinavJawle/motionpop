import { StylePackSchema } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { editorialExplainer, parseStylePack, stylePacks, testInverted } from './index';

describe('style packs', () => {
  it('ships editorial-explainer as the only creator-facing pack for now', () => {
    expect(Object.keys(stylePacks)).toEqual(['editorial-explainer']);
    expect(stylePacks['editorial-explainer']).toBe(editorialExplainer);
  });

  it('both packs pass the schema', () => {
    expect(StylePackSchema.safeParse(editorialExplainer).success).toBe(true);
    expect(StylePackSchema.safeParse(testInverted).success).toBe(true);
  });

  it('the test pack really differs in palette and timings', () => {
    expect(testInverted.colors.bg).not.toBe(editorialExplainer.colors.bg);
    expect(testInverted.colors.ink).not.toBe(editorialExplainer.colors.ink);
    expect(testInverted.motion.enterMs).not.toBe(editorialExplainer.motion.enterMs);
    expect(testInverted.motion.enterEase).not.toBe(editorialExplainer.motion.enterEase);
  });

  it('rejects a pack that names an unbundled font', () => {
    const raw = { ...editorialExplainer, fonts: { ...editorialExplainer.fonts, body: 'Inter' } };
    expect(() => parseStylePack(raw)).toThrow(/not bundled/);
  });
});
