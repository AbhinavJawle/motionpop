import { ReelPlanSchema, type ReelPlan, type ReelScene } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { carriedInPlace, carryOrigins } from './carry';
import { reelSfx } from './sound';

const scene = (
  s: Partial<ReelScene> & Pick<ReelScene, 'startMs' | 'endMs' | 'content'>,
): ReelScene => ({ id: `s${s.startMs}`, layout: 'split', ...s }) as ReelScene;

const plan: Pick<ReelPlan, 'scenes'> = {
  scenes: [
    scene({
      startMs: 0,
      endMs: 3000,
      content: {
        template: 'list',
        title: 'Steps',
        items: [
          { at: 500, icon: 'check', text: 'Learn' },
          { at: 1500, icon: 'check', text: 'Build' },
        ],
      },
    }),
    scene({
      startMs: 3000,
      endMs: 4500,
      layout: 'speaker',
      content: { template: 'punch', text: 'Go' },
    }),
    scene({
      startMs: 4500,
      endMs: 8000,
      carry: true,
      content: {
        template: 'list',
        title: 'Steps',
        items: [
          { at: 500, icon: 'check', text: 'Learn' },
          { at: 1500, icon: 'check', text: 'Build' },
          { at: 5200, icon: 'check', text: 'Ship' },
        ],
      },
    }),
  ],
};

describe('carry', () => {
  it('times a carried scene from the graphic it continues', () => {
    const o = carryOrigins(plan.scenes);
    expect(o.get(plan.scenes[2]!)).toBe(0);
    expect(carriedInPlace(plan.scenes, 2)).toBe(true);
  });
});

describe('reelSfx', () => {
  it('hits each beat once: no replayed whoosh or ticks on a carried list', () => {
    const fx = reelSfx(plan, 8000);
    expect(fx.filter((f) => f.kind === 'whoosh')).toHaveLength(1);
    expect(fx.filter((f) => f.kind === 'impact')).toHaveLength(1);
    // The hook's first item is already on screen at frame 0 (it folds into the opening whoosh),
    // its second ticks, and the carried list only ticks for its new item.
    const ticks = fx.filter((f) => f.kind === 'tick');
    expect(ticks).toHaveLength(2);
    expect(ticks.at(-1)!.atMs).toBeGreaterThanOrEqual(5200);
  });

  it('is deterministic, sorted, in range and never machine-guns soft hits (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 300, max: 4000 }), { minLength: 1, maxLength: 12 }),
        fc.array(fc.integer({ min: 0, max: 3000 }), { minLength: 2, maxLength: 5 }),
        (lens, cues) => {
          let t = 0;
          const scenes = lens.map((len, i) => {
            const s = scene({
              startMs: t,
              endMs: t + len,
              layout: i % 3 === 2 ? 'speaker' : 'split',
              content:
                i % 3 === 2
                  ? { template: 'punch', text: 'Yes' }
                  : {
                      template: 'list',
                      title: 'T',
                      items: cues.map((c, k) => ({ at: t + c, icon: 'check', text: `I${k}` })),
                    },
            });
            t += len;
            return s;
          });
          const p = { scenes };
          if (!ReelPlanSchema.safeParse({ v: 1, look: 'mono', ...p }).success) return;
          const a = reelSfx(p, t);
          expect(reelSfx(p, t)).toEqual(a);
          let lastSoft = -Infinity;
          a.forEach((f, i) => {
            expect(f.atMs).toBeGreaterThanOrEqual(0);
            expect(f.atMs).toBeLessThan(t);
            if (i > 0) expect(f.atMs).toBeGreaterThanOrEqual(a[i - 1]!.atMs);
            if (f.kind === 'tick' || f.kind === 'pop') {
              expect(f.atMs - lastSoft).toBeGreaterThanOrEqual(150);
              lastSoft = f.atMs;
            }
          });
        },
      ),
      { numRuns: 80 },
    );
  });
});

describe('added sounds (spec 37 R3.3)', () => {
  it('plays every added hit, even close together, sorted with the derived ones', () => {
    const withAdded = reelSfx(
      {
        ...plan,
        sfx: [
          { kind: 'pop', atMs: 5000, gainDb: -2 },
          { kind: 'pop', atMs: 5050, gainDb: -2 },
          { kind: 'impact', atMs: 25_000, gainDb: 0 },
        ],
      },
      20_000,
    );
    const added = withAdded.filter((h) => h.atMs === 5000 || h.atMs === 5050);
    expect(added).toHaveLength(2);
    // Out of range hits are dropped like derived ones.
    expect(withAdded.some((h) => h.atMs >= 20_000)).toBe(false);
    const times = withAdded.map((h) => h.atMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
