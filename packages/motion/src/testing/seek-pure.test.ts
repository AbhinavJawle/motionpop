// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { MotionComponent } from '../contract';
import { assertSeekPure } from './seek-pure';

function fake(impure: boolean): MotionComponent<{ n: number }> {
  return {
    id: impure ? 'fake-impure' : 'fake-pure',
    name: 'Fake',
    category: 'text',
    params: z.object({ n: z.number() }),
    defaults: { n: 1 },
    durationMs: { min: 500, ideal: 1000, max: 2000 },
    formats: ['16:9', '9:16', '1:1'],
    keyMomentMs: () => 500,
    build: (ctx, p) => {
      const el = document.createElement('div');
      ctx.root.append(el);
      let seeks = 0;
      return {
        durationMs: ctx.durationMs,
        seek: (t) => {
          seeks += 1;
          el.style.opacity = String(t / ctx.durationMs);
          el.textContent = impure ? String(seeks) : String(Math.round(t * p.n));
        },
        dispose: () => el.remove(),
      };
    },
  };
}

describe('assertSeekPure', () => {
  it('passes for a pure component in every format', () => {
    for (const format of ['16:9', '9:16', '1:1'] as const) {
      expect(() => assertSeekPure(fake(false), { n: 2 }, { format, numRuns: 30 })).not.toThrow();
    }
  });

  it('throws for a component that keeps state across seeks', () => {
    const c = fake(true);
    expect(() => assertSeekPure(c, c.defaults, { numRuns: 30 })).toThrow(/Property failed/);
  });

  it('cleans up its roots', () => {
    assertSeekPure(fake(false), { n: 1 }, { numRuns: 5 });
    expect(document.body.children).toHaveLength(0);
  });
});
