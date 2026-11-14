// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { MotionComponent } from '../contract';
import type { RuntimeProject } from '../compiler/types';
import { hashString } from '../core/rng';
import { editorialExplainer } from '../styles';
import { createEngine, fontRequests, type FontLoader } from './engine';

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

const components = { pure, 'throws-build': throwsOnBuild, 'throws-seek': throwsOnSeek };

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
    engine.seek(0);
    expect(cam?.style.transform).toBe('scale(1)');
    engine.seek(2000);
    expect(cam?.style.transform).toBe(`scale(${editorialExplainer.motion.camera.pushIn})`);
    expect(seeds).toEqual([hashString('cam')]);
  });

  it('derives one font request per unique primary family', () => {
    expect(fontRequests(project([]))).toEqual(['400 16px "Geist"', '400 16px "Geist Mono"']);
  });
});
