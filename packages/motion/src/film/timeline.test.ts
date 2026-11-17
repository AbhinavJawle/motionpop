// @vitest-environment happy-dom
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createTimeline, type KitEase, type TimelineHost } from './timeline';

const EASES: KitEase[] = ['linear', 'out', 'outStrong', 'in', 'inOut', 'back', 'spring'];

/** A host with one spoken word, "land", at 1000 ms, and no other voice. */
function hostFor(root: HTMLElement, warn: (m: string) => void = () => {}): TimelineHost {
  return {
    root,
    durationMs: 4000,
    wordMs: (word) => (word === 'land' ? 1000 : null),
    spokenTimes: (words) => words.map(() => null),
    warn,
  };
}

const mount = () => {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
};

const styleOf = (el: Element) => el.getAttribute('style') ?? '';

// ---- seek purity -----------------------------------------------------------------------------

type Op = {
  kind: 'from' | 'to' | 'fromTo' | 'set';
  el: number;
  prop: 'x' | 'opacity' | 'scale';
  a: number;
  b: number;
  at: number;
  dur: number;
  ease: KitEase;
};

const opArb: fc.Arbitrary<Op> = fc.record({
  kind: fc.constantFrom<Op['kind']>('from', 'to', 'fromTo', 'set'),
  el: fc.integer({ min: 0, max: 2 }),
  prop: fc.constantFrom<Op['prop']>('x', 'opacity', 'scale'),
  a: fc.integer({ min: -500, max: 500 }),
  b: fc.integer({ min: -500, max: 500 }),
  at: fc.integer({ min: 0, max: 3000 }),
  dur: fc.integer({ min: 0, max: 1500 }),
  ease: fc.constantFrom(...EASES),
});

/** Builds a timeline with three elements from a list of tweens. */
function build(ops: readonly Op[]) {
  const root = mount();
  const els = [0, 1, 2].map(() => {
    const el = document.createElement('div');
    root.append(el);
    return el;
  });
  const tl = createTimeline(hostFor(root));
  for (const op of ops) {
    const el = els[op.el] as HTMLElement;
    const opts = { at: op.at, dur: op.dur, ease: op.ease };
    if (op.kind === 'fromTo') tl.fromTo(el, { [op.prop]: op.a }, { [op.prop]: op.b }, opts);
    else if (op.kind === 'set') tl.set(el, { [op.prop]: op.a }, { at: op.at });
    else tl[op.kind](el, { [op.prop]: op.a }, opts);
  }
  return { root, els, tl };
}

const snapshot = (els: readonly Element[]) => els.map(styleOf).join('|');

