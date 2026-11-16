// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { MotionComponent } from '../contract';
import type { RuntimeProject } from '../compiler/types';
import { hashString } from '../core/rng';
import { editorialExplainer } from '../styles';
import { createEngine, fontRequests, type FontLoader } from './engine';
import { planSeams, seamState } from './seams';

const params = z.object({ label: z.string() });
type P = z.infer<typeof params>;

/** Writes `label@t` into its root on every seek. */
const pure: MotionComponent<P> = {
  id: 'pure',
  name: 'Pure',
  category: 'text',
  params,
  defaults: { label: 'a' },
  durationMs: { min: 1000, ideal: 2000, max: 4000 },
  formats: ['16:9'],
  keyMomentMs: (_p, d) => Math.round(d / 2),
  build: (ctx, p) => {
    const el = ctx.root.ownerDocument.createElement('span');
    ctx.root.append(el);
    if (p.label === 'warn-me') ctx.warn('label truncated');
    return {
      durationMs: ctx.durationMs,
      seek: (t) => {
        el.textContent = `${p.label}@${t}|key=${ctx.keyMomentMs}`;
      },
      dispose: () => ctx.root.replaceChildren(),
    };
  },
};

const throwsOnBuild: MotionComponent<P> = {
  ...pure,
  id: 'throws-build',
  build: () => {
    throw new Error('boom at build');
  },
};

const throwsOnSeek: MotionComponent<P> = {
  ...pure,
  id: 'throws-seek',
  build: (ctx) => ({
    durationMs: ctx.durationMs,
    seek: (t) => {
      if (t > 500) throw new Error('boom at seek');
    },
    dispose: () => {},
  }),
};

/** Records what the engine hands a clip: its style's motion block and the scene `exit` option. */
const seen: { enterMs: number; moveEase: string; exit: unknown; lookEnterMs: unknown }[] = [];
const spy: MotionComponent<P> = {
  ...pure,
  id: 'spy',
  build: (ctx) => {
    const c = ctx as unknown as { exit?: unknown; look?: { motion: { enterMs: number } } };
    seen.push({
      enterMs: ctx.style.motion.enterMs,
      moveEase: ctx.style.motion.moveEase,
      exit: c.exit,
      lookEnterMs: c.look?.motion.enterMs,
    });
    return { durationMs: ctx.durationMs, seek: () => {}, dispose: () => {} };
  },
};

const components = { pure, spy, 'throws-build': throwsOnBuild, 'throws-seek': throwsOnSeek };

function fakeFonts(loaded = true): FontLoader & { requests: string[] } {
  const requests: string[] = [];
  return {
    requests,
    load: (f) => {
      requests.push(f);
      return Promise.resolve([]);
    },
    check: () => loaded,
    ready: Promise.resolve(),
  };
}

function project(
  slots: RuntimeProject['slots'],
  mode: RuntimeProject['mode'] = 'preview',
): RuntimeProject {
  return {
    width: 1920,
    height: 1080,
    format: '16:9',
    durationMs: 10_000,
    mode,
    style: editorialExplainer,
    slots,
  };
}

function hosts(...ids: string[]) {
  document.body.replaceChildren(
    ...ids.map((id) => {
      const el = document.createElement('div');
      el.id = id;
      return el;
    }),
  );
}

const slot = (id: string, componentId: string, startMs: number, endMs: number, label = 'x') => ({
  id,
  componentId,
  startMs,
  endMs,
  params: { label },
});

const text = (id: string) => document.getElementById(id)?.textContent ?? '';

beforeEach(() => document.body.replaceChildren());

