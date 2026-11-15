import { components } from '@motionpop/motion';
import { describe, expect, it } from 'vitest';
import { validateParams } from './validate-params';

const bigNumber = (
  components as Record<string, { params: { safeParse: (p: unknown) => { success: boolean } } }>
)['big-number']!;

describe('validateParams', () => {
  it('keeps valid params and applies schema defaults', () => {
    const r = validateParams('big-number', { value: 40, suffix: '%', label: 'Revenue grew' });
    expect(r.needsInput).toEqual([]);
    expect(r.params).toMatchObject({ value: 40, suffix: '%', label: 'Revenue grew', decimals: 0 });
  });

  it('fills missing or invalid fields from the defaults and lists them', () => {
    const r = validateParams('big-number', { value: 40, label: '' });
    expect(r.needsInput).toEqual(['label']);
    expect(bigNumber.params.safeParse(r.params).success).toBe(true);
    expect(r.params['value']).toBe(40);
  });

  it('passes unbuilt components through untouched', () => {
    expect(validateParams('bar-chart', { a: 1 })).toEqual({ params: { a: 1 }, needsInput: [] });
  });
  it('parses a scene score and applies its defaults (spec 07 task 27)', () => {
    const r = validateParams('hook-statement', { content: { line: 'Nobody tells you this' } });
    expect(r).toEqual({
      params: { content: { line: 'Nobody tells you this' }, beats: [], images: [] },
      needsInput: [],
    });
  });
  it("never fills a scene's example content: invalid scene params stay as given", () => {
    const r = validateParams('stat-punch', { content: { value: 40 }, beats: [] });
    expect(r).toEqual({ params: { content: { value: 40 }, beats: [] }, needsInput: ['content'] });
  });
});
