import { contrastRatio } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { editorialExplainer, fieldNotes } from '../styles';
import { emphasisColour } from '../runtime/captions';
import { withBrand } from './brand';
import { styleFor } from './project';

describe('withBrand', () => {
  it('replaces the accents and the accent inside the chart ramp', () => {
    const b = withBrand(editorialExplainer, { accent: '#1E5AA8', accent2: '#2E9D6B' });
    expect(b.colors.accent).toBe('#1E5AA8');
    expect(b.colors.accent2).toBe('#2E9D6B');
    expect(b.colors.chart).toContain('#1E5AA8');
    expect(b.colors.chart).not.toContain(editorialExplainer.colors.accent);
    expect(b.colors.bg).toBe(editorialExplainer.colors.bg);
    expect(editorialExplainer.colors.accent).toBe('#FF7A3D'); // the shared look is untouched
  });

  it('returns the same object for the same look and colours (stable in React selectors)', () => {
    const a = withBrand(fieldNotes, { accent: '#1E5AA8' });
    expect(withBrand(fieldNotes, { accent: '#1E5AA8' })).toBe(a);
    expect(withBrand(fieldNotes, undefined)).toBe(fieldNotes);
  });

  it('ignores a colour that cannot be read on the look background', () => {
    const b = withBrand(editorialExplainer, { accent: '#F5F0E6' });
    expect(b).toBe(editorialExplainer);
  });

  it('styleFor applies the project brand', () => {
    expect(styleFor({ styleId: 'editorial-explainer' }).colors.accent).toBe('#FF7A3D');
    expect(
      styleFor({ styleId: 'editorial-explainer', brand: { accent: '#1E5AA8' } }).colors.accent,
    ).toBe('#1E5AA8');
  });
});

describe('caption emphasis colour', () => {
  it('reads at 4.5:1 on the pop box for every look accent and a dark brand colour', () => {
    for (const accent of ['#FF7A3D', '#D62A1C', '#D96648', '#1E5AA8', '#111111']) {
      expect(contrastRatio(emphasisColour(accent), '#5c5c5f')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps an accent that already reads', () => {
    expect(emphasisColour('#FFD43B')).toBe('#ffd43b');
  });
});
