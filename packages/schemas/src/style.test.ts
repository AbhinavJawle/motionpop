import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { contrastRatio } from './color';
import { FORMATS } from './format';
import { EaseNameSchema, StylePackSchema } from './style';

const valid = () => ({
  id: 'editorial-explainer',
  name: 'Editorial Explainer',
  tagline: 'A point of view for every idea.',
  tags: ['Explainer', 'Charts'],
  description: 'Warm paper, ink type, one ember accent. Calm and precise.',
  colors: {
    bg: '#F2EDE4',
    ink: '#151515',
    muted: '#6B6560',
    accent: '#FF7A3D',
    accent2: '#8B7CFF',
    highlight: '#FFD43B',
    positive: '#2E9D6B',
    negative: '#E4473C',
    chart: ['#B9B0C9', '#8E80B5', '#FF7A3D'],
  },
  fonts: { display: 'Geist', body: 'Geist', mono: 'Geist Mono', displayWeight: 600 },
  texture: { grain: 0.03, paper: true, vignette: 0.08 },
  motion: {
    enterEase: 'outExpo',
    moveEase: 'inOutCubic',
    enterMs: 700,
    staggerMs: 60,
    holdMs: 1000,
    camera: { pushIn: 1.05 },
  },
  shape: { radius: 6, stroke: 2 },
  allowPlayful: false,
});

type Pack = ReturnType<typeof valid>;
const rejects = (mutate: (p: Pack) => void) => {
  const p = valid();
  mutate(p);
  return !StylePackSchema.safeParse(p).success;
};

describe('contrastRatio', () => {
  it('black on white is 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
  it('is symmetric and at least 1', () => {
    const hex = fc
      .integer({ min: 0, max: 0xffffff })
      .map((n) => '#' + n.toString(16).padStart(6, '0'));
    fc.assert(
      fc.property(hex, hex, (a, b) => {
        expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
        expect(contrastRatio(a, b)).toBeGreaterThanOrEqual(1);
      }),
    );
  });
  it('throws on invalid hex', () => {
    expect(() => contrastRatio('red', '#FFFFFF')).toThrow();
  });
});

describe('FORMATS', () => {
  it('has the three frame sizes', () => {
    expect(FORMATS['16:9']).toEqual({ width: 1920, height: 1080 });
    expect(FORMATS['9:16']).toEqual({ width: 1080, height: 1920 });
    expect(FORMATS['1:1']).toEqual({ width: 1080, height: 1080 });
  });
});

describe('StylePackSchema', () => {
  it('accepts the style-pack-format.md example', () => {
    expect(StylePackSchema.safeParse(valid()).success).toBe(true);
  });
  it('rejects bad hex', () => {
    expect(rejects((p) => (p.colors.accent = '#FFF'))).toBe(true);
    expect(rejects((p) => (p.colors.chart[0] = 'orange'))).toBe(true);
  });
  it('rejects unknown keys at every level', () => {
    expect(rejects((p) => Object.assign(p, { extra: 1 }))).toBe(true);
    expect(rejects((p) => Object.assign(p.colors, { extra: '#000000' }))).toBe(true);
    expect(rejects((p) => Object.assign(p.fonts, { extra: 1 }))).toBe(true);
    expect(rejects((p) => Object.assign(p.texture, { extra: 1 }))).toBe(true);
    expect(rejects((p) => Object.assign(p.motion, { extra: 1 }))).toBe(true);
    expect(rejects((p) => Object.assign(p.motion.camera, { extra: 1 }))).toBe(true);
    expect(rejects((p) => Object.assign(p.shape, { extra: 1 }))).toBe(true);
  });
  it('rejects unknown ease', () => {
    expect(rejects((p) => ((p.motion as { enterEase: string }).enterEase = 'outBack'))).toBe(true);
    expect(EaseNameSchema.options).toContain('outExpo');
  });
  it('rejects chart palettes shorter than 3 or longer than 8', () => {
    expect(rejects((p) => (p.colors.chart = ['#B9B0C9', '#8E80B5']))).toBe(true);
    expect(rejects((p) => (p.colors.chart = Array(9).fill('#B9B0C9')))).toBe(true);
    expect(rejects((p) => (p.colors.chart = Array(8).fill('#B9B0C9')))).toBe(false);
  });
  it('rejects non-positive or fractional timings', () => {
    for (const k of ['enterMs', 'staggerMs', 'holdMs'] as const) {
      expect(rejects((p) => (p.motion[k] = 0))).toBe(true);
      expect(rejects((p) => (p.motion[k] = -5))).toBe(true);
      expect(rejects((p) => (p.motion[k] = 10.5))).toBe(true);
    }
  });
  it('rejects grain and vignette outside 0–1', () => {
    expect(rejects((p) => (p.texture.grain = 1.1))).toBe(true);
    expect(rejects((p) => (p.texture.grain = -0.1))).toBe(true);
    expect(rejects((p) => (p.texture.vignette = 2))).toBe(true);
    expect(rejects((p) => (p.texture.vignette = -1))).toBe(true);
  });
  it('rejects camera pushIn outside 1–1.1', () => {
    expect(rejects((p) => (p.motion.camera.pushIn = 0.9))).toBe(true);
    expect(rejects((p) => (p.motion.camera.pushIn = 1.2))).toBe(true);
  });
  it('rejects displayWeight outside 400–900 or not a multiple of 100', () => {
    expect(rejects((p) => (p.fonts.displayWeight = 300))).toBe(true);
    expect(rejects((p) => (p.fonts.displayWeight = 1000))).toBe(true);
    expect(rejects((p) => (p.fonts.displayWeight = 450))).toBe(true);
    expect(rejects((p) => (p.fonts.displayWeight = 900))).toBe(false);
  });
  it('rejects ink/bg or muted/bg contrast below 4.5', () => {
    expect(rejects((p) => (p.colors.ink = '#E0DACF'))).toBe(true);
    expect(rejects((p) => (p.colors.muted = '#D0CAC0'))).toBe(true);
  });
});
