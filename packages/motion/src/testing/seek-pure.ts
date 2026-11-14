import fc from 'fast-check';
import { FORMATS } from '@motionpop/schemas';
import type { BuildContext, Composition, Format, MotionComponent, StylePack } from '../contract';
import { editorialExplainer } from '../styles';

export interface SeekPureOptions {
  /** Slot length in ms. Defaults to the component's ideal duration. */
  durationMs?: number;
  format?: Format;
  numRuns?: number;
  style?: StylePack;
}

/**
 * Asserts that `component.build(...).seek` is a pure function of time (testing.md, R1.2).
 * Runs in the current DOM document (happy-dom). Throws when:
 *  (a) a copy seeked through a random list of times differs from a copy seeked only to the last time, or
 *  (b) seeking the same t twice gives a different DOM.
 */
export function assertSeekPure<P>(
  component: MotionComponent<P>,
  params: P,
  opts: SeekPureOptions = {},
): void {
  const durationMs = opts.durationMs ?? component.durationMs.ideal;
  const format = opts.format ?? component.formats[0] ?? '16:9';
  const style = opts.style ?? editorialExplainer;
  const { width, height } = FORMATS[format];
  const keyMomentMs = component.keyMomentMs(params, durationMs);

  const mount = () => {
    const root = document.createElement('div');
    document.body.append(root);
    const ctx: BuildContext = {
      root,
      width,
      height,
      format,
      style,
      durationMs,
      keyMomentMs,
      fps: 30,
      seed: 1,
      warn: () => {},
    };
    const comp: Composition = component.build(ctx, params);
    return { root, comp };
  };
  const cleanup = (m: { root: HTMLElement; comp: Composition }) => {
    m.comp.dispose();
    m.root.remove();
  };

  const timeArb = fc.integer({ min: 0, max: durationMs });
  const a = mount();
  const b = mount();
  try {
    // (a) history independence
    fc.assert(
      fc.property(fc.array(timeArb, { minLength: 1, maxLength: 20 }), (times) => {
        for (const t of times) a.comp.seek(t);
        const last = times[times.length - 1] as number;
        b.comp.seek(last);
        if (a.root.innerHTML !== b.root.innerHTML) {
          throw new Error(
            `seek is not pure: after seeking [${times.join(', ')}] the DOM differs from a copy seeked only to ${last}`,
          );
        }
      }),
      { numRuns: opts.numRuns ?? 100 },
    );
    // (b) idempotence
    fc.assert(
      fc.property(timeArb, (t) => {
        a.comp.seek(t);
        const first = a.root.innerHTML;
        a.comp.seek(t);
        if (a.root.innerHTML !== first) {
          throw new Error(`seek is not pure: seeking t=${t} twice gives different DOM`);
        }
      }),
      { numRuns: opts.numRuns ?? 100 },
    );
  } finally {
    cleanup(a);
    cleanup(b);
  }
}
