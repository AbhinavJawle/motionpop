import type { Router } from '@motionpop/ai';
import { describe, expect, it } from 'vitest';
import { createFakeRouter } from '@/lib/ai/fake-router';
import type { Route } from '@/lib/ai/route';
import { LocalCredits } from '@/lib/credits/local-credits';
import { demoProject } from '@/lib/projects/fixture';
import { createEditorStore } from '@/lib/stores/editor';
import { COULDNT_CUSTOM } from '@/lib/slots/custom';
import { applyFilm, makeFilmForProject, type FilmDeps } from './film';
import { BEAT_RETIMED, beatIndexOf, isFilmBeat, rebuildFilmBeat } from './rebuild';
import type { EditorProject, Slot } from '@motionpop/schemas';

const CLOUD: Route = {
  kind: 'cloud',
  mode: 'ONLY_IN_CLOUD',
  allowCloud: false,
  credits: 3,
  insufficient: false,
};

const PASS = async () => ({ fixes: null, blocking: 0, broken: false });
const brokenRouter = {
  run: async () => {
    throw new Error('model down');
  },
} as unknown as Router;

/** A store holding the demo video with its film made (a ready film, the fake router). */
async function filmed(getRouter: () => Promise<Router | null>) {
  const store = createEditorStore(() => 1000);
  store.getState().load(demoProject(0));
  const credits = new LocalCredits(120);
  let n = 0;
  const deps: FilmDeps = {
    store,
    credits,
    getRouter,
    now: () => 5000,
    newKey: () => `rb-key-${n++}-aaaaaaaa`,
    inspect: PASS as never,
  };
  return { store, credits, deps };
}

const fakeRouter = () => createFakeRouter({ latencyMs: 1, sleep: async () => {} });

const firstBeat = (p: EditorProject): Slot => {
  const slot = p.slots.find((s) => s.componentId === 'custom');
  if (!slot) throw new Error('the film has no custom beat');
  return slot;
};

describe('isFilmBeat and beatIndexOf', () => {
  it('knows a film beat and its place in the storyboard', async () => {
    const { store, deps } = await filmed(async () => fakeRouter());
    expect(await makeFilmForProject(deps, CLOUD)).toMatchObject({ outcome: 'ready' });
    const p = store.getState().project!;
    const beat = firstBeat(p);
    expect(isFilmBeat(p, beat)).toBe(true);
    expect(beatIndexOf(p, beat)).toBe(0);
    expect(isFilmBeat(p, { ...beat, skillId: 'data-explainer' })).toBe(false);
    expect(isFilmBeat(demoProject(0), beat)).toBe(false);
    expect(isFilmBeat(null, beat)).toBe(false);
  });

  it('is -1 once the slot words no longer match a beat', async () => {
    const { store, deps } = await filmed(async () => fakeRouter());
    await makeFilmForProject(deps, CLOUD);
    const p = store.getState().project!;
    const beat = firstBeat(p);
    expect(beatIndexOf(p, { ...beat, wordEnd: beat.wordEnd + 1 })).toBe(-1);
  });
});

describe('rebuildFilmBeat', () => {
  it('writes the beat again as a new Rebuilt beat version and spends one custom price', async () => {
    const { store, credits, deps } = await filmed(async () => fakeRouter());
    await makeFilmForProject(deps, CLOUD);
    const beat = firstBeat(store.getState().project!);
    const before = credits.balance()!;
    const r = await rebuildFilmBeat(deps, beat.id, CLOUD);
    expect(r.outcome).toBe('ready');
    expect(before - credits.balance()!).toBe(3);
    const p = store.getState().project!;
    const version = p.versions.find((v) => v.id === r.versionId);
    expect(version?.label).toBe('Rebuilt beat');
    expect(p.slots.find((s) => s.id === beat.id)?.currentVersionId).toBe(r.versionId);
  });

  it('is blocked with BEAT_RETIMED and spends nothing when the beat was retimed', async () => {
    const { store, credits, deps } = await filmed(async () => fakeRouter());
    await makeFilmForProject(deps, CLOUD);
    const beat = firstBeat(store.getState().project!);
    store.getState().exec(
      applyFilm({
        slots: store
          .getState()
          .project!.slots.map((s) => (s.id === beat.id ? { ...s, wordEnd: s.wordEnd + 1 } : s)),
        versions: [],
        film: store.getState().project!.film!,
      }),
    );
    const before = credits.balance();
    const r = await rebuildFilmBeat(deps, beat.id, CLOUD);
    expect(r).toEqual({ outcome: 'blocked', reason: BEAT_RETIMED });
    expect(credits.balance()).toBe(before);
  });

  it('keeps the beat and refunds when the model fails', async () => {
    const { store, credits, deps } = await filmed(async () => fakeRouter());
    await makeFilmForProject(deps, CLOUD);
    const beat = firstBeat(store.getState().project!);
    const before = credits.balance()!;
    const versions = store.getState().project!.versions.length;
    const broken = { ...deps, getRouter: async () => brokenRouter };
    const r = await rebuildFilmBeat(broken, beat.id, CLOUD);
    expect(r).toMatchObject({ outcome: 'kept', reason: COULDNT_CUSTOM });
    expect(credits.balance()).toBe(before);
    expect(store.getState().project!.versions.length).toBe(versions);
  });
});