describe('runtime engine: slot timing (spec 09 R4.4)', () => {
  it('builds each clip with its own style and passes fade: false as exit: none', async () => {
    seen.length = 0;
    hosts('a', 'b', 'c');
    const base = editorialExplainer.motion;
    const engine = createEngine(
      project([
        slot('a', 'spy', 0, 2000),
        { ...slot('b', 'spy', 2000, 4000), timing: { speed: 0.5, ease: 'linear' as const } },
        { ...slot('c', 'spy', 4000, 6000), timing: { fade: false } },
      ]),
      { doc: document, components, fonts: fakeFonts() },
    );
    await engine.ready;
    expect(seen).toEqual([
      {
        enterMs: base.enterMs,
        moveEase: base.moveEase,
        exit: undefined,
        lookEnterMs: base.enterMs,
      },
      {
        enterMs: base.enterMs * 2,
        moveEase: 'linear',
        exit: undefined,
        lookEnterMs: base.enterMs * 2,
      },
      { enterMs: base.enterMs, moveEase: base.moveEase, exit: 'none', lookEnterMs: base.enterMs },
    ]);
    // The project's own look is not changed by a clip's timing.
    expect(editorialExplainer.motion.enterMs).toBe(base.enterMs);
  });
});

describe('runtime engine', () => {
  it('loads each font family once, then builds and replays a seek made before ready', async () => {
    hosts('s1');
    const fonts = fakeFonts();
    const engine = createEngine(project([slot('s1', 'pure', 1000, 3000)]), {
      doc: document,
      components,
      fonts,
    });
    engine.seek(1500); // before ready
    expect(text('s1')).toBe('');
    await engine.ready;
    expect(fonts.requests).toEqual(['400 16px "Geist"', '400 16px "Geist Mono"']);
    expect(text('s1')).toBe('x@500|key=1000');
    expect(engine.errors).toEqual([]);
  });

  it('seeks only active slots', async () => {
    hosts('a', 'b');
    const engine = createEngine(
      project([slot('a', 'pure', 0, 2000, 'A'), slot('b', 'pure', 2000, 4000, 'B')]),
      { doc: document, components, fonts: fakeFonts() },
    );
    await engine.ready;
    engine.seek(3000);
    expect(text('b')).toBe('B@1000|key=1000');
    expect(text('a')).toBe('A@0|key=1000'); // untouched since the initial seek(0)
  });

  it('contains a build failure to its slot, with a placeholder in preview', async () => {
    hosts('bad', 'good');
    const engine = createEngine(
      project([slot('bad', 'throws-build', 0, 2000), slot('good', 'pure', 0, 2000, 'G')]),
      { doc: document, components, fonts: fakeFonts() },
    );
    await engine.ready;
    engine.seek(100);
    expect(text('good')).toBe('G@100|key=1000');
    expect(text('bad')).toBe("Couldn't render");
    expect(engine.errors).toEqual([{ slotId: 'bad', phase: 'build', message: 'boom at build' }]);
  });

  it('records a seek failure once and stops seeking that slot', async () => {
    hosts('s');
    const engine = createEngine(project([slot('s', 'throws-seek', 0, 2000)]), {
      doc: document,
      components,
      fonts: fakeFonts(),
    });
    await engine.ready;
    engine.seek(600);
    engine.seek(700);
    engine.seek(800);
    expect(engine.errors).toEqual([{ slotId: 's', phase: 'seek', message: 'boom at seek' }]);
    expect(text('s')).toBe("Couldn't render");
  });

  it('draws no placeholder in render mode', async () => {
    hosts('bad');
    const engine = createEngine(project([slot('bad', 'throws-build', 0, 2000)], 'render'), {
      doc: document,
      components,
      fonts: fakeFonts(),
    });
    await engine.ready;
    expect(text('bad')).toBe('');
    expect(engine.errors).toHaveLength(1);
  });

  it('reports unknown components, invalid params and missing hosts without throwing', async () => {
    hosts('u', 'p');
    const engine = createEngine(
      project([
        slot('u', 'nope', 0, 2000),
        { id: 'p', componentId: 'pure', startMs: 0, endMs: 2000, params: { label: 3 } },
        slot('missing', 'pure', 0, 2000),
      ]),
      { doc: document, components, fonts: fakeFonts() },
    );
    await engine.ready;
    expect(engine.errors.map((e) => [e.slotId, e.phase])).toEqual([
      ['u', 'mount'],
      ['p', 'params'],
      ['missing', 'mount'],
    ]);
  });

  it('clamps the key moment into the slot and warns, and warns on short slots', async () => {
    hosts('k', 'short');
    const engine = createEngine(
      project([
        { ...slot('k', 'pure', 0, 2000), keyMomentMs: 5000 },
        slot('short', 'pure', 3000, 3400),
      ]),
      { doc: document, components, fonts: fakeFonts() },
    );
    await engine.ready;
    engine.seek(10);
    expect(text('k')).toBe('x@10|key=2000');
    expect(engine.warnings.map((w) => w.slotId)).toEqual(['k', 'short']);
  });

  it('collects ctx.warn messages once per slot', async () => {
    hosts('w');
    const engine = createEngine(project([slot('w', 'pure', 0, 2000, 'warn-me')]), {
      doc: document,
      components,
      fonts: fakeFonts(),
    });
    await engine.ready;
    expect(engine.warnings).toEqual([{ slotId: 'w', message: 'label truncated' }]);
  });

  it('records a fonts error when a family is still missing after loading, and still builds', async () => {
    hosts('s');
    const engine = createEngine(project([slot('s', 'pure', 0, 2000)]), {
      doc: document,
      components,
      fonts: fakeFonts(false),
    });
    await engine.ready;
    expect(engine.errors.every((e) => e.slotId === '*' && e.phase === 'fonts')).toBe(true);
    expect(engine.errors).toHaveLength(2);
    expect(text('s')).toBe('x@0|key=1000');
  });

  it('scales the camera wrapper with the pack push-in and seeds each slot from its id', async () => {
    hosts('cam');
    const seeds: number[] = [];
    const seedSpy: MotionComponent<P> = {
      ...pure,
      id: 'seed-spy',
      build: (ctx, p) => {
        seeds.push(ctx.seed);
        return pure.build(ctx, p);
      },
    };
    const engine = createEngine(project([slot('cam', 'seed-spy', 0, 2000)]), {
      doc: document,
      components: { ...components, 'seed-spy': seedSpy },
      fonts: fakeFonts(),
    });
    await engine.ready;
    const cam = document.querySelector<HTMLElement>('#cam > .mp-cam');
    expect(cam?.firstElementChild?.className).toBe('mp-slot-root');
    // The seam slides the wrapper in and out at the edges; the push-in is the scale.
    engine.seek(0);
    expect(cam?.style.transform).toMatch(/scale\([\d.]+\)$/);
    engine.seek(2000);
    expect(cam?.style.transform).toMatch(/scale\([\d.]+\)$/);
    expect(seeds).toEqual([hashString('cam')]);
  });

  it('derives one font request per unique primary family', () => {
    expect(fontRequests(project([]))).toEqual(['400 16px "Geist"', '400 16px "Geist Mono"']);
  });

  it('seams: matched halves, several kinds, a pull into the payoff', () => {
    const slots = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({
      id,
      startMs: i * 3000,
      endMs: i * 3000 + 2900,
      energy: id === 'd' ? 'hype' : undefined,
    }));
    const plan = planSeams(slots, undefined);
    // The exit of one slot and the entrance of the next are the same technique.
    for (let i = 0; i < 4; i++)
      expect(plan.get(slots[i]!.id)?.exit).toEqual(plan.get(slots[i + 1]!.id)?.enter);
    expect(plan.get('d')?.enter.kind).toBe('pull');
    const kinds = new Set([...plan.values()].map((s) => s.enter.kind));
    expect(kinds.size).toBeGreaterThan(1);
    // Rest in the middle; a slide starts offset and mid-fade.
    const slide = {
      enter: { kind: 'slide' as const, dir: 1 as const },
      exit: { kind: 'slide' as const, dir: 1 as const },
    };
    expect(seamState(slide, 1500, 3000, 1920, false)).toEqual({
      x: 0,
      scale: 1,
      opacity: 1,
      blur: 0,
    });
    expect(seamState(slide, 0, 3000, 1920, false).x).toBeCloseTo(1920 * 0.12);
    expect(seamState(slide, 3000, 3000, 1920, false).opacity).toBe(0);
    expect(seamState(slide, 3000, 3000, 1920, true)).toEqual({
      x: 0,
      scale: 1,
      opacity: 1,
      blur: 0,
    });
    // Deterministic.
    expect(planSeams(slots, ['push', 'zoom'])).toEqual(planSeams(slots, ['push', 'zoom']));
  });
});
