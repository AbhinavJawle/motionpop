// @vitest-environment happy-dom
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { BuildContext } from '../../contract';
import { bigNumber } from './index';

const DURATION_MS = 3600;
const KEY_MOMENT_MS = bigNumber.keyMomentMs(bigNumber.defaults, DURATION_MS);

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  const ctx: BuildContext = {
    root,
    width: 1280,
    height: 720,
    format: '16:9',
    style: {
      colors: { bg: '#0b0b0f', ink: '#f4f3f8', muted: '#a09eae', accent: '#ff7a3d' },
      fonts: { display: 'Geist', body: 'Geist', mono: 'Geist Mono' },
    },
    durationMs: DURATION_MS,
    keyMomentMs: KEY_MOMENT_MS,
    fps: 30,
    seed: 1,
  };
  const comp = bigNumber.build(ctx, bigNumber.defaults);
  return { root, comp };
}

const timeArb = fc.integer({ min: 0, max: DURATION_MS });

describe('big-number seek determinism', () => {
  it('seeking to the same t twice gives identical innerHTML', () => {
    const { root, comp } = mount();
    fc.assert(
      fc.property(timeArb, (t) => {
        comp.seek(t);
        const first = root.innerHTML;
        comp.seek(t);
        expect(root.innerHTML).toBe(first);
      }),
    );
  });

  it('a random seek sequence then t equals a fresh build seeked straight to t', () => {
    const live = mount();
    fc.assert(
      fc.property(fc.array(timeArb, { maxLength: 20 }), timeArb, (seq, t) => {
        for (const s of seq) live.comp.seek(s);
        live.comp.seek(t);
        const fresh = mount();
        fresh.comp.seek(t);
        expect(live.root.innerHTML).toBe(fresh.root.innerHTML);
        fresh.comp.dispose();
        fresh.root.remove();
      }),
    );
  });
});
