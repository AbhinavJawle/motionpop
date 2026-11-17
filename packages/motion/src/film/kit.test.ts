// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { custom, customParams, lintCustom, CUSTOM_ALLOW_FLAG } from '../components/custom';
import { assertSeekPure } from '../testing/seek-pure';
import { filmKit, type KitContext } from './kit';
import { KIT_DOC, kitExample } from './doc';

const g = globalThis as unknown as Record<string, unknown>;
beforeAll(() => {
  g[CUSTOM_ALLOW_FLAG] = true;
});
afterAll(() => {
  delete g[CUSTOM_ALLOW_FLAG];
});

const W = 1920;

function ctxOf(over: Partial<KitContext> = {}): KitContext {
  return {
    width: W,
    height: 1080,
    format: '16:9',
    durationMs: 2000,
    keyMomentMs: 500,
    seed: 7,
    colors: {
      bg: '#F2EDE4',
      ink: '#1B1A17',
      muted: '#6B665C',
      accent: '#7C5CFF',
      accent2: '#E8472F',
      highlight: '#F5C542',
      positive: '#2E9E6A',
      negative: '#D0463B',
      chart: ['#7C5CFF', '#E8472F'],
    },
    fonts: { display: 'Geist', body: 'Geist' },
    words: [],
    radius: 12,
    stroke: 3,
    warn: () => {},
    ...over,
  };
}

const mount = () => {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
};

/** The first number in a CSS translate() or scale() of an element's transform. */
const translateX = (el: HTMLElement) => {
  const m = /translate\((-?[\d.]+)px/.exec(el.style.transform);
  return m ? Number(m[1]) : Number.NaN;
};
const scaleOf = (el: HTMLElement) => {
  const m = /scale\(([\d.]+),/.exec(el.style.transform);
  return m ? Number(m[1]) : Number.NaN;
};

// ---- kitExample ------------------------------------------------------------------------------

describe('kitExample', () => {
  const example = { title: 'Kit example', ...kitExample() };

  it('passes the custom lint and the custom params schema', () => {
    expect(lintCustom(example)).toEqual([]);
    expect(customParams.safeParse(example).success).toBe(true);
  });

  // 240 dots and a word-split line make each seek heavy in happy-dom: fewer runs and a longer
  // limit keep this green when the whole suite runs in parallel (it timed out at 24 s there).
  it('is a pure function of time in every format', { timeout: 90_000 }, () => {
    for (const format of custom.formats) {
      assertSeekPure(custom, example, { format, durationMs: 4000, numRuns: 12 });
    }
  });

  it('names only mp and tl members the kit has', () => {
    const root = mount();
    const kit = filmKit(root, ctxOf()).kit;
    const tl = kit.timeline();
    const script = kitExample().script;
    for (const name of namesIn(script, 'mp')) expect(kit, `mp.${name}`).toHaveProperty(name);
    for (const name of namesIn(script, 'tl')) expect(tl, `tl.${name}`).toHaveProperty(name);
    root.remove();
  });
});

// ---- the reference names only what the kit has ------------------------------------------------

/** Distinct member names used as `prefix.name` in a piece of text. */
function namesIn(text: string, prefix: string): string[] {
  const re = new RegExp(`\\b${prefix}\\.([A-Za-z_]\\w*)`, 'g');
  return [...new Set(Array.from(text.matchAll(re), (m) => m[1] as string))].sort();
}

describe('KIT_DOC', () => {
  it('mentions only mp, tl and map members that exist', () => {
    const root = mount();
    const kit = filmKit(root, ctxOf()).kit;
    const tl = kit.timeline();
    const map = kit.map({});
    for (const name of namesIn(KIT_DOC, 'mp')) expect(kit, `mp.${name}`).toHaveProperty(name);
    for (const name of namesIn(KIT_DOC, 'tl')) expect(tl, `tl.${name}`).toHaveProperty(name);
    for (const name of namesIn(KIT_DOC, 'map')) expect(map, `map.${name}`).toHaveProperty(name);
    root.remove();
  });
});

// ---- seam halves -----------------------------------------------------------------------------

function stage(over: Partial<KitContext> = {}) {
  const root = mount();
  const el = document.createElement('div');
  root.append(el);
  const kit = filmKit(root, ctxOf(over)).kit;
  return { root, el, kit, tl: kit.timeline() };
}

describe('seam halves', () => {
  it('exit push moves x negative and ends at the slot end', () => {
    const { root, el, tl } = stage();
    tl.exit('push', el);
    expect(tl.endMs).toBe(2000);
    tl.seek(2000);
    expect(translateX(el)).toBeLessThan(0);
    expect(translateX(el)).toBeCloseTo(-0.14 * W, 1);
    root.remove();
  });

  it('enter push starts x positive at t = 0 and is at rest by 500 ms', () => {
    const { root, el, tl } = stage();
    tl.enter('push', el);
    tl.seek(0);
    expect(translateX(el)).toBeGreaterThan(0);
    expect(translateX(el)).toBeCloseTo(0.14 * W, 1);
    tl.seek(500);
    expect(translateX(el)).toBeCloseTo(0, 5);
    root.remove();
  });

  it('zoom exit grows above 1 and zoom enter starts below 1 (same sign)', () => {
    const exit = stage();
    exit.tl.exit('zoom', exit.el);
    exit.tl.seek(2000);
    expect(scaleOf(exit.el)).toBeGreaterThan(1);
    exit.root.remove();

    const enter = stage();
    enter.tl.enter('zoom', enter.el);
    enter.tl.seek(0);
    expect(scaleOf(enter.el)).toBeLessThan(1);
    expect(scaleOf(enter.el)).toBeCloseTo(0.8, 5);
    enter.root.remove();
  });
});

// ---- helpers the reference relies on ----------------------------------------------------------

describe('mp.at and mp.sheet', () => {
  it('mp.at returns the start of the spoken word, and the key moment when it is not spoken', () => {
    const { root, kit } = stage({
      words: [
        { text: 'Billion,', startMs: 1234, endMs: 1500 },
        { text: 'people', startMs: 1600, endMs: 1900 },
      ],
    });
    expect(kit.at('billion')).toBe(1234);
    expect(kit.at('people')).toBe(1600);
    expect(kit.at('nowhere')).toBe(500);
    root.remove();
  });

  it('mp.sheet moves the existing children inside the sheet', () => {
    const root = mount();
    const a = document.createElement('div');
    const b = document.createElement('div');
    root.append(a, b);
    const kit = filmKit(root, ctxOf()).kit;
    const sheet = kit.sheet();
    expect(root.children).toHaveLength(1);
    expect(root.firstElementChild).toBe(sheet);
    const inner = sheet.firstElementChild as HTMLElement;
    expect(inner.contains(a)).toBe(true);
    expect(inner.contains(b)).toBe(true);
    expect((sheet as unknown as { body: HTMLElement }).body).toBe(inner);
    // Later kit output lands inside the sheet too.
    const card = kit.paper({ x: 100, y: 100, w: 300, h: 200 });
    expect(inner.contains(card)).toBe(true);
    root.remove();
  });
});
