import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { editorialExplainer, fieldNotes } from '@motionpop/motion';
import { EASE_LABELS, easeCurvePath, effectiveEase, fadePatch, styleOptions } from './timing-view';

describe('effectiveEase', () => {
  it('uses the slot’s own ease, else the look’s default', () => {
    expect(effectiveEase({ ease: 'linear' }, editorialExplainer)).toBe('linear');
    const lookDefault = effectiveEase(undefined, editorialExplainer);
    expect(['inOut', 'out', 'linear']).toContain(lookDefault);
    expect(effectiveEase({ speed: 0.8 }, fieldNotes)).toBe(effectiveEase(undefined, fieldNotes));
  });
});

describe('easeCurvePath', () => {
  it('starts bottom-left and ends top-right for every choice', () => {
    for (const c of ['inOut', 'out', 'linear'] as const) {
      const d = easeCurvePath(c);
      expect(d.startsWith('M1.00 15.00')).toBe(true);
      expect(d.endsWith('L29.00 1.00')).toBe(true);
    }
  });
  it('all points stay inside the box, for any size', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('inOut', 'out', 'linear'),
        fc.integer({ min: 12, max: 80 }),
        fc.integer({ min: 8, max: 40 }),
        (c, w, h) => {
          const nums = [...easeCurvePath(c, w, h).matchAll(/[ML]([\d.]+) ([\d.]+)/g)];
          expect(nums.length).toBe(25);
          for (const m of nums) {
            expect(Number(m[1])).toBeGreaterThanOrEqual(1);
            expect(Number(m[1])).toBeLessThanOrEqual(w - 1);
            expect(Number(m[2])).toBeGreaterThanOrEqual(1);
            expect(Number(m[2])).toBeLessThanOrEqual(h - 1);
          }
        },
      ),
    );
  });
  it('the three curves differ', () => {
    const paths = new Set(['inOut', 'out', 'linear'].map((c) => easeCurvePath(c as 'inOut')));
    expect(paths.size).toBe(3);
  });
});

describe('fadePatch and labels', () => {
  it('on is stored as unset, off as false', () => {
    expect(fadePatch(true)).toEqual({ fade: undefined });
    expect(fadePatch(false)).toEqual({ fade: false });
  });
  it('has the design’s ease names', () => {
    expect(EASE_LABELS.inOut).toBe('Ease in-out');
  });
});

describe('styleOptions', () => {
  it('lists the shipped packs and looks once each, never the test pack', () => {
    const ids = styleOptions().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('editorial-explainer');
    expect(ids).toContain('field-notes');
    expect(ids.some((i) => i.includes('test'))).toBe(false);
  });
});
