// @vitest-environment happy-dom
import {
  FilmCancelled,
  makeFilm,
  type FilmResult,
  type Router,
  type CriticVerdict,
} from '@motionpop/ai';
import { KIT_DOC, kitExample, lintCustom, lintProp } from '@motionpop/motion';
import { timeBeats, type EditorProject, type Slot } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import { createFakeRouter } from '@/lib/ai/fake-router';
import type { Route } from '@/lib/ai/route';
import { LocalCredits } from '@/lib/credits/local-credits';
import { demoProject } from '@/lib/projects/fixture';
import { createEditorStore } from '@/lib/stores/editor';
import {
  COULDNT_FILM,
  FILM_TOO_LONG,
  applyFilm,
  filmBlockedReason,
  filmCost,
  filmSlots,
  makeFilmForProject,
  type FilmDeps,
} from './film';

const CLOUD: Route = {
  kind: 'cloud',
  mode: 'ONLY_IN_CLOUD',
  allowCloud: false,
  credits: 5,
  insufficient: false,
};

const PASS: (...args: unknown[]) => Promise<CriticVerdict> = async () => ({
  fixes: null,
  blocking: 0,
  broken: false,
});

/** A demo project, cut down to the words the test is about. */
function projectWithWords(n: number): EditorProject {
  const p = demoProject(0);
  return { ...p, transcript: { ...p.transcript, words: p.transcript.words.slice(0, n) } };
}

/** The demo's film as `makeFilm` builds it with the fake router and a critic that passes. */
async function madeFilm(project: EditorProject): Promise<FilmResult> {
  const words = project.transcript.words.map((w) => ({
    text: w.text,
    startMs: w.startMs,
    endMs: w.endMs,
  }));
  return makeFilm(
    {
      words,
      durationMs: project.durationMs,
      format: project.format,
      look: { name: 'Editorial', description: 'plain' },
    },
    {
      router: createFakeRouter({ latencyMs: 1, sleep: async () => {} }),
      lint: lintCustom,
      lintProp,
      kitDoc: KIT_DOC,
      example: kitExample(),
      inspect: PASS as never,
      concurrency: 6,
    },
  );
}

/** A router that fails every call, the way a broken model connection does. */
const brokenRouter = {
  run: async () => {
    throw new Error('model down');
  },
} as unknown as Router;

function setup(getRouter: () => Promise<Router | null>, over: Partial<FilmDeps> = {}) {
  const store = createEditorStore(() => 1000);
  const project = demoProject(0);
  store.getState().load(project);
  const credits = new LocalCredits(120);
  let n = 0;
  const deps: FilmDeps = {
    store,
    credits,
    getRouter,
    now: () => 5000,
    newKey: () => `film-key-${n++}-aaaaaaaa`,
    doc: undefined,
    inspect: PASS as never,
    ...over,
  };
  return { store, credits, deps, project };
}

describe('filmCost', () => {
  it('is 5 credits per started 30 s', () => {
    expect(filmCost({ durationMs: 18_000 })).toBe(5);
    expect(filmCost({ durationMs: 30_000 })).toBe(5);
    expect(filmCost({ durationMs: 45_000 })).toBe(10);
  });
});

describe('filmBlockedReason', () => {
  it('says why a film cannot be made', () => {
    expect(filmBlockedReason(null)).toBe('Open a project first');
    expect(filmBlockedReason(projectWithWords(2))).toBe('Needs a voiceover with words');
    expect(filmBlockedReason({ ...demoProject(0), durationMs: 200_000 })).toBe(FILM_TOO_LONG);
    expect(filmBlockedReason(demoProject(0))).toBeNull();
  });
});

describe('filmSlots', () => {
  it('turns a built beat into a custom film slot with a Film version', async () => {
    const project = demoProject(0);
    const film = await madeFilm(project);
    const made = filmSlots(project, film, { now: 7, id: (i) => `film-x-${i + 1}` });
    expect(made.built).toBe(film.beats.length);
    expect(made.fallbacks).toBe(0);
    const first = made.slots[0] as Slot;
    expect(first).toMatchObject({
      componentId: 'custom',
      skillId: 'film',
      status: 'ready',
      id: 'film-x-1',
    });
    const version = made.versions.find((v) => v.id === first.currentVersionId);
    expect(version?.label).toBe('Film');
  });

  it('draws a quick-mode stand-in inside the span of a beat that failed', async () => {
    const project = demoProject(0);
    const film = await madeFilm(project);
    const beat = film.beats[1];
    if (!beat) throw new Error('the fake film has no second beat');
    const broken: FilmResult = {
      ...film,
      beats: film.beats.map((b, i) => (i === 1 ? { ...b, params: null } : b)),
    };
    const made = filmSlots(project, broken, { now: 7, id: (i) => `film-x-${i + 1}` });
    expect(made.built).toBe(film.beats.length - 1);
    expect(made.fallbacks).toBeLessThanOrEqual(1);
    const stand = made.slots.find((s) => s.id === 'film-x-2');
    if (stand) {
      expect(stand.startMs).toBeGreaterThanOrEqual(beat.beat.startMs);
      expect(stand.endMs).toBeLessThanOrEqual(beat.beat.endMs);
      expect(stand.componentId).not.toBe('custom');
    }
  });
});

