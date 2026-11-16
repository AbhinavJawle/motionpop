import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BrandSchema, brandColourIssue, lighten, readableOn } from './brand';
import { contrastRatio } from './color';

const hex = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, '0')}`);

describe('brand kit', () => {
  it('takes #RRGGBB accents only, nothing else', () => {
    expect(BrandSchema.safeParse({ accent: '#1E5AA8' }).success).toBe(true);
    expect(BrandSchema.safeParse({ accent: '#1E5AA8', accent2: '#ff0000' }).success).toBe(true);
    expect(BrandSchema.safeParse({ accent: 'red' }).success).toBe(false);
    expect(BrandSchema.safeParse({ accent: '#123' }).success).toBe(false);
    expect(BrandSchema.safeParse({ accent: '#123456', logo: 'x' }).success).toBe(false);
  });

  it('contrast is 21 for black on white, 1 for a colour on itself, and symmetric', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    fc.assert(
      fc.property(hex, hex, (a, b) => {
        expect(contrastRatio(a, a)).toBeCloseTo(1, 9);
        expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 9);
      }),
    );
  });

  it('flags a colour too close to the background, accepts a deep one', () => {
    expect(brandColourIssue('#F7F0D8', '#F2EDE4')).not.toBeNull();
    expect(brandColourIssue('#1E5AA8', '#F2EDE4')).toBeNull();
  });

  it('accepts every shipped look accent on its own background', () => {
    for (const [accent, bg] of [
      ['#FF7A3D', '#F2EDE4'],
      ['#D62A1C', '#ECE4D2'],
      ['#D96648', '#DFCDB7'],
      ['#8B7CFF', '#F2EDE4'],
      ['#1E5AA8', '#ECE4D2'],
      ['#5E7F6A', '#DFCDB7'],
    ] as const)
      expect(brandColourIssue(accent, bg), accent).toBeNull();
  });

  it('property: readableOn always reaches the contrast it promises on dark boxes', () => {
    fc.assert(
      fc.property(hex, (c) => {
        expect(contrastRatio(readableOn(c, '#3e3e40'), '#3e3e40')).toBeGreaterThanOrEqual(4.5);
        expect(lighten(c, 1)).toBe('#ffffff');
        expect(lighten(c, 0)).toBe(c);
      }),
    );
  });
});