describe('timeline seek (film kit)', () => {
  it('is a pure function of time: random seek order equals seeking each time alone', () => {
    fc.assert(
      fc.property(
        fc.array(opArb, { minLength: 1, maxLength: 8 }),
        fc.array(fc.integer({ min: 0, max: 4500 }), { minLength: 1, maxLength: 12 }),
        (ops, times) => {
          const a = build(ops);
          try {
            // Seek in the random order, keeping what each time looked like.
            const seen = times.map((t) => {
              a.tl.seek(t);
              return snapshot(a.els);
            });
            // Each time on its own, on a fresh identical timeline.
            times.forEach((t, i) => {
              const fresh = build(ops);
              try {
                fresh.tl.seek(t);
                expect(snapshot(fresh.els)).toBe(seen[i]);
              } finally {
                fresh.root.remove();
              }
            });
          } finally {
            a.root.remove();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---- timing rules ----------------------------------------------------------------------------

describe('timeline timing', () => {
  it('shows the start value before the first tween and holds the end value after the last', () => {
    const root = mount();
    const el = document.createElement('div');
    root.append(el);
    const tl = createTimeline(hostFor(root));
    tl.from(el, { opacity: 0 }, { at: 500, dur: 400, ease: 'linear' });
    tl.seek(0);
    expect(el.style.opacity).toBe('0');
    tl.seek(5000);
    expect(el.style.opacity).toBe('1');
    root.remove();
  });

  it('holds the last end value between tweens', () => {
    const root = mount();
    const el = document.createElement('div');
    root.append(el);
    const tl = createTimeline(hostFor(root));
    tl.to(el, { opacity: 0.5 }, { at: 0, dur: 100 });
    tl.to(el, { opacity: 0.8 }, { at: 1000, dur: 100 });
    tl.seek(500);
    expect(el.style.opacity).toBe('0.5');
    root.remove();
  });

  it('set applies its value from its time on', () => {
    const root = mount();
    const el = document.createElement('div');
    root.append(el);
    const tl = createTimeline(hostFor(root));
    tl.to(el, { opacity: 0.9 }, { at: 0, dur: 100 });
    tl.set(el, { opacity: 0.3 }, { at: 200 });
    tl.seek(150);
    expect(el.style.opacity).toBe('0.9');
    tl.seek(200);
    expect(el.style.opacity).toBe('0.3');
    root.remove();
  });

  it('on: a word makes the tween finish no earlier than the word, and start before it', () => {
    const root = mount();
    const el = document.createElement('div');
    root.append(el);
    const warn: string[] = [];
    const tl = createTimeline(hostFor(root, (m) => warn.push(m)));
    // dur 400 on a word at 1000 ms: the tween starts 160 ms before it (the lead-in) and ends at 1240.
    tl.from(el, { opacity: 0 }, { on: 'land', dur: 400, ease: 'linear' });
    tl.seek(840);
    expect(el.style.opacity).toBe('0');
    tl.seek(940);
    expect(el.style.opacity).toBe('0.25');
    tl.seek(1000);
    expect(el.style.opacity).toBe('0.4');
    tl.seek(1240);
    expect(el.style.opacity).toBe('1');
    expect(warn).toEqual([]);
    root.remove();
  });

  it('at: a word makes the tween start on that word', () => {
    const root = mount();
    const el = document.createElement('div');
    root.append(el);
    const tl = createTimeline(hostFor(root));
    tl.from(el, { opacity: 0 }, { at: 'land', dur: 400, ease: 'linear' });
    tl.seek(1000);
    expect(el.style.opacity).toBe('0');
    tl.seek(1200);
    expect(el.style.opacity).toBe('0.5');
    root.remove();
  });

  it('warns and times at the key moment when a word is not spoken', () => {
    const root = mount();
    const el = document.createElement('div');
    root.append(el);
    const warn: string[] = [];
    const tl = createTimeline(hostFor(root, (m) => warn.push(m)));
    tl.from(el, { opacity: 0 }, { on: 'nowhere', dur: 400, ease: 'linear' });
    expect(warn).toHaveLength(1);
    // Timed at 40 % of the 4000 ms host, so it starts at 1600.
    tl.seek(1600);
    expect(el.style.opacity).toBe('0');
    tl.seek(1800);
    expect(el.style.opacity).toBe('0.5');
    root.remove();
  });

  it('count writes the final formatted number at the end', () => {
    const root = mount();
    const el = document.createElement('div');
    root.append(el);
    const tl = createTimeline(hostFor(root));
    tl.count(el, { to: 1200, suffix: '%', dur: 900 });
    tl.seek(5000);
    expect(el.textContent).toBe('1,200%');
    root.remove();
  });

  it('count shows the decimal places it was asked for', () => {
    const root = mount();
    const el = document.createElement('div');
    root.append(el);
    const tl = createTimeline(hostFor(root));
    tl.count(el, { to: 9.6, decimals: 1, prefix: '$', dur: 900 });
    tl.seek(5000);
    expect(el.textContent).toBe('$9.6');
    root.remove();
  });

  it('draw ends with strokeDashoffset 0', () => {
    const root = mount();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.append(path);
    root.append(svg);
    const tl = createTimeline(hostFor(root));
    tl.draw(path, { at: 0, dur: 500 });
    tl.seek(0);
    expect(path.style.strokeDashoffset).toBe('1');
    tl.seek(5000);
    expect(path.style.strokeDashoffset).toBe('0');
    root.remove();
  });

  it('words splits the text into spans and reveals them in order', () => {
    const root = mount();
    const line = document.createElement('div');
    line.textContent = 'one two three';
    root.append(line);
    const tl = createTimeline(hostFor(root));
    tl.words(line, { style: 'fade', at: 1000 });
    const spans = Array.from(line.querySelectorAll<HTMLElement>('[data-mp-word]'));
    expect(spans.map((s) => s.textContent)).toEqual(['one', 'two', 'three']);
    tl.seek(1000);
    const [s0, s1, s2] = spans.map((s) => Number(s.style.opacity));
    // The first word is already in, the second is coming, the third has not started.
    expect(s0 as number).toBeGreaterThan(s1 as number);
    expect(s1 as number).toBeGreaterThan(s2 as number);
    expect(s2).toBe(0);
    tl.seek(5000);
    expect(spans.map((s) => s.style.opacity)).toEqual(['1', '1', '1']);
    root.remove();
  });
});