describe('applyFilm', () => {
  it('replaces the slots as one undoable step and sets the film', async () => {
    const project = demoProject(0);
    const film = await madeFilm(project);
    const made = filmSlots(project, film, { now: 7, id: (i) => `film-x-${i + 1}` });
    const { store } = setup(async () => null);
    const before = structuredClone(store.getState().project!);
    const ok = store.getState().exec(
      applyFilm({
        slots: made.slots,
        versions: made.versions,
        film: { storyboard: film.storyboard, props: film.props, madeAt: 7 },
      }),
    );
    expect(ok).toBe(true);
    expect(store.getState().project!.slots.map((s) => s.id)).toEqual(made.slots.map((s) => s.id));
    expect(store.getState().project!.film?.madeAt).toBe(7);
    store.getState().undo();
    const after = store.getState().project!;
    expect(after.slots).toEqual(before.slots);
    expect(after.versions).toEqual(before.versions);
    expect(after.film).toBeUndefined();
  });

  it('is rejected when the new slots overlap', async () => {
    const project = demoProject(0);
    const film = await madeFilm(project);
    const made = filmSlots(project, film, { now: 7, id: (i) => `film-x-${i + 1}` });
    const first = made.slots[0] as Slot;
    const { store } = setup(async () => null);
    const overlapping = [first, { ...first, id: 'film-clash', startMs: first.startMs }];
    const before = store.getState().project!.slots;
    const ok = store.getState().exec(
      applyFilm({
        slots: overlapping,
        versions: made.versions,
        film: { storyboard: film.storyboard, props: film.props, madeAt: 7 },
      }),
    );
    expect(ok).toBe(false);
    expect(store.getState().project!.slots).toEqual(before);
  });
});

describe('makeFilmForProject', () => {
  it('makes the film: spends once, replaces the slots and saves the storyboard', async () => {
    const { deps, credits, store } = setup(async () =>
      createFakeRouter({ latencyMs: 1, sleep: async () => {} }),
    );
    const r = await makeFilmForProject(deps, CLOUD);
    expect(r.outcome).toBe('ready');
    expect(credits.balance()).toBe(120 - filmCost(demoProject(0)));
    const p = store.getState().project!;
    expect(p.slots.length).toBeGreaterThan(0);
    expect(p.slots.every((s) => s.id.startsWith('film-'))).toBe(true);
    expect(p.film).toBeDefined();
    expect(timeBeats(p.film!.storyboard, p.transcript.words, p.durationMs).length).toBe(
      p.film!.storyboard.beats.length,
    );
  });

  it('refunds the credits and changes nothing when the model throws', async () => {
    const { deps, credits, store } = setup(async () => brokenRouter);
    const before = structuredClone(store.getState().project!);
    const r = await makeFilmForProject(deps, CLOUD);
    expect(r).toMatchObject({ outcome: 'failed', reason: COULDNT_FILM });
    expect(credits.balance()).toBe(120);
    expect(store.getState().project!.slots).toEqual(before.slots);
    expect(store.getState().project!.film).toBeUndefined();
  });

  it('stops, refunds and reports cancelled when the creator cancels', async () => {
    const { deps, credits } = setup(
      async () => createFakeRouter({ latencyMs: 1, sleep: async () => {} }),
      { cancelled: () => true },
    );
    const r = await makeFilmForProject(deps, CLOUD);
    expect(r.outcome).toBe('cancelled');
    expect(credits.balance()).toBe(120);
    expect(FilmCancelled).toBeDefined();
  });

  it('is blocked, with nothing spent, when the route is disabled', async () => {
    const { deps, credits } = setup(async () => createFakeRouter({ latencyMs: 1 }));
    const r = await makeFilmForProject(deps, {
      kind: 'disabled',
      reason: 'Needs connection',
    });
    expect(r).toEqual({ outcome: 'blocked', reason: 'Needs connection' });
    expect(credits.balance()).toBe(120);
  });

  it('syncs gapless project.video.stages for video projects and restores cleanly on undo', async () => {
    const { deps, store } = setup(async () =>
      createFakeRouter({ latencyMs: 1, sleep: async () => {} }),
    );
    const base = store.getState().project!;
    store.getState().load({
      ...base,
      video: {
        src: 'idb:vid-1',
        width: 1920,
        height: 1080,
        originalDurationMs: base.durationMs,
        cuts: [],
        punchIns: [],
        defaultOverlayAnchor: 'top-right',
      },
    });
    const r = await makeFilmForProject(deps, CLOUD);
    expect(r.outcome).toBe('ready');
    const after = store.getState().project!;
    expect(after.video?.stages?.length).toBe(after.slots.length);
    expect(after.video?.stages?.[0]?.startMs).toBe(0);
    expect(after.video?.stages?.[after.video.stages.length - 1]?.endMs).toBe(after.durationMs);
    store.getState().undo();
    expect(store.getState().project?.video?.stages).toBeUndefined();
  });
});
