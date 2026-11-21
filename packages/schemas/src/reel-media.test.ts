import { describe, expect, it } from 'vitest';
import {
  ReelPlanSchema,
  reelMediaKey,
  reelMediaOf,
  setReelMediaAssets,
  type ReelPlan,
} from './reel';

const plan: ReelPlan = ReelPlanSchema.parse({
  v: 1,
  look: 'mono',
  scenes: [
    {
      id: 'a',
      startMs: 0,
      endMs: 2000,
      layout: 'split',
      content: { template: 'logo', media: { kind: 'logo', query: 'Acme' }, name: 'Acme' },
    },
    {
      id: 'b',
      startMs: 2000,
      endMs: 4000,
      layout: 'split',
      content: {
        template: 'list',
        title: 'Tools',
        items: [
          { at: 2200, icon: 'check', text: 'Acme', media: { kind: 'logo', query: 'acme ' } },
          { at: 2600, icon: 'check', text: 'Plain' },
        ],
      },
    },
  ],
});

describe('reel media helpers', () => {
  it('lists every request and keys equal requests together', () => {
    const all = reelMediaOf(plan);
    expect(all).toHaveLength(2);
    expect(new Set(all.map(reelMediaKey)).size).toBe(1);
  });

  it('sets asset ids on every matching request without touching others', () => {
    const next = setReelMediaAssets(plan, { 'logo:acme': 'asset-1' });
    expect(reelMediaOf(next).every((m) => m.asset === 'asset-1')).toBe(true);
    expect(ReelPlanSchema.safeParse(next).success).toBe(true);
    expect(reelMediaOf(plan).every((m) => m.asset === undefined)).toBe(true);
  });
});
