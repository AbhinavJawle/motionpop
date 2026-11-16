import { describe, expect, it } from 'vitest';
import { askedGraphicType, graphicForWords } from './graphic-types';

describe('askedGraphicType', () => {
  it('switches when the prompt names another type', () => {
    expect(askedGraphicType('A map that flies down to Japan', 'big-number')).toBe('map-zoom');
    expect(askedGraphicType('show this as a line chart', 'stat-punch')).toBe('chart-story');
  });
  it('keeps the type when the prompt also names the current one, or names none', () => {
    expect(askedGraphicType('A big number for revenue, like a chart', 'big-number')).toBeNull();
    expect(askedGraphicType('make it punchier', 'stat-punch')).toBeNull();
  });
});

describe('graphicForWords', () => {
  it('a place gets a map, a number a stat, anything else a hook', () => {
    expect(graphicForWords(["Japan's", 'market', 'peaked'])).toBe('map-zoom');
    expect(graphicForWords(['forty', 'percent'])).toBe('stat-punch');
    expect(graphicForWords(['nobody', 'tells', 'you'])).toBe('hook-statement');
  });
});
