import { describe, expect, it } from 'vitest';
import { LOOKS } from './looks';
import { contrast, readable, themedLook, turnHue } from './theme';

describe('reel theme (spec 37 R2.2)', () => {
  it('leaves the house looks alone without a theme', () => {
    expect(themedLook(LOOKS.mono, undefined)).toBe(LOOKS.mono);
    expect(themedLook(LOOKS.cream, undefined)).toBe(LOOKS.cream);
  });

  it('mono’s house accent is its ink (templates draw pal.accent for both looks)', () => {
    for (const pal of Object.values(LOOKS.mono.palettes)) expect(pal.accent).toBe(pal.ink);
  });

  it('pushes both colours to 3:1 on every background and adds the gradient', () => {
    for (const look of [LOOKS.mono, LOOKS.cream]) {
      for (const accent of ['#FFE600', '#101010', '#FF5A36', '#7C5CFF']) {
        const t = themedLook(look, { accent, background: 'bold' });
        for (const pal of Object.values(t.palettes)) {
          expect(contrast(pal.accent, pal.bg)).toBeGreaterThanOrEqual(3);
          expect(contrast(pal.accent2!, pal.bg)).toBeGreaterThanOrEqual(3);
          expect(pal.themed).toBe(true);
          expect(pal.bgLayers?.length).toBe(3);
        }
      }
    }
  });

  it('keeps mono labels readable and plain themes flat', () => {
    const t = themedLook(LOOKS.mono, { accent: '#FFE600', background: 'plain' });
    for (const pal of Object.values(t.palettes)) {
      expect(contrast(pal.card, pal.cardInk)).toBeGreaterThanOrEqual(4.5);
      expect(pal.bgLayers).toBeUndefined();
    }
  });

  it('readable and turnHue return valid colours', () => {
    expect(readable('#FFFFFF', '#FFFFFF', 3)).toMatch(/^#[0-9A-F]{6}$/);
    expect(contrast(readable('#FFFFFF', '#FFFFFF', 3), '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(turnHue('#FF0000', 120)).toBe('#00FF00');
    expect(turnHue('#808080', 90)).toBe('#808080');
  });
});
