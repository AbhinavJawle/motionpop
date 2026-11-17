import { type FilmWord, type Storyboard, type StoryBeat } from '@motionpop/schemas';
import { describe, expect, it } from 'vitest';
import type { Router } from '../router';
import type { FilmBuildInput, FilmBuildOutput } from '../tasks/film';
import { rebuildBeat, type FilmDeps, type FilmInput } from './make-film';

/** Twelve words, 600 ms apart: three beats of four words each. */
const words: FilmWord[] = Array.from({ length: 12 }, (_, i) => ({
  text: `wd${i}`,
  startMs: i * 600,
  endMs: i * 600 + 500,
}));
const DURATION_MS = 7200;

const input: FilmInput = {
  words,
  durationMs: DURATION_MS,
  format: '16:9',
  look: { name: 'Field notes', description: 'paper and ink' },
};

function boardOf(): Storyboard {
  const beat = (i: number, wordStart: number, kind: StoryBeat['seam']['kind']): StoryBeat => ({
    id: `x${i}`,
    wordStart,
    wordEnd: wordStart + 3,
    lead: 'picture',
    idea: `The stored picture of beat ${i}`,
    text: ['A label'],
    landsOn: wordStart,
    staging: 'the picture arrives on the voice',
    seam: { kind, note: 'the same object carries the cut' },
  });
  return {
    title: 'A film',
    thesis: 'One idea that holds',
    world: 'A harbour at dawn',
    carrier: 'the ship',
    props: [],
    beats: [beat(1, 0, 'push'), beat(2, 4, 'lift'), beat(3, 8, 'zoom')],
  };
}

interface Fake {
  router: Router;
  tasks: string[];
  builds: FilmBuildInput[];
}

/** A router that answers only `film.build`, and records every task it was asked for. */
function fakeRouter(): Fake {
  const fake: Fake = { router: undefined as unknown as Router, tasks: [], builds: [] };
  fake.router = {
    run: async (task: { id: string }, arg: unknown) => {
      fake.tasks.push(task.id);
      if (task.id !== 'film.build') throw new Error(`unexpected task ${task.id}`);
      const call = arg as FilmBuildInput;
      fake.builds.push(call);
      const output: FilmBuildOutput = {
        title: 'Beat',
        html: `b${call.beat.index}`,
        css: '',
        script: 'return { seek() {} };',
        keyMomentMs: 0,
      };
      return {
        output,
        ranOn: 'cloud',
        model: 'fake',
        costCredits: 0,
        latencyMs: 0,
        attempts: 1,
      };
    },
  } as unknown as Router;
  return fake;
}

const depsFor = (
  router: Router,
  over: Partial<FilmDeps & { props: Record<string, string> }> = {},
) => ({
  router,
  lint: () => [],
  lintProp: () => [],
  kitDoc: 'THE KIT',
  example: { html: '<div></div>', css: '', script: 'return { seek() {} };' },
  storyboard: boardOf(),
  props: {},
  ...over,
});

describe('rebuildBeat', () => {
  it('builds only the asked beat, with one film.build call and no director or props call', async () => {
    const fake = fakeRouter();
    const res = await rebuildBeat(input, depsFor(fake.router), 1);
    expect(fake.tasks).toEqual(['film.build']);
    expect(fake.builds).toHaveLength(1);
    expect(fake.builds[0]?.beat.index).toBe(1);
    expect(res.beat.id).toBe('b2');
    expect(res.params?.html).toBe('b1');
    expect(res.calls).toBe(1);
  });

  it('uses the props it was given', async () => {
    const fake = fakeRouter();
    const svg = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
    const res = await rebuildBeat(input, depsFor(fake.router, { props: { ship: svg } }), 0);
    expect(res.params?.props).toEqual({ ship: svg });
  });

  it('replaces the beat picture when the idea has at least 8 characters', async () => {
    const fake = fakeRouter();
    await rebuildBeat(input, depsFor(fake.router), 2, '  A new picture for the last beat  ');
    expect(fake.builds[0]?.beat.idea).toBe('A new picture for the last beat');
    // The other beats keep the storyboard's picture.
    expect(fake.builds[0]?.seamIn?.from).toBe('The stored picture of beat 2');
  });

  it('keeps the storyboard picture when the idea is shorter than 8 characters', async () => {
    const fake = fakeRouter();
    await rebuildBeat(input, depsFor(fake.router), 2, 'tiny');
    expect(fake.builds[0]?.beat.idea).toBe('The stored picture of beat 3');
  });

  it('throws RangeError for a beat index out of range', async () => {
    const fake = fakeRouter();
    await expect(rebuildBeat(input, depsFor(fake.router), 5)).rejects.toBeInstanceOf(RangeError);
    expect(fake.tasks).toEqual([]);
  });
});
